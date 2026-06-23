// ─────────────────────────────────────────────────────────────────────────────
// PILLAR CONFIG — edit this file to tune how posts are classified.
//
// This is the single source of truth for the content pillars and what each one
// means. The descriptions below are fed into the AI prompt, so editing the text
// directly changes classification behaviour everywhere: every scrape, the
// reclassify API, and all backfill scripts read from here.
//
// HOW TO EDIT:
//   • To reword a pillar's meaning  → change its value in PILLAR_DESCRIPTIONS.
//   • Keep the keys (pillar names)   → they're tied to VALID_PILLARS by type, so
//     a typo or missing pillar fails the build instead of silently misclassifying.
//   • Renaming a pillar is a bigger change (DB values + UI labels) — not just here.
//
// AFTER EDITING:
//   New posts use the new descriptions automatically. To re-apply them to posts
//   already in the database, run:  npx tsx scripts/reclassify-all.ts
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_PILLARS = [
  'Product Value & Information',
  'Dealer Credibility',
  'Customer Story',
  'Promo Activation',
  'Negative',
] as const

export type PillarResult = typeof VALID_PILLARS[number]

// The 4 positive pillars are short one-line summaries. `Negative` keeps its
// detailed multi-line criteria (the 6 categories).
export const PILLAR_DESCRIPTIONS: Record<PillarResult, string> = {
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

// ─── Derived prompt block ────────────────────────────────────────────────────
// Built from PILLAR_DESCRIPTIONS above — positive pillars as bullets, then the
// Negative criteria block. Don't edit this; edit PILLAR_DESCRIPTIONS instead.

const POSITIVE_PILLARS = `Pillar konten:
${VALID_PILLARS.filter((p) => p !== 'Negative')
  .map((p) => `- ${p}: ${PILLAR_DESCRIPTIONS[p]}`)
  .join('\n')}`

const NEGATIVE_CRITERIA = `- Negative: ${PILLAR_DESCRIPTIONS['Negative']}`

export const PILLAR_DEFINITIONS = `${POSITIVE_PILLARS}
${NEGATIVE_CRITERIA}`
