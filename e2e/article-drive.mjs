// Does the gender article fit, or does it break the board?
//
// Two earlier versions of this drive passed and proved nothing, so the checks
// here are shaped by how each of them lied.
//
// The first swept only a fresh player's boards. The opening curriculum pool is
// curated short and concrete, so the longest word it ever saw was "køkken" and
// it reported 192/192 cards fine. The words that can actually break a 76px
// card — "sygeplejerske", "vaskemaskine", "badeværelse" — are dealt only to a
// player who has reached cities 5 through 9. So this walks the whole journey,
// and then asserts it got to the long end: a sweep that measures only short
// words has to fail rather than report OK.
//
// The second measured the element box. When the English gloss is showing, the
// word is a flex item that gets shrunk, so its rect stays inside the card
// while the text spills out of it and is clipped by overflow:hidden. So this
// measures scrollHeight, which reports the text.
//
// What both missed: an inline article cost 105 of 430 nouns a second line and
// clipped two away completely. It now sits in the reserved top strip and must
// cost the word nothing at all, which is the check that would have caught it.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { startPreview } from './preview-server.mjs'

const PORT = 4199
const preview = await startPreview(PORT)

// The dataset decides the worst case, so read it rather than hard-coding one.
const WORDS = JSON.parse(readFileSync(new URL('../src/data/words.da.json', import.meta.url)))
const longest = WORDS.filter((w) => w.article).sort((a, b) => b.da.length - a.da.length)[0]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
// 360px is the narrowest phone the layout claims to support; a 4-wide board
// there gives each card 76 CSS pixels and the word inside it 64, which is
// where this is decided.
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } })
const page = await ctx.newPage()
const crashes = []
page.on('pageerror', (e) => crashes.push(String(e)))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

/**
 * Every card's word against the box that actually holds it.
 *
 * The card is a fixed 5:4 box with overflow:hidden, so text that does not fit
 * is not merely ugly, it is gone. scrollHeight against the padding box is the
 * measurement that survives the word being flex-shrunk.
 */
const measure = () =>
  page.$$eval('.word-card', (cards) =>
    cards.map((card) => {
      const da = card.querySelector('.card-da')
      const art = card.querySelector('.card-article')
      const cs = getComputedStyle(card)
      const boxH = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const lh = parseFloat(getComputedStyle(da).lineHeight)
      const r = (el) => {
        const b = el.getBoundingClientRect()
        return { l: b.left, r: b.right, t: b.top, b: b.bottom }
      }
      return {
        word: da.textContent.trim(),
        article: art?.textContent.trim() ?? null,
        lines: Math.max(1, Math.round(da.scrollHeight / lh)),
        clipped: da.scrollHeight > boxH + 0.5 || da.scrollWidth > card.clientWidth + 0.5,
        // Overlap against the two things that own the top strip.
        artBox: art ? r(art) : null,
        keyBox: card.querySelector('.key-mark') ? r(card.querySelector('.key-mark')) : null,
        infoBox: card.parentElement.querySelector('.card-info')
          ? r(card.parentElement.querySelector('.card-info'))
          : null,
      }
    }),
  )

