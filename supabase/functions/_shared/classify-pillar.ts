// Deno port of lib/classify-pillar.ts. Always uses gpt-4o-mini with caption +
// image when an image is available; falls back to caption-only if no image or
// the vision fetch fails.
//
// Deno changes from the Next.js version:
//   • OpenAI via `npm:openai`.
//   • Buffer.from(...).toString('base64') → encodeBase64(Uint8Array) from Deno std.
//   • getPillarDefinitions() takes the supabase client (see pillar-config.ts).

import OpenAI from 'npm:openai@4'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { getPillarDefinitions, VALID_PILLARS, type PillarResult } from './pillar-config.ts'

export { VALID_PILLARS } from './pillar-config.ts'
export type { PillarResult } from './pillar-config.ts'

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

const captionAiPrompt = (definitions: string) =>
  `Kamu mengklasifikasikan postingan Instagram dari dealer Honda di Indonesia.

${definitions}

Jawab dengan HANYA nama pillar, tidak ada yang lain.

Caption:
`

const combinedPrompt = (definitions: string) =>
  `Kamu mengklasifikasikan postingan Instagram dari dealer Honda di Indonesia.
Kamu memiliki teks caption DAN gambar postingan. Gunakan keduanya untuk klasifikasi terbaik.

${definitions}

Jawab dengan HANYA nama pillar, tidak ada yang lain.`

// ─── Caption-only fallback (gpt-4o-mini) ─────────────────────────────────────

export async function classifyByCaptionAI(
  supabase: SupabaseClient,
  caption: string,
): Promise<PillarResult> {
  // No caption text to classify from — this is not a Negative signal, it's just
  // unclassifiable by text. Route to Others (caller should have tried vision first).
  if (!caption?.trim()) return 'Others'
  const definitions = await getPillarDefinitions(supabase)
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 50,
    temperature: 0,
    messages: [{ role: 'user', content: captionAiPrompt(definitions) + caption }],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  // Unrecognized AI output → couldn't classify → Others (not Negative).
  return (VALID_PILLARS as readonly string[]).includes(text) ? (text as PillarResult) : 'Others'
}

// ─── Combined caption + image (gpt-4o-mini) ──────────────────────────────────

async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: string }> {
  // Instagram CDN URLs are auth-gated — must fetch ourselves before sending to OpenAI.
  const imgRes = await fetch(imageUrl)
  const buffer = await imgRes.arrayBuffer()
  const base64 = encodeBase64(new Uint8Array(buffer))
  const mediaType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  return { base64, mediaType }
}

export async function classifyWithCombinedAnalysis(
  supabase: SupabaseClient,
  caption: string,
  imageUrl: string,
): Promise<PillarResult> {
  const { base64, mediaType } = await fetchImageAsBase64(imageUrl)
  const definitions = await getPillarDefinitions(supabase)
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 50,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64}`, detail: 'low' },
          },
          {
            type: 'text',
            text: `${combinedPrompt(definitions)}\n\nCaption: ${caption || '(tidak ada caption)'}`,
          },
        ],
      },
    ],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  // Unrecognized AI output → couldn't classify → Others (not Negative).
  return (VALID_PILLARS as readonly string[]).includes(text) ? (text as PillarResult) : 'Others'
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function classifyPillar(
  supabase: SupabaseClient,
  caption: string,
  imageUrl: string | null,
): Promise<{ pillar: PillarResult; source: 'combined-vision' | 'caption-ai' }> {
  // No caption → Others, unconditionally (don't attempt classification).
  if (!caption?.trim()) return { pillar: 'Others', source: 'caption-ai' }

  if (imageUrl) {
    try {
      const pillar = await classifyWithCombinedAnalysis(supabase, caption, imageUrl)
      return { pillar, source: 'combined-vision' }
    } catch {
      // image fetch or vision call failed — fall through to caption-only
    }
  }

  const pillar = await classifyByCaptionAI(supabase, caption)
  return { pillar, source: 'caption-ai' }
}
