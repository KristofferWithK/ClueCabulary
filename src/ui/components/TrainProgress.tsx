/**
 * The road to the next city, drawn as the train that leaves it.
 *
 * Ten wagons, one per ten wrapped words, and all ten are always on the rail:
 * the ghost outlines are the part of the journey still to come, which is the
 * question the old bar could not answer — it filled left to right and never
 * said what it was filling towards.
 *
 * Two loads per wagon, because Home's bar carried two layers and the comment
 * over it asked for both to survive: `collected` is the fainter one, words
 * greened each way and waiting on the platform, and `wrapped` is the solid one,
 * words packed for good. Wrapped is what opens the road, so it is the layer
 * drawn on top and the one the wagon outline goes heavy for.
 *
 * Pencil and hatching are the ride train's (`TrainRide.tsx`) — the same hand
 * drew Casey, the coastline and this.
 *
 * Since T1 it is also the DOOR. Pass `onBoard` and the drawing is wrapped in a
 * real button: the thing you spent a hundred words filling is the thing you
 * press to ride it. Home had a separate green "Travel on → ⟨city⟩" button for
 * that and no longer does — it was a second control for a train already on the
 * screen, and it was exactly what Casey's band overflowed onto (the bug
 * DECISIONS records as "Casey drawn sliced across the green button").
 */

/** Wagons on the train. Ten, so one wagon is ten of a city's hundred words. */
export const WAGONS = 10

/**
 * Per-wagon fill in [0, 1]: solid once its share is earned, part-full for the
 * one being loaded, empty after it. Counts above `goal` clamp rather than
 * spilling into a wagon that is not there.
 */
export function wagonFills(count: number, goal: number, wagons: number = WAGONS): number[] {
  const per = goal / wagons
  return Array.from({ length: wagons }, (_, i) =>
    per <= 0 ? 0 : Math.max(0, Math.min(1, (count - i * per) / per)),
  )
}

/**
 * The sentence the train stands for. One function because two screens say it:
 * the map screen prints it under the train, Home has no room for it on its one
 * line and carries it as the train's accessible name instead.
 */
export function trainLabel(remaining: number, nextCity: string | null): string {
  if (remaining <= 0) {
    return nextCity === null
      ? 'The suitcase is packed — the journey is over.'
      : `The suitcase is packed — the train to ${nextCity} is ready.`
  }
  const words = remaining === 1 ? 'word' : 'words'
  return nextCity === null
    ? `You need ${remaining} more wrapped-up ${words} to finish the journey.`
    : `You need ${remaining} more wrapped-up ${words} to take the train to ${nextCity}.`
}

/**
 * The train's name once it is a control rather than a readout.
 *
 * A button is named for what pressing it does, which `trainLabel` is not: at
 * nothing left to wrap it says the train "is ready", and ready is a state, not
 * an action. Both screens say this same sentence so the door is the same door.
 */
export function boardLabel(nextCity: string): string {
  return `Board the train to ${nextCity}`
}

/** Geometry, in viewBox units. The wagons start after the locomotive. */
const LOCO = 42
const WAGON_W = 18
const WAGON_GAP = 4
const VB_W = LOCO + WAGONS * (WAGON_W + WAGON_GAP)
const VB_H = 38
const wagonX = (i: number) => LOCO + i * (WAGON_W + WAGON_GAP)

export function TrainProgress({
  wrapped,
  collected = 0,
  goal,
  label,
  className = '',
  onBoard,
}: {
  wrapped: number
  collected?: number
  goal: number
  /**
   * The whole sentence, for anyone who cannot see the train. Omit it where the
   * sentence is already printed next to the train — the map screen prints it
   * in full, and a label there would only read it out twice.
   *
   * When `onBoard` is given this is the BUTTON's name instead, so pass
   * `boardLabel(city)` there rather than the countdown.
   */
  label?: string
  className?: string
  /**
   * Board it. Given only where the road is actually open: with it the train is
   * a real button, without it the drawing is a readout and must not be
   * focusable or announced as anything you can press.
   */
  onBoard?: () => void
}) {
  const packed = wagonFills(wrapped, goal)
  // The second layer is drawn for wrapped AND collected together, so a wagon
  // reads as filling before the words in it are safe — the platform, then the
  // wagon.
  const waiting = wagonFills(wrapped + collected, goal)

  // Inside a button the drawing is decoration: the button carries the name,
  // and a role="img" with the same words would read it out twice.
  const named = onBoard === undefined && label !== undefined

  const train = (
    <svg
      className={`train-progress ${onBoard === undefined ? className : ''}`.trimEnd()}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g className="cluey-hatch">
        <path className="train-rail" d={`M0 34 H${VB_W}`} />

        {/* The locomotive: boiler, funnel, cab. Always solid — it is not
            progress, it is the thing progress is coupled to. */}
        <g className="train-loco">
          <rect x="2" y="14" width="24" height="13" rx="3" />
          <rect x="6" y="8" width="6" height="6" rx="1" />
          <path d="M26 9 h9 l5 8 v10 h-14 z" />
          <circle cx="9" cy="30" r="4" />
          <circle cx="24" cy="30" r="4" />
          <circle cx="35" cy="30" r="4" />
        </g>

        {packed.map((fill, i) => {
          const x = wagonX(i)
          return (
            <g key={i} className={`train-wagon ${fill === 1 ? 'is-full' : ''}`}>
              <rect
                className="train-load train-load-waiting"
                x={x}
                y="15"
                width={WAGON_W}
                height="12"
                rx="2"
                opacity={waiting[i]}
              />
              <rect
                className="train-load train-load-packed"
                x={x}
                y="15"
                width={WAGON_W}
                height="12"
                rx="2"
                opacity={fill}
              />
              <rect className="train-wagon-body" x={x} y="15" width={WAGON_W} height="12" rx="2" />
              <circle cx={x + 4.5} cy="30" r="3.5" />
              <circle cx={x + WAGON_W - 4.5} cy="30" r="3.5" />
            </g>
          )
        })}
      </g>
    </svg>
  )

  if (onBoard === undefined) return train

  return (
    <button
      type="button"
      className={`train-board ${className}`.trimEnd()}
      aria-label={label}
      onClick={onBoard}
    >
      {train}
    </button>
  )
}