/** Deal a board and read it. `learned` pushes the sampler deeper into a city. */
const boardAt = async ({ city, learned, grid, translations }) => {
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0&seed=7&city=${city}&learned=${learned}`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').nth(grid).click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  // The study phase forces translations on; past it the Aa toggle decides.
  // With the gloss showing, the word has the least room it will ever have.
  if (translations) {
    const aa = page.locator('button[aria-pressed]', { hasText: 'Aa' }).first()
    if ((await aa.getAttribute('aria-pressed')) === 'false') await aa.click()
  }
  await page.waitForTimeout(120)
  const withArticle = await measure()
  // The same board with the article suppressed: the only honest baseline for
  // "did adding this cost the word anything?".
  await page.addStyleTag({ content: '.card-article{display:none!important}' })
  await page.waitForTimeout(80)
  const without = await measure()
  await page.evaluate(() => {
    localStorage.removeItem('cluecab-game-v1')
    localStorage.removeItem('cluecab-srs-v1')
    localStorage.removeItem('cluecab-journey-v1')
  })
  return { withArticle, without }
}

const overlaps = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5

try {
  const clipped = []
  const costLines = []
  const collisions = []
  let checked = 0
  let withArticle = 0
  let longestSeen = ''
  const linesByWord = new Map()

  for (const city of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    // Fresh arrival, then most of the way through: the second reaches the far
    // end of the city, which is where the long words are.
    for (const learned of [0, 62]) {
      for (const grid of [0, 1]) {
        // The deeper pass carries the English gloss, the tightest case there is.
        const { withArticle: on, without: off } = await boardAt({
          city,
          learned,
          grid,
          translations: learned > 0,
        })
        const bare = new Map(off.map((m) => [m.word, m.lines]))
        for (const m of on) {
          checked++
          if (m.article) withArticle++
          if (m.word.length > longestSeen.length) longestSeen = m.word
          linesByWord.set(m.word, Math.max(linesByWord.get(m.word) ?? 0, m.lines))
          if (m.clipped) clipped.push(`${m.word} (${m.lines} lines)`)
          if (m.article && m.lines > (bare.get(m.word) ?? m.lines)) {
            costLines.push(`${m.article} ${m.word}: ${bare.get(m.word)} → ${m.lines}`)
          }
          if (overlaps(m.artBox, m.keyBox)) collisions.push(`${m.word}: article over the key mark`)
          if (overlaps(m.artBox, m.infoBox)) collisions.push(`${m.word}: article under ⓘ`)
        }
      }
    }
  }

  check(
    'no word is clipped away, anywhere on the journey',
    clipped.length === 0,
    clipped.slice(0, 5).join('; ') || `${checked} cards, ${withArticle} with an article`,
  )

  // The one that matters. An inline article cost 105 of 430 nouns a line and
  // rendered "en pand/e" — a false shape for the word, in an app whose whole
  // job is teaching the word. Gender is free or it is not worth having here.
  check(
    'and the article costs the word neither a line nor a letter',
    costLines.length === 0,
    costLines.slice(0, 6).join('; ') || `checked against the same boards with it hidden`,
  )

  check(
    'nothing in the top strip lands on anything else',
    collisions.length === 0,
    collisions.slice(0, 4).join('; ') || 'key mark, article and ⓘ all clear',
  )

  // The three checks above are worthless unless the sweep reached the words
  // that could break them. This is the guard against a vacuous pass.
  check(
    'and the sweep reached the long words, so that means something',
    longestSeen.length >= Math.min(11, longest.da.length),
    `longest dealt "${longestSeen}", dataset's longest is "${longest.article} ${longest.da}"`,
  )
  check('articles appear on most cards', withArticle > checked * 0.3, `${withArticle}/${checked}`)

  const worst = [...linesByWord.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  console.log(`     deepest wraps: ${worst.map(([w, n]) => `${w} (${n})`).join(', ')}`)

  // --- The article must not be mistakable for part of the word. That is the
  // one way this could mislead: a clue containing a board word is illegal.
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0&seed=5`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').first().click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  const s = (
    await page.$$eval('.word-card', (cards) => {
      const card = cards.find((c) => c.querySelector('.card-article'))
      const a = getComputedStyle(card.querySelector('.card-article'))
      const word = getComputedStyle(card.querySelector('.card-da'))
      const ar = card.querySelector('.card-article').getBoundingClientRect()
      const wr = card.querySelector('.card-da').getBoundingClientRect()
      return [
        {
          articlePx: parseFloat(a.fontSize),
          wordPx: parseFloat(word.fontSize),
          articleWeight: a.fontWeight,
          wordWeight: word.fontWeight,
          // Separated by being on a different line entirely, which is the
          // point of the top strip; measure it rather than assume it.
          gapPx: wr.top - ar.bottom,
        },
      ]
    })
  )[0]
  check('the article is visibly smaller than the word', s.articlePx < s.wordPx * 0.75, `${s.articlePx}px vs ${s.wordPx}px`)
  check('and lighter', Number(s.articleWeight) < Number(s.wordWeight), `${s.articleWeight} vs ${s.wordWeight}`)
  check('and clear of the word', s.gapPx > 0, `${s.gapPx.toFixed(1)}px between them`)

  // Screen readers should hear the collocation, not the bare noun — the visual
  // separation is exactly what would otherwise lose it.
  const label = await page.locator('.word-card').first().getAttribute('aria-label')
  check('the accessible name carries the article', /^(en|et)\s/.test(label), label)

  check('no page errors', crashes.length === 0, crashes.join(' | '))
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nARTICLE DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('ARTICLE DRIVE FAILED:', e.stack ?? e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
  process.exit(process.exitCode ?? 0)
}
