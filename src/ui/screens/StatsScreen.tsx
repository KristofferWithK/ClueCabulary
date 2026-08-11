import { WORDS, wordById } from '../../data/words'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

const BOX_LABELS = ['new', 'learning', 'familiar', 'known', 'mastered']

export function StatsScreen() {
  const goTo = useUi((s) => s.goTo)
  const openSheet = useUi((s) => s.openSheet)
  const stats = useSrs((s) => s.stats)
  const games = useSrs((s) => s.games)

  const entries = Object.entries(stats)
  const boxCounts = [0, 0, 0, 0, 0]
  for (const [, s] of entries) boxCounts[s.box]!++
  const maxBox = Math.max(1, ...boxCounts)

  const struggling = entries
    .filter(([, s]) => s.misses > 0 || s.redemptionWrong > 0)
    .sort(
      ([, a], [, b]) =>
        b.misses + b.redemptionWrong - (a.misses + a.redemptionWrong) || b.lookups - a.lookups,
    )
    .slice(0, 10)

  return (
    <div className="screen stats-screen">
      <header className="screen-header">
        <button className="icon-btn" aria-label="Back" onClick={() => goTo('home')}>
          ←
        </button>
        <h1>Progress</h1>
      </header>

      <p className="stats-total">
        <strong>{entries.length}</strong> of {WORDS.length} words met ·{' '}
        <strong>{boxCounts[3]! + boxCounts[4]!}</strong> known well
      </p>

      {games.played > 0 && (
        <p className="stats-games">
          <span>
            <strong>{games.played}</strong> played
          </span>
          <span>
            <strong>{games.won}</strong> won
            {games.redeemed > 0 ? ` (${games.redeemed} 🔥)` : ''}
          </span>
          <span>
            <strong>{games.lost}</strong> lost
          </span>
        </p>
      )}

      <section className="settings-section">
        <h3>Learning boxes</h3>
        <div className="box-bars">
          {boxCounts.map((count, i) => (
            <div key={i} className="box-bar-row">
              <span className="box-bar-label">{BOX_LABELS[i]}</span>
              <div className="box-bar-track">
                <div className="box-bar-fill" style={{ width: `${(count / maxBox) * 100}%` }} />
              </div>
              <span className="box-bar-count">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Worth another look</h3>
        {struggling.length === 0 ? (
          <p className="dim">Nothing yet — play a few rounds!</p>
        ) : (
          <ul className="struggle-list">
            {struggling.map(([id, s]) => {
              const w = wordById(id)
              if (!w) return null
              return (
                <li key={id}>
                  <button className="struggle-word" onClick={() => openSheet(id)}>
                    <span lang="da">{w.da}</span>
                    <span className="dim">{w.en[0]}</span>
                    <span className="struggle-misses">
                      {s.misses + s.redemptionWrong} miss{s.misses + s.redemptionWrong === 1 ? '' : 'es'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
