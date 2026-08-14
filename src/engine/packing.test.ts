import { describe, expect, it } from 'vitest'
import { matchesDanishAnswer } from './packing'

/**
 * The packing grader mirrors redemption's discipline in the other direction.
 * Mutation-checked: removing the isDanish guard fails the «hær»/«havn» tests;
 * removing the article strip fails «et hus».
 */

/** A stand-in headword list, playing isDanishWord's part. */
const DANISH = new Set(['hus', 'kat', 'her', 'hær', 'lampe', 'lappe', 'løbe', 'løb', 'små'])
const isDanish = (s: string) => DANISH.has(s)

describe('matchesDanishAnswer', () => {
  it('accepts the citation form, case and spacing forgiven', () => {
    expect(matchesDanishAnswer('hus', 'hus', isDanish)).toBe(true)
    expect(matchesDanishAnswer('  Hus ', 'hus', isDanish)).toBe(true)
  })

  it('accepts the article the card taught, and the infinitive marker', () => {
    expect(matchesDanishAnswer('et hus', 'hus', isDanish)).toBe(true)
    expect(matchesDanishAnswer('en kat', 'kat', isDanish)).toBe(true)
    expect(matchesDanishAnswer('at løbe', 'løbe', isDanish)).toBe(true)
  })

  it('accepts an inflection — packing is a gate, not an exam', () => {
    expect(matchesDanishAnswer('huset', 'hus', isDanish)).toBe(true)
    expect(matchesDanishAnswer('katten', 'kat', isDanish)).toBe(true)
  })

  it('accepts the keyboard-less spellings of æ, ø and å', () => {
    expect(matchesDanishAnswer('laerer', 'lærer', isDanish)).toBe(true)
    expect(matchesDanishAnswer('oel', 'øl', isDanish)).toBe(true)
    expect(matchesDanishAnswer('gaa', 'gå', isDanish)).toBe(true)
  })

  it('forgives a typo on a long word, by the same scale redemption uses', () => {
    expect(matchesDanishAnswer('leijlighed', 'lejlighed', isDanish)).toBe(true)
    expect(matchesDanishAnswer('morgenmadd', 'morgenmad', isDanish)).toBe(true)
  })

  it('gives a short word no slack at all — the å IS the word', () => {
    expect(matchesDanishAnswer('sma', 'små', isDanish)).toBe(false)
    expect(matchesDanishAnswer('hos', 'hus', isDanish)).toBe(false)
  })

  it('rejects a real Danish word that is not the target, however close', () => {
    // «lappe» is one edit from «lampe» and within its tolerance — but it is a
    // verb, not a typo.
    expect(matchesDanishAnswer('lappe', 'lampe', isDanish)).toBe(false)
    // «hær» is one edit from «her», and it is an army.
    expect(matchesDanishAnswer('hær', 'her', isDanish)).toBe(false)
  })

  it('without the headword list, distance alone decides', () => {
    // The guard needs the dataset; the engine holds none. Callers inject it —
    // this pins that the two rejections above are the GUARD's work.
    expect(matchesDanishAnswer('lappe', 'lampe', undefined)).toBe(true)
  })

  it('rejects emptiness and unrelated words', () => {
    expect(matchesDanishAnswer('', 'hus', isDanish)).toBe(false)
    expect(matchesDanishAnswer('   ', 'hus', isDanish)).toBe(false)
    expect(matchesDanishAnswer('sommerfugl', 'hus', isDanish)).toBe(false)
  })

  it('the answer own-word guard never blocks the target itself', () => {
    // «løbe» is in the headword list AND is the target: exact match wins
    // before the guard is consulted.
    expect(matchesDanishAnswer('løbe', 'løbe', isDanish)).toBe(true)
    // And an inflection of the target whose surface form is not a headword
    // passes the guard on its way to the stem check.
    expect(matchesDanishAnswer('løber', 'løbe', isDanish)).toBe(true)
  })
})
