import OpenAI from 'openai'

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

export const VALID_PILLARS = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
] as const

export type PillarResult = typeof VALID_PILLARS[number]

// ─── Shared prompt blocks ─────────────────────────────────────────────────────

const POSITIVE_PILLARS = `Pillar konten:
- Product Value & Information: model mobil, spesifikasi, fitur, harga, DP/cicilan/kredit, test drive, tips servis/perawatan
- Dealer Credibility: foto tim/staf, ucapan hari raya, info showroom, penghargaan, jam operasional, kegiatan CSR/komunitas
- Customer Story: testimoni customer, serah terima/delivery unit, review pembeli, customer bahagia dengan mobilnya
- Promo Activation: promo, diskon, cashback, giveaway, event, penawaran tukar tambah, bunga 0%`

const NEGATIVE_CRITERIA = `- Negative: HANYA untuk konten yang benar-benar berbahaya atau tidak sesuai brand, sesuai salah satu dari 6 kategori ini:
  1. Internal Complaint / Self-Downgrading — staf mengeluh soal pekerjaan/target ("capek jadi sales", "3 bulan belum closing", "sales dikejar target terus")
  2. Clickbait / Viral tanpa Value — video trend/joget tanpa menampilkan mobil, meme random tidak terkait otomotif, caption tidak ada hubungannya dengan produk
  3. Negative Customer Handling — menyindir customer, share komplain customer tanpa solusi, caption yang menyalahkan customer
  4. Unprofessional Content — bahasa kasar atau terlalu slang, curhat masalah pekerjaan, visual lingkungan kerja yang tidak rapi secara negatif
  5. Competitor Bashing — secara langsung menjatuhkan brand lain ("mobil brand X jelek", "jangan beli yang lain")
  6. High Risk Content (Brand Safety) — SARA/hate speech, informasi hoaks, konten kekerasan atau tidak pantas
  JANGAN gunakan Negative untuk konten yang generik, ambigu, atau sulit diklasifikasi — pilih pillar positif yang paling mendekati.`

const PILLAR_DEFINITIONS = `${POSITIVE_PILLARS}
${NEGATIVE_CRITERIA}`

// ─── Prompts ──────────────────────────────────────────────────────────────────

const CAPTION_AI_PROMPT = `Kamu mengklasifikasikan postingan Instagram dari dealer Honda di Indonesia.

${PILLAR_DEFINITIONS}

Jawab dengan HANYA nama pillar, tidak ada yang lain.

Caption:
`

const COMBINED_PROMPT = `Kamu mengklasifikasikan postingan Instagram dari dealer Honda di Indonesia.
Kamu memiliki teks caption DAN gambar postingan. Gunakan keduanya untuk klasifikasi terbaik.

${PILLAR_DEFINITIONS}

Jawab dengan HANYA nama pillar, tidak ada yang lain.`

// ─── Caption-only fallback (gpt-4o-mini) ─────────────────────────────────────

export async function classifyByCaptionAI(caption: string): Promise<PillarResult> {
  if (!caption?.trim()) return 'Negative'
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 50,
    temperature: 0,
    messages: [{ role: 'user', content: CAPTION_AI_PROMPT + caption }],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  return (VALID_PILLARS as readonly string[]).includes(text) ? (text as PillarResult) : 'Negative'
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
            text: `${COMBINED_PROMPT}\n\nCaption: ${caption || '(tidak ada caption)'}`,
          },
        ],
      },
    ],
  })
  const text = response.choices[0]?.message?.content?.trim() ?? ''
  return (VALID_PILLARS as readonly string[]).includes(text) ? (text as PillarResult) : 'Negative'
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
//
// Always uses gpt-4o-mini with caption + image when an image is available.
// Falls back to caption-only gpt-4o-mini if no image or vision fetch fails.

export async function classifyPillar(
  caption: string,
  imageUrl: string | null,
): Promise<{ pillar: PillarResult; source: 'combined-vision' | 'caption-ai' }> {
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

