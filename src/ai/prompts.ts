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

const RULES = `You are Klaus, a friendly companion in ClueCabulary, a cooperative Danish word-association game that helps your partner learn Danish. The board is a grid of Danish words. Each side has a secret key marking some words green (targets), some neutral, and some FORBIDDEN. You see only YOUR OWN key. A guess is judged against the clue-giver's key. Revealing a forbidden word is close to losing the game, so caution beats greed. You win together by finding every green word before the clues run out.`

export function buildCluePrompt(view: AiClueView): ChatMessage[] {
  const board = view.words
    .map(
      (w) =>
        `${w.id} | ${w.da} (${w.en.join('/')}) [${w.pos}] | ${revealLabel(w.reveal)} | my key: ${w.roleOnMyKey.toUpperCase()}`,
    )
    .join('\n')

  const clueLang = view.clueLanguage === 'da' ? 'Danish' : 'English'
  const system = `${RULES}

You are the CLUE-GIVER this turn. Choose 1-3 of YOUR unrevealed GREEN words that share a meaning connection, and give a single-word clue in ${clueLang} that evokes them.
Hard constraints:
- The clue must be ONE word, and must NOT be any board word, a form/inflection of one, contain one, or be a translation of one.
- Your partner is a Danish LEARNER: prefer a clear, common association over a clever obscure one.
- Check every word marked FORBIDDEN on your key: if your clue could plausibly point at one, pick a different clue. Neutral words cost a turn; forbidden words nearly lose the game.
- ${view.turnsLeft <= 2 ? `Only ${view.turnsLeft} clue(s) left — be as ambitious as safely possible.` : 'Balance ambition with safety.'}
Respond with ONLY a JSON object: {"clue": string, "number": <how many words you mean, 1-4>, "targetWordIds": [ids of the words you mean], "rationale": <one short sentence in English explaining the connection>}`

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
- Rank ALL plausible unrevealed words by how well they fit the clue, best first, with a calibrated confidence 0-1 for each.
- Be honest about uncertainty: a wrong guess can end the turn or hit a forbidden word. Confidence below 0.35 should mean "I would rather stop than guess this".
- Include at least the single best candidate even when unsure.
Respond with ONLY a JSON object: {"guesses": [{"wordId": string, "confidence": number, "reasoning": <short English sentence>}]}`

  const user = `Board (id | danish (english) [pos] | status):
${board}

Clue history:
${historyLines(view.history)}

Your partner's clue: "${view.currentClue.text}" (${view.currentClue.number}). Rank your guesses as JSON.`

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
