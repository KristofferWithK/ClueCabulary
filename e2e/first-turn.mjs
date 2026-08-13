/**
 * Get past Klaus's opening clue to the player's own clue box.
 *
 * Klaus clues first now — a round that opened by asking the player to compose
 * a Danish clue opened with the hardest thing in the game, on a board they had
 * not read yet. So every drive that wants the clue dock has to guess once
 * first, and this is that step, written down once instead of six times.
 *
 * The guess is deliberately a word that is NEUTRAL on Klaus's key: it ends the
 * turn, spends a token and hands the clue over, without the drive tripping
 * into the redemption challenge on a forbidden word or accidentally winning.
 */
export async function passKlausOpening(page) {
  // Klaus is asked for a clue the moment the round starts; wait for the answer.
  await page.waitForSelector('.guess-bar', { timeout: 30_000 })

  const safeId = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    // Judged against the clue-giver's key, and Klaus is giving.
    return (
      s.words
        .map((w) => w.wordId)
        .find((id) => s.aiKey[id] === 'bystander' && s.reveals[id].kind === 'hidden') ?? null
    )
  })
  if (!safeId) throw new Error('no neutral word to spend Klaus’s opening clue on')

  await page.locator(`.word-card:has(.card-da:text-is("${await danish(page, safeId)}"))`).click()
  await page.locator('.guess-confirm .btn-primary').click()
  await page.waitForSelector('.clue-input', { timeout: 30_000 })
}

async function danish(page, wordId) {
  return page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    return s.words.find((w) => w.wordId === id).da
  }, wordId)
}
