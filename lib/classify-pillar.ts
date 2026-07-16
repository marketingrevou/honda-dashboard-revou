import OpenAI from 'openai'
import { getPillarDefinitions, VALID_PILLARS } from './pillar-config'
import type { PillarResult } from './pillar-config'

// The pillar set lives in lib/pillar-config.ts; the descriptions live in the
// Supabase `pillar_config` table (edit via the Table Editor) and are fetched by
// getPillarDefinitions(). Re-exported here so existing importers of
// classify-pillar keep working.
export { VALID_PILLARS } from './pillar-config'
export type { PillarResult } from './pillar-config'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const PILLAR_KEYWORDS: Record<string, string[]> = {
  'Product Value & Information': [
    'brv', 'hrv', 'wrv', 'crv', 'brio', 'city', 'accord', 'odyssey', 'jazz',
    'civic', 'mobilio', 'br-v', 'hr-v', 'wr-v', 'cr-v', 'e:hev', 'ehev',
    'hybrid', 'fitur', 'spesifikasi', 'specs', 'test drive', 'testdrive',
    'mesin', 'engine', 'bbm', 'bahan bakar', 'konsumsi', 'torsi', 'transmisi',
    'cvt', 'tips', 'perawatan', 'servis', 'service', 'bengkel', 'ganti oli',
    'harga', 'price', 'otr', 'booking', 'indent', 'dp', 'cicilan', 'kredit',
    'sensor', 'honda sensing', 'ground clearance', 'kapasitas', 'bagasi',
  ],
  'Dealer Credibility': [
    'tim', 'team', 'mekanik', 'sales advisor', 'showroom', 'dealer',
    'hari nasional', 'hari buruh', 'hari kemerdekaan', 'hari raya',
    'lebaran', 'idul', 'natal', 'tahun baru', 'anniversary',
    'operasional', 'tutup', 'buka', 'jam operasional',
    'penghargaan', 'award', 'terbaik', 'kepercayaan',
    'kenalan', 'profil', 'about us',
  ],
  'Customer Story': [
    'testimoni', 'testimonial', 'customer', 'pelanggan', 'pembeli',
    'serah terima', 'delivery', 'terima kunci', 'ambil unit',
    'review', 'ulasan', 'pengalaman', 'cerita', 'story',
    'puas', 'satisfied', 'rekomen', 'recommend',
  ],
  'Promo Activation': [
    'promo', 'diskon', 'discount', 'cashback', 'bonus',
    'quiz', 'kuis', 'giveaway', 'hadiah', 'prize', 'undian',
    'event', 'pameran', 'exhibition', 'kontes', 'lomba',
    'free', 'gratis', 'voucher', 'merchandise', 'gift',
    'menang', 'pemenang', 'winner',
  ],
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
// Built per-call from getPillarDefinitions() (descriptions fetched from Supabase,
// memoised per process).

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

export async function classifyByCaptionAI(caption: string): Promise<PillarResult> {
  // No caption text to classify from — this is not a Negative signal, it's just
  // unclassifiable by text. Route to Others (caller should have tried vision first).
  if (!caption?.trim()) return 'Others'
  const definitions = await getPillarDefinitions()
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

// ─── Step 2: Combined caption + image (gpt-4o-mini) ──────────────────────────

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mediaType: string }> {
  // Instagram CDN URLs are auth-gated — must fetch ourselves before sending to OpenAI
  const imgRes = await fetch(imageUrl)
  const buffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mediaType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  return { base64, mediaType }
}

export async function classifyWithCombinedAnalysis(
  caption: string,
  imageUrl: string,
): Promise<PillarResult> {
  const { base64, mediaType } = await fetchImageAsBase64(imageUrl)
  const definitions = await getPillarDefinitions()
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
//
// Always uses gpt-4o-mini with caption + image when an image is available.
// Falls back to caption-only gpt-4o-mini if no image or vision fetch fails.

export async function classifyPillar(
  caption: string,
  imageUrl: string | null,
): Promise<{ pillar: PillarResult; source: 'combined-vision' | 'caption-ai' }> {
  // No caption → Others, unconditionally (don't attempt classification).
  if (!caption?.trim()) return { pillar: 'Others', source: 'caption-ai' }

  if (imageUrl) {
    try {
      const pillar = await classifyWithCombinedAnalysis(caption, imageUrl)
      return { pillar, source: 'combined-vision' }
    } catch {
      // image fetch or vision call failed — fall through to caption-only
    }
  }

  const pillar = await classifyByCaptionAI(caption)
  return { pillar, source: 'caption-ai' }
}

