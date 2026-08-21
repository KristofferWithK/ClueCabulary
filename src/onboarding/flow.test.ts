import { describe, expect, it } from 'vitest'
import {
  ONBOARD_KEY,
  decideOnboarding,
  isOnboardStep,
  markOnboardDone,
  writeOnboardStep,
} from './flow'
import { HOWTO_KEY } from '../stores/uiStore'

/** vitest runs under node — no localStorage — so every call injects one. */
function storage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  }
}

/** A persisted SRS record the shape zustand writes. */
const srsRecord = (stats: Record<string, unknown>) =>
  JSON.stringify({ state: { stats, games: { played: 1 } }, version: 3 })

describe('the onboarding gate', () => {
  it('runs on a genuinely fresh device: no marker, no howto, empty SRS', () => {
    expect(decideOnboarding(storage())).toEqual({ kind: 'fresh' })
  })

  it('never ambushes a device that has seen the rules', () => {
    expect(decideOnboarding(storage({ [HOWTO_KEY]: 'seen' }))).toEqual({
      kind: 'veteran',
    })
  })

  it('never ambushes a device with words in the SRS map', () => {
    const s = storage({ 'cluecab-srs-v1': srsRecord({ 'da:mor': { box: 2 } }) })
    expect(decideOnboarding(s)).toEqual({ kind: 'veteran' })
  })

  it('treats an SRS record with an EMPTY stats map as fresh', () => {
    // The store can be written with nothing in it (a settings change persists
    // sibling stores in some flows). No words means nothing was played.
    const s = storage({ 'cluecab-srs-v1': srsRecord({}) })
    expect(decideOnboarding(s)).toEqual({ kind: 'fresh' })
  })

  it('treats an unreadable SRS record as veteran — fresh must be proven', () => {
    const s = storage({ 'cluecab-srs-v1': 'not json {' })
    expect(decideOnboarding(s)).toEqual({ kind: 'veteran' })
  })

  it('resumes a flow that was started and not finished', () => {
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'ticket' }))).toEqual({
      kind: 'resume',
      step: 'ticket',
    })
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'train' }))).toEqual({
      kind: 'resume',
      step: 'train',
    })
  })

  it('restarts at the train on a step this build does not know', () => {
    // A newer build's step after a downgrade: the flow was begun, keep it.
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'tour-of-2027' }))).toEqual({
      kind: 'resume',
      step: 'train',
    })
  })

  it('is done once the marker says so, whatever else is stored', () => {
    const s = storage({
      [ONBOARD_KEY]: 'done',
      [HOWTO_KEY]: 'seen',
      'cluecab-srs-v1': srsRecord({ 'da:hus': {} }),
    })
    expect(decideOnboarding(s)).toEqual({ kind: 'done' })
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'done' }))).toEqual({
      kind: 'done',
    })
  })

  it('lands on done when storage throws — never ambush what cannot be read', () => {
    const throwing = {
      getItem: () => {
        throw new Error('private mode')
      },
    }
    expect(decideOnboarding(throwing)).toEqual({ kind: 'done' })
    expect(decideOnboarding(undefined)).toEqual({ kind: 'done' })
  })

  it('round-trips its own markers', () => {
    const s = storage()
    writeOnboardStep('ticket', s)
    expect(decideOnboarding(s)).toEqual({ kind: 'resume', step: 'ticket' })
    markOnboardDone(s)
    expect(decideOnboarding(s)).toEqual({ kind: 'done' })
    expect(s.dump()).toEqual({ [ONBOARD_KEY]: 'done' })
  })

  it('knows exactly the steps that ship: the train through O3’s arrival', () => {
    expect(isOnboardStep('train')).toBe(true)
    expect(isOnboardStep('ticket')).toBe(true)
    expect(isOnboardStep('tutorial')).toBe(true)
    expect(isOnboardStep('tour')).toBe(true)
    expect(isOnboardStep('arrival')).toBe(true)
    expect(isOnboardStep('done')).toBe(false)
    expect(isOnboardStep(null)).toBe(false)
  })

  it('resumes a reload during the tour or at the arrival where it was', () => {
    // Without these two in isOnboardStep the marker would read as unknown and
    // the flow would restart at the train — a player who just WON the tutorial
    // sent back to “Hej! I’m Casey”. Checked to fail: drop 'tour' from
    // isOnboardStep and this pins the regression.
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'tour' }))).toEqual({
      kind: 'resume',
      step: 'tour',
    })
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'arrival' }))).toEqual({
      kind: 'resume',
      step: 'arrival',
    })
  })

  it('resumes a device that reloaded mid-tutorial at the tutorial', () => {
    // The language-choice reload and any mid-round reload both land here —
    // the marker goes down BEFORE setActiveLanguage() reloads (see
    // OnboardingScreen's choose), so this is the step the way back up reads.
    expect(decideOnboarding(storage({ [ONBOARD_KEY]: 'tutorial' }))).toEqual({
      kind: 'resume',
      step: 'tutorial',
    })
  })

  it('spells the howto key the way uiStore does', () => {
    // flow.ts carries its own literal to stay import-free; this is the pin
    // that keeps the two spellings from drifting when the overlay bumps to v5.
    const s = storage()
    // Only the howto key set: the gate must read it as veteran, which proves
    // the literal inside flow.ts is the SAME key uiStore writes.
    s.setItem(HOWTO_KEY, 'seen')
    expect(decideOnboarding(s)).toEqual({ kind: 'veteran' })
  })
})
