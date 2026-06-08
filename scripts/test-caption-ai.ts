/**
 * Run: npx tsx --env-file=.env.local scripts/test-caption-ai.ts
 * Compares keyword matching vs OpenAI LLM models for caption classification.
 */

import OpenAI from 'openai'
import { classifyByCaption, VALID_PILLARS } from '@/lib/classify-pillar'
import { createClient } from '@supabase/supabase-js'

const MODELS = ['gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4o']

const CAPTION_PROMPT = `You are classifying Instagram posts from Honda car dealers in Indonesia.
Classify the following caption into exactly one of these content pillars:

- Product Value & Information: car models, specs, features, pricing, test drive, service/maintenance, DP/cicilan/kredit
- Dealer Credibility: staff/team, holiday greetings, showroom info, awards, operational hours, CSR activities
- Customer Story: customer testimonials, car handover/delivery, buyer reviews, happy customers
- Promo Activation: promotions, discounts, cashback, giveaways, events, trade-in offers, 0% interest
- Negative: ONLY for truly harmful or off-brand content — complaints about the job, clickbait with no car, mocking customers, competitor bashing. Do NOT use Negative just because the post is generic.

Reply with ONLY the pillar name, nothing else.

Caption:
`

async function classifyWithModel(client: OpenAI, model: string, caption: string): Promise<string> {
  const start = Date.now()
  const response = await client.chat.completions.create({
    model,
    max_tokens: 50,
    temperature: 0,
    messages: [{ role: 'user', content: CAPTION_PROMPT + caption }],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  const ms = Date.now() - start
  const result = (VALID_PILLARS as readonly string[]).includes(text) ? text : `INVALID: ${text}`
  return `${result} (${ms}ms)`
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Fetch honda.arta posts from Supabase
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('post_id, caption, pillar')
    .eq('account_username', 'honda.arta')
    .order('post_date', { ascending: false })

  if (!posts?.length) {
    console.log('No posts found for honda.arta')
    return
  }

  console.log(`Testing ${posts.length} honda.arta captions across ${MODELS.length} models`)
  console.log('─'.repeat(80))

  for (const post of posts) {
    const caption = post.caption || ''
    const snippet = caption.slice(0, 70).replace(/\n/g, ' ')
    console.log(`\nCaption: "${snippet}..."`)
    console.log(`  Keyword match : ${post.pillar} (stored)`)

    for (const model of MODELS) {
      try {
        const result = await classifyWithModel(client, model, caption)
        const [pillar] = result.split(' (')
        const match = pillar === post.pillar ? '✓' : '≠'
        console.log(`  ${model.padEnd(14)}: ${result} ${match}`)
      } catch (err: any) {
        console.log(`  ${model.padEnd(14)}: ERROR — ${err.message}`)
      }
    }
  }

  console.log('\n' + '─'.repeat(80))
  console.log('Done!')
}

main().catch(console.error)
