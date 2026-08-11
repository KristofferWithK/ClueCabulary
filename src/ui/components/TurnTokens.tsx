export function TurnTokens({ total, left }: { total: number; left: number }) {
  return (
    <div className="turn-tokens" aria-label={`${left} of ${total} clues left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`token ${i < left ? 'token-full' : 'token-spent'}`} />
      ))}
    </div>
  )
}
