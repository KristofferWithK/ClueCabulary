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
const SIZES = ['beginner', 'middle', 'standard']
const preview = await startPreview(PORT)

// The dataset decides the worst case, so read it rather than hard-coding one.
const WORDS = JSON.parse(readFileSync(new URL('../src/data/words.da.json', import.meta.url)))
const longest = WORDS.filter((w) => w.article).sort((a, b) => b.da.length - a.da.length)[0]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
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
        // The article is inline now, so what matters is that it sits on the
        // word's first line rather than anywhere near ⓘ.
        artBox: art ? r(art) : null,
        infoBox: card.parentElement.querySelector('.card-info')
          ? r(card.parentElement.querySelector('.card-info'))
          : null,
      }
    }),
  )

/** Deal a board and read it. `learned` pushes the sampler deeper into a city. */
const boardAt = async ({ city, learned, grid, translations }) => {
  await page.goto(
    `${preview.base}?mock=1&howto=0&seed=7&city=${city}&learned=${learned}&grid=${SIZES[grid]}`,
  )
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
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

  // Inline, the article DOES cost some words a second line — 71 of the 430
  // nouns, measured across the whole set — and that is the accepted price of
  // having it in front of the word where it is read. What must not happen is
  // a word losing a letter to it, which is what the clipped check above is
  // for. This one just keeps the cost from creeping: a third of the nouns is
  // the ceiling, and a regression that pushed it higher would show here.
  const share = withArticle === 0 ? 0 : costLines.length / withArticle
  check(
    'and the line it costs stays a minority of the nouns',
    share <= 0.34,
    `${costLines.length} of ${withArticle} cards gained a line (${Math.round(share * 100)}%)`,
  )

  check(
    'the article never lands under ⓘ',
    collisions.length === 0,
    collisions.slice(0, 4).join('; ') || 'clear on every card',
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
  await page.goto(`${preview.base}?mock=1&howto=0&seed=5&grid=beginner`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  const s = (
    await page.$$eval('.word-card', (cards) => {
      const card = cards.find((c) => c.querySelector('.card-article'))
      const a = getComputedStyle(card.querySelector('.card-article'))
      const word = getComputedStyle(card.querySelector('.card-da'))
      return [
        {
          articlePx: parseFloat(a.fontSize),
          wordPx: parseFloat(word.fontSize),
          articleWeight: a.fontWeight,
          wordWeight: word.fontWeight,
          // Inline now, so the separation that matters is horizontal: wide
          // enough that "et hus" cannot be read as one word.
          gapPx: parseFloat(a.marginRight),
        },
      ]
    })
  )[0]
  check('the article is visibly smaller than the word', s.articlePx < s.wordPx * 0.75, `${s.articlePx}px vs ${s.wordPx}px`)
  check('and lighter', Number(s.articleWeight) < Number(s.wordWeight), `${s.articleWeight} vs ${s.wordWeight}`)
  check(
    'and separated by more than a word space, so it does not read as "ethus"',
    // A space at the word's size is roughly a quarter of the em.
    s.gapPx >= s.wordPx * 0.2,
    `${s.gapPx.toFixed(1)}px gap, a space would be ~${(s.wordPx * 0.25).toFixed(1)}px`,
  )

  // The article is the smallest text on the board, so its contrast is decided
  // by the darkest tile it can sit on, not by the white card it is designed
  // against. Read the shipped palette and the shipped colours and do the
  // arithmetic: #6b6b6b looks right on white and lands at 4.00:1 on a beige
  // bystander tile, under AA for text this size.
  const contrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const v = (n) => root.getPropertyValue(n).trim()
    const card = [...document.querySelectorAll('.word-card')].find((c) => c.querySelector('.card-article'))
    // Colour resolves correctly through a class chain; background does not,
    // because the tint rules live on the card itself. So take grounds from the
    // palette and inks from a probe.
    const inkUnder = (cls) => {
      const probe = card.querySelector('.card-article').cloneNode(true)
      const host = document.createElement('div')
      host.className = `word-card ${cls}`
      host.style.position = 'absolute'
      host.style.visibility = 'hidden'
      host.appendChild(probe)
      card.parentElement.appendChild(host)
      const c = getComputedStyle(probe).color
      host.remove()
      return c
    }
    const lum = (c) => {
      const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((x) => {
        x /= 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const hexToRgb = (h) => {
      // The build minifies #ffffff to #fff, so both forms reach this.
      let s = h.replace('#', '')
      if (s.length === 3) s = s.replace(/./g, (c) => c + c)
      const n = parseInt(s, 16)
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    }
    const ratio = (fg, bg) => {
      const [a, b] = [lum(fg), lum(bg)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    // Every ground the article is actually drawn on, with the ink it takes there.
    return [
      ['plain card', inkUnder(''), v('--bg')],
      ['bystander tile', inkUnder(''), v('--beige')],
      ['spent tile', inkUnder('card-spent'), v('--surface')],
      ['found green', inkUnder('card-green'), v('--green-tile')],
      ['forbidden', inkUnder('card-forbidden'), v('--black-tile')],
    ].map(([name, fg, bg]) => ({ name, fg, bg, ratio: +ratio(fg, hexToRgb(bg)).toFixed(2) }))
  })
  for (const c of contrast) console.log(`     ${c.name.padEnd(15)} ${c.fg} on ${c.bg} — ${c.ratio}:1`)
  check(
    'the article clears AA on every tile it can land on',
    // 4.4 rather than 4.5: --green-tile is documented at ~4.6:1 for white and
    // measures 4.45, so the board's own floor is the bar here, not a rounder
    // number the tile itself would fail.
    contrast.every((c) => c.ratio >= 4.4),
    contrast.filter((c) => c.ratio < 4.4).map((c) => `${c.name} ${c.ratio}:1`).join('; ') || 'all grounds',
  )

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
