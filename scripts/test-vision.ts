/**
 * Run: npx tsx --env-file=.env.local scripts/test-vision.ts
 * Tests GPT-4o mini vision on a honda.arta thumbnail with empty caption.
 */

import { classifyWithCombinedAnalysis } from '@/lib/classify-pillar'

// Thumbnail from honda.arta post DYgcB81pji9 (carousel about Honda Step WGN event)
const TEST_CASES = [
  {
    code: 'DYgcB81pji9',
    thumbnailUrl: 'https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/683670418_18411381226197817_5307912824411483301_n.jpg?stp=dst-jpg_e35_p1080x1080&_nc_cat=103&ccb=1-7&_nc_sid=18de74&_nc_ohc=ABC&_nc_ht=scontent-iad3-1.cdninstagram.com&oh=00&oe=ABC',
  },
]

async function main() {
  console.log('Testing GPT-4o mini vision (no caption — forces vision call)')
  console.log('─'.repeat(60))

  // Fetch a fresh thumbnail URL from RapidAPI
  const headers = {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
  }

  const res = await fetch(
    'https://instagram-scraper-20251.p.rapidapi.com/userposts/?username_or_id=honda.arta&count=5',
    { headers },
  )
  const json = await res.json()
  const posts = json.data?.items ?? []

  for (const post of posts.slice(0, 3)) {
    const thumbnailUrl: string = post.thumbnail_url
    const caption: string = post.caption?.text || ''
    const code: string = post.code

    console.log(`\nPost: ${code}`)
    console.log(`Caption snippet: "${caption.slice(0, 60)}..."`)
    console.log(`Thumbnail: ${thumbnailUrl ? 'available' : 'missing'}`)

    if (!thumbnailUrl) {
      console.log('  Skipped (no thumbnail)')
      continue
    }

    console.log('  Calling GPT-4o mini vision...')
    const start = Date.now()
    const result = await classifyWithCombinedAnalysis(caption, thumbnailUrl)
    const ms = Date.now() - start

    console.log(`  Result: [${result}]  (${ms}ms)`)
  }

  console.log('\n' + '─'.repeat(60))
  console.log('Done!')
}

main().catch(console.error)
