// ─────────────────────────────────────────────────────────────────────────────
// PILLAR CONFIG — the pillar set and their descriptions.
//
// THE PILLAR SET (VALID_PILLARS / PillarResult) lives here in code: it's the
// compile-time contract tied to DB values and UI labels. Renaming or adding a
// pillar is a code change.
//
// THE DESCRIPTIONS now live in Supabase (table `pillar_config`), so they can be
// edited via the Supabase Table Editor without a code change or redeploy. The
// descriptions are fed into the AI prompt, so editing a row changes
// classification behaviour everywhere: every scrape, the reclassify API, and all
// backfill scripts read from here.
//
// HOW TO EDIT A DESCRIPTION:
//   • Open the `pillar_config` table in the Supabase Table Editor.
//   • Edit the `description` cell for the pillar you want to reword.
//   • Keep the `pillar` value matching one of VALID_PILLARS below — a row whose
//     pillar isn't in the set is ignored, and a missing row falls back to the
//     hardcoded text in this file.
//
// FALLBACK: if the Supabase fetch fails (or a pillar row is missing), we fall
// back to PILLAR_DESCRIPTIONS_FALLBACK below so classification never breaks from
// a DB hiccup. Keep that constant roughly in sync with the table as a safety net.
//
// AFTER EDITING:
//   New posts use the new descriptions automatically (cached per process — a
//   restart picks up changes). To re-apply them to posts already in the
//   database, run:  npx tsx scripts/reclassify-all.ts
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

export const VALID_PILLARS = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
  'Others',
] as const

export type PillarResult = typeof VALID_PILLARS[number]

// Hardcoded fallback — used only if the Supabase fetch fails or a row is missing.
// The 4 positive pillars are short one-line summaries. `Negative` keeps its
// detailed multi-line criteria (the 6 categories). `Others` is the catch-all for
// content that fits neither the 4 pillars nor the Negative criteria.
export const PILLAR_DESCRIPTIONS_FALLBACK: Record<PillarResult, string> = {
  'Product Value & Information':
    'model mobil, spesifikasi, fitur, harga, DP/cicilan/kredit, test drive, tips servis/perawatan',
  'Dealer Credibility':
    'foto tim/staf, ucapan hari raya, info showroom, penghargaan, jam operasional, kegiatan CSR/komunitas',
  'Customer Story':
    'testimoni customer, serah terima/delivery unit, review pembeli, customer bahagia dengan mobilnya',
  'Promo Activation':
    'promo, diskon, cashback, giveaway, event, penawaran tukar tambah, bunga 0%',
  'Others':
    'konten yang tidak masuk salah satu dari 4 pillar di atas dan juga bukan Negative — netral/generik namun tetap layak brand (mis. ucapan umum, konten seasonal tanpa produk, info lain-lain)',
  'Negative': `HANYA untuk konten yang benar-benar berbahaya atau tidak sesuai brand, sesuai salah satu dari 6 kategori ini:
  1. Internal Complaint / Self-Downgrading — staf mengeluh soal pekerjaan/target ("capek jadi sales", "3 bulan belum closing", "sales dikejar target terus")
  2. Clickbait / Viral tanpa Value — video trend/joget tanpa menampilkan mobil, meme random tidak terkait otomotif, caption tidak ada hubungannya dengan produk
  3. Negative Customer Handling — menyindir customer, share komplain customer tanpa solusi, caption yang menyalahkan customer
  4. Unprofessional Content — bahasa kasar atau terlalu slang, curhat masalah pekerjaan, visual lingkungan kerja yang tidak rapi secara negatif
  5. Competitor Bashing — secara langsung menjatuhkan brand lain ("mobil brand X jelek", "jangan beli yang lain")
  6. High Risk Content (Brand Safety) — SARA/hate speech, informasi hoaks, konten kekerasan atau tidak pantas
  JANGAN gunakan Negative untuk konten yang generik, ambigu, atau sulit diklasifikasi — pilih pillar positif yang paling mendekati.`,
}

// ─── Fetch descriptions from Supabase (memoised per process) ─────────────────
// Cached for the life of the process: a batch run of thousands of posts hits
// Supabase once. A cron/script restart picks up edits made in the Table Editor.

let descriptionsCache: Record<PillarResult, string> | null = null

async function getPillarDescriptions(): Promise<Record<PillarResult, string>> {
  if (descriptionsCache) return descriptionsCache

  try {
    const { data, error } = await supabase
      .from('pillar_config')
      .select('pillar, description')
    if (error) throw error

    const byPillar = new Map(data?.map((r) => [r.pillar, r.description]) ?? [])
    // Start from the fallback, override with any matching rows from the DB. A
    // missing or empty row keeps the hardcoded text for that pillar.
    const merged = { ...PILLAR_DESCRIPTIONS_FALLBACK }
    for (const pillar of VALID_PILLARS) {
      const desc = byPillar.get(pillar)
      if (typeof desc === 'string' && desc.trim()) merged[pillar] = desc
    }
    descriptionsCache = merged
    return merged
  } catch {
    // DB hiccup — fall back to the hardcoded text so classification never breaks.
    return PILLAR_DESCRIPTIONS_FALLBACK
  }
}

// ─── Derived prompt block ────────────────────────────────────────────────────
// Built from the fetched descriptions — positive pillars as bullets, then the
// Negative criteria block.

export async function getPillarDefinitions(): Promise<string> {
  const descriptions = await getPillarDescriptions()

  const positivePillars = `Pillar konten:
${VALID_PILLARS.filter((p) => p !== 'Negative' && p !== 'Others')
  .map((p) => `- ${p}: ${descriptions[p]}`)
  .join('\n')}`

  const othersCriteria = `- Others: ${descriptions['Others']}`
  const negativeCriteria = `- Negative: ${descriptions['Negative']}`

  return `${positivePillars}
${othersCriteria}
${negativeCriteria}`
}
