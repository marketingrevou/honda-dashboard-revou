// Deno port of lib/pillar-config.ts. The pillar SET is the compile-time contract
// (tied to DB values + UI labels); the DESCRIPTIONS live in the Supabase
// `pillar_config` table so they can be edited without a redeploy. Descriptions
// feed the AI prompt, so editing a row changes classification behaviour.
//
// Difference from the Next.js version: getPillarDefinitions() takes the supabase
// client as an argument instead of importing a shared singleton, so this module
// stays free of Edge-Function env wiring.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const VALID_PILLARS = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
] as const

export type PillarResult = typeof VALID_PILLARS[number]

// Hardcoded fallback — used only if the Supabase fetch fails or a row is missing.
export const PILLAR_DESCRIPTIONS_FALLBACK: Record<PillarResult, string> = {
  'Product Value & Information':
    'model mobil, spesifikasi, fitur, harga, DP/cicilan/kredit, test drive, tips servis/perawatan',
  'Dealer Credibility':
    'foto tim/staf, ucapan hari raya, info showroom, penghargaan, jam operasional, kegiatan CSR/komunitas',
  'Customer Story':
    'testimoni customer, serah terima/delivery unit, review pembeli, customer bahagia dengan mobilnya',
  'Promo Activation':
    'promo, diskon, cashback, giveaway, event, penawaran tukar tambah, bunga 0%',
  'Negative': `HANYA untuk konten yang benar-benar berbahaya atau tidak sesuai brand, sesuai salah satu dari 6 kategori ini:
  1. Internal Complaint / Self-Downgrading — staf mengeluh soal pekerjaan/target ("capek jadi sales", "3 bulan belum closing", "sales dikejar target terus")
  2. Clickbait / Viral tanpa Value — video trend/joget tanpa menampilkan mobil, meme random tidak terkait otomotif, caption tidak ada hubungannya dengan produk
  3. Negative Customer Handling — menyindir customer, share komplain customer tanpa solusi, caption yang menyalahkan customer
  4. Unprofessional Content — bahasa kasar atau terlalu slang, curhat masalah pekerjaan, visual lingkungan kerja yang tidak rapi secara negatif
  5. Competitor Bashing — secara langsung menjatuhkan brand lain ("mobil brand X jelek", "jangan beli yang lain")
  6. High Risk Content (Brand Safety) — SARA/hate speech, informasi hoaks, konten kekerasan atau tidak pantas
  JANGAN gunakan Negative untuk konten yang generik, ambigu, atau sulit diklasifikasi — pilih pillar positif yang paling mendekati.`,
}

// Descriptions are cached for the life of the isolate: a batch run hits Supabase
// once. A cold start picks up edits made in the Table Editor.
let descriptionsCache: Record<PillarResult, string> | null = null

async function getPillarDescriptions(
  supabase: SupabaseClient,
): Promise<Record<PillarResult, string>> {
  if (descriptionsCache) return descriptionsCache

  try {
    const { data, error } = await supabase
      .from('pillar_config')
      .select('pillar, description')
    if (error) throw error

    const byPillar = new Map(
      (data ?? []).map((r: { pillar: string; description: string }) => [r.pillar, r.description]),
    )
    const merged = { ...PILLAR_DESCRIPTIONS_FALLBACK }
    for (const pillar of VALID_PILLARS) {
      const desc = byPillar.get(pillar)
      if (typeof desc === 'string' && desc.trim()) merged[pillar] = desc
    }
    descriptionsCache = merged
    return merged
  } catch {
    return PILLAR_DESCRIPTIONS_FALLBACK
  }
}

export async function getPillarDefinitions(supabase: SupabaseClient): Promise<string> {
  const descriptions = await getPillarDescriptions(supabase)

  const positivePillars = `Pillar konten:
${VALID_PILLARS.filter((p) => p !== 'Negative')
  .map((p) => `- ${p}: ${descriptions[p]}`)
  .join('\n')}`

  const negativeCriteria = `- Negative: ${descriptions['Negative']}`

  return `${positivePillars}
${negativeCriteria}`
}
