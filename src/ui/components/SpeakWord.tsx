import { useSettings } from '../../stores/settingsStore'
import { canPlayWords, playWord } from '../speak'
import { ACTIVE } from '../../lang/active'

/**
 * A Danish word that says itself when you tap it.
 *
 * A separate 🔊 beside every word in a list was the other option and it loses
 * twice: it is a 30px target next to a 44px one, and it costs horizontal room
 * on lists that already run to the edge at 360px. Making the word itself the
 * button adds no element and no height — which matters, because layout-drive
 * measures every screen against `scrollHeight <= innerHeight` and the round
 * summary is the longest screen in the app.
 *
 * The dotted underline is the only visible change. It is there because a
 * control nobody knows is a control is not a feature.
 */
export function SpeakWord({ wordId, da }: { wordId: string; da: string }) {
  // `playWord` would refuse anyway, but a control that does nothing is worse
  // than no control: with sound off these go back to being plain words.
  const sound = useSettings((s) => s.sound)
  if (!sound || !canPlayWords()) return <span lang={ACTIVE.code}>{da}</span>
  return (
    <button type="button" className="speak-word" onClick={() => void playWord(wordId, da)}>
      {/* The lang stays on the text, not the button: the stylesheet and the
          browser's own pronunciation both key off it. */}
      <span lang={ACTIVE.code}>{da}</span>
    </button>
  )
}
