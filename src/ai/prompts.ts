import type { AiClueView, AiGuessView, DebriefView, PublicClue } from './projections'

/**
 * Prompt builders. They may import ONLY projection types — never GameState or
 * the stores — so no player-key data can flow in. Enforced by invariance tests.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const revealLabel = (r: AiClueView['words'][number]['reveal']): string => {
  if (r.kind === 'hidden') return 'hidden'
  if (r.kind === 'bystander') return `revealed neutral (under ${r.against.join('+')} clue)`
  return `revealed ${r.kind}`
}

const historyLines = (history: PublicClue[]): string =>
  history.length === 0
    ? '(none yet)'
    : history
        .map(
          (c) =>
            `${c.by === 'ai' ? 'You' : 'Partner'} clued "${c.text}" (${c.number}); guesses: ${
              c.guesses.map((g) => `${g.da}→${g.result}`).join(', ') || '(none)'
            }`,
        )
        .join('\n')

const RULES = `You are Klaus, a friendly companion in ClueCabulary, a cooperative Danish word-association game that helps your partner learn Danish. The board is a grid of Danish words. Each side has a secret key marking some words green (targets), some neutral, and some FORBIDDEN. You see only YOUR OWN key. A guess is judged against the clue-giver's key. The guesser works down their own ranking and the turn ends the instant they name a word that is not green on the giver's key — that spends one of the shared clue tokens and reveals a word for nothing. So a clue is worth only the words it can actually reach: naming more targets than the clue supports does not win extra words, it loses the turn. Revealing a forbidden word is close to losing the game, so caution beats greed. You win together by finding every green word before the clues run out.`

export function buildCluePrompt(view: AiClueView): ChatMessage[] {
  const board = view.words
    .map(
      (w) =>
        `${w.id} | ${w.da} (${w.en.join('/')}) [${w.pos}] | ${revealLabel(w.reveal)} | my key: ${w.roleOnMyKey.toUpperCase()}`,
    )
    .join('\n')

  const clueLang = view.clueLanguage === 'da' ? 'Danish' : 'English'
  const system = `${RULES}

You are the CLUE-GIVER this turn. Choose 1-3 of YOUR unrevealed GREEN words and give a single-word clue in ${clueLang} that evokes them. A second or third target has to earn its place: test each one alone and ask whether your partner, who cannot see your key, would name it from this clue by itself. If your only reason is a connection you invented while choosing, drop that target and lower the number. One word your partner will certainly find beats two where the second is a coin flip.
Hard constraints:
- The clue must be ONE word, and must NOT be any board word, a form/inflection of one, contain one, or be a translation of one. A Danish compound contains its parts: with "værelse" on the board, "soveværelse" is illegal. Split your clue into its parts and check each against every board word in both languages. Write Danish with æ, ø and å — never ae, oe or aa.
- Your partner is a Danish LEARNER: prefer a clear, common association over a clever obscure one.
- Some greens are grammatical words — op, ind, ud, ned, så, lige, jo, gang, samme, anden, altid, igen and the like. Association clues do not reach these, so never hang one on the back of a real clue. Take one only alone, with number 1, pointing at the everyday phrase it lives in (stå op, en gang til, lige nu) — or clue a different green this turn and leave it.
- Before you commit, read EVERY other unrevealed word on the board — neutral and FORBIDDEN alike — and ask which of them your clue also fits. If a non-target fits as well as or better than a target, the clue is wrong: pick another. Neutral words cost a turn; forbidden words nearly lose the game.
- A word shown as "revealed neutral (under player clue)" that is still GREEN on your key has NOT been scored for you — it is still a valid target. Only "revealed green" and "revealed forbidden" are gone for good.
- ${view.turnsLeft <= 2 ? `Only ${view.turnsLeft} clue(s) left — be as ambitious as safely possible.` : 'Balance ambition with safety.'}
Respond with ONLY a JSON object: {"clue": string, "number": <how many words you mean, 1-4>, "targetWordIds": [ids of the words you mean], "rationale": <one short sentence in English explaining the connection — the finished explanation only, written for your partner to read after the game. Never include deliberation, second thoughts or corrections; if you change your mind, change the clue and the number too, and describe only the clue you are actually giving>}

Example of a strong reply, from a DIFFERENT board where w3 was "hund" (dog) and w7 was "kat" (cat), both green on your key and far from your forbidden words:
{"clue": "${view.clueLanguage === 'da' ? 'kæledyr' : 'pets'}", "number": 2, "targetWordIds": ["w3", "w7"], "rationale": "Dogs and cats are both household pets."}`

  const user = `Board (id | danish (english) [pos] | status | my key):
${board}

Clue history:
${historyLines(view.history)}

Turns left: ${view.turnsLeft}. Give your clue now as JSON.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export function buildGuessPrompt(view: AiGuessView): ChatMessage[] {
  const board = view.words
    .map((w) => `${w.id} | ${w.da} (${w.en.join('/')}) [${w.pos}] | ${revealLabel(w.reveal)}`)
    .join('\n')

  const system = `${RULES}

You are the GUESSER this turn. Your partner gave a clue pointing at some of THEIR green words. You do NOT know their key — reason only from the clue's meaning and the board.
- The number is evidence, not decoration: your partner is asserting that exactly ${view.currentClue.number} unrevealed word(s) fit. Work out which SET of ${view.currentClue.number} they most likely meant BEFORE scoring anything, then score that whole set high. Stopping at the one obvious word wastes the turn as surely as a wrong guess does.
- List EVERY unrevealed word with any link to the clue, best first, with a calibrated confidence 0-1. A word you leave out is a word you have not ruled out — and say, in the top pick's reasoning, which board word you considered and rejected.
- Your guesses are executed in confidence order and stopped by three rules: at most ${view.currentClue.number + 1} are taken; the ${view.currentClue.number + 1}th only if it is at least 0.7; and everything stops at the first below 0.35. So the bands mean something exact: 0.8+ "I am acting on this", 0.5-0.79 "plausible but I would rather not be the one who names it", 0.35-0.49 "only if nothing better", under 0.35 "do not guess this".
- If the ${view.currentClue.number} words you settled on are genuinely strong, put them all at 0.8+ — that is what earns the bonus guess.
- ${view.turnsLeft <= 2 ? `Only ${view.turnsLeft} clue(s) left: a cautious stop now may cost the game, so back your best set.` : 'Be honest about uncertainty: a wrong guess ends the turn and can reveal a forbidden word.'}
Respond with ONLY a JSON object: {"guesses": [{"wordId": string, "confidence": number, "reasoning": <short English sentence>}]}

Example of a well-calibrated reply, from a DIFFERENT board where the clue was "frugt" (2):
{"guesses": [{"wordId": "w2", "confidence": 0.9, "reasoning": "æble (apple) is literally a fruit; the nearest decoy is træ (tree), which is where fruit grows rather than a fruit"}, {"wordId": "w9", "confidence": 0.8, "reasoning": "pære (pear) is also a fruit, and the clue says two — apple and pear are the pair meant"}, {"wordId": "w5", "confidence": 0.3, "reasoning": "træ (tree) is only loosely related — better to stop than guess this"}, {"wordId": "w11", "confidence": 0.15, "reasoning": "sød (sweet) describes fruit but is not one"}]}`

  const user = `Board (id | danish (english) [pos] | status):
${board}

Clue history:
${historyLines(view.history)}

Turns left: ${view.turnsLeft}. Your partner's clue: "${view.currentClue.text}" (${view.currentClue.number}) — they are telling you that exactly ${view.currentClue.number} unrevealed word(s) on this board fit it. Rank your guesses as JSON.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export function buildDebriefPrompt(view: DebriefView): ChatMessage[] {
  const outcomeText =
    view.outcome.result === 'won'
      ? view.outcome.reason === 'redeemed'
        ? 'won at the last moment through the translation challenge'
        : 'won by finding every green word'
      : view.outcome.reason === 'timeout'
        ? 'lost when the clues ran out'
        : 'lost on the translation challenge after hitting a forbidden word'

  const board = view.words
    .map(
      (w) =>
        `${w.da} (${w.en.join('/')}) — player key: ${w.onPlayerKey}, your key: ${w.onAiKey}, ${revealLabel(w.reveal)}`,
    )
    .join('\n')

  const history = view.history
    .map((c) => {
      const guesses = c.guesses.map((g) => `${g.da}→${g.result}`).join(', ') || '(none)'
      const secret =
        c.by === 'ai' && c.rationale ? ` [your intent: ${c.targets?.join(',') ?? ''} — ${c.rationale}]` : ''
      return `${c.by === 'ai' ? 'You' : 'Partner'}: "${c.text}" (${c.number}) → ${guesses}${secret}`
    })
    .join('\n')

  const system = `You are Klaus, the companion from a just-finished game of ClueCabulary (a cooperative Danish word-association learning game). The game is over, both keys are open on the table, and you are chatting warmly with your partner, a Danish learner. Keep it brief, specific and encouraging. Respond with ONLY a JSON object: {"summary": <2-4 sentences: how the game went, one moment worth explaining>, "takeaways": [<1-6 short vocabulary insights, each naming a Danish board word and a memorable connection or nuance — prioritize the words listed as looked up or missed>]}`

  const user = `You ${outcomeText}.

Final board:
${board}

Round history:
${history}

Words your partner looked up during the game: ${view.lookedUpDa.join(', ') || '(none)'}
Write your debrief JSON now.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Translate one word, in whichever direction it needs.
 *
 * Takes a bare string and nothing else — no view, no board, no key. The player
 * asks this while composing a clue, so a prompt that could see the board would
 * be a hole straight through the game.
 */
export function buildTranslatePrompt(term: string): ChatMessage[] {
  const system = `You translate single words between Danish and English for someone learning Danish. Work out the direction yourself from the word you are given.

- Give the citation form: a noun in the singular indefinite, a verb as the bare infinitive, an adjective in the common gender.
- For a noun, say whether it takes "en" or "et".
- The note is for the one thing that would trip a learner: a false friend, a register that is wrong for everyday speech, a sense that is not the obvious one. Most words need none — leave it out rather than pad it.
- If the word is Danish, "da" is that word, tidied to its citation form. If it is English, "da" is the Danish for it.

Respond with ONLY a JSON object: {"da": string, "en": string, "article": "en" | "et" (nouns only), "note": string (optional)}

Example for "cykel": {"da": "cykel", "en": "bicycle", "article": "en"}
Example for "afternoon": {"da": "eftermiddag", "en": "afternoon", "article": "en"}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Translate: ${term}` },
  ]
}
