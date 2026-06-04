import Anthropic from '@anthropic-ai/sdk'

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

export const VALID_PILLARS = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
] as const

export type PillarResult = typeof VALID_PILLARS[number]

export function classifyByCaption(caption: string): PillarResult {
  if (!caption) return 'Negative'
  const lower = caption.toLowerCase()
  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return pillar as PillarResult
  }
  return 'Negative'
}

const VISION_PROMPT = `This is an Instagram post image from a Honda car dealer in Indonesia.
Classify this image into exactly one of these content pillars:
- Product Value & Information: car models, specs, features, pricing, test drive, service/maintenance
- Dealer Credibility: staff/team photos, holiday greetings, showroom, awards, operational info, CSR/community activities
- Customer Story: customer testimonials, car handover/delivery, buyer reviews, happy customers with their car
- Promo Activation: promotions, discounts, cashback, giveaways, events, trade-in offers, 0% interest
- Negative: ONLY for content that is harmful or off-brand — internal complaints about the job ("capek jadi sales", "belum closing"), clickbait/dance trends with no car shown, mocking customers, unprofessional behavior, competitor bashing, or brand-safety risks (hate speech, hoax, inappropriate content). Do NOT use Negative just because the post is generic or hard to classify — assign the closest positive pillar instead.

Reply with ONLY the pillar name, nothing else.`

export async function classifyWithVision(
  client: Anthropic,
  imageUrl: string,
): Promise<PillarResult> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: VISION_PROMPT },
        ],
      },
    ],
  })
  const text = (message.content[0] as { type: string; text: string }).text.trim()
  return (VALID_PILLARS as readonly string[]).includes(text) ? (text as PillarResult) : 'Negative'
}

export async function classifyPillarWithVision(
  client: Anthropic,
  caption: string,
  imageUrl: string | null,
): Promise<PillarResult> {
  const captionResult = classifyByCaption(caption)
  if (captionResult !== 'Negative') return captionResult
  if (!imageUrl) return 'Negative'
  try {
    return await classifyWithVision(client, imageUrl)
  } catch {
    return 'Negative'
  }
}
