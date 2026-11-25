// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { resolveVideoTwins } from './video-twins'

const clip = (id: string, overrides: object = {}) => ({
  id,
  mediaId: 'media',
  src: 'blob:media',
  from: 100,
  durationInFrames: 300,
  speed: 1,
  sourceStart: 50,
  sourceDuration: 6000,
  sourceFps: 60,
  ...overrides,
})

const twins = (items: ReturnType<typeof clip>[], excluded: string[] = []) =>
  Object.fromEntries(resolveVideoTwins(items, 30, new Set(excluded)))

describe('resolveVideoTwins', () => {
  it('pairs a copy with its clip', () => {
    expect(twins([clip('a'), clip('b')])).toEqual({ b: 'a' })
  })

  it('pairs a shorter copy, trimmed to the same moment of the source, with the longer', () => {
    // 20 timeline frames in is 40 source frames in, at twice the frame rate.
    const trimmed = clip('trimmed', { from: 120, durationInFrames: 100, sourceStart: 90 })
    expect(twins([trimmed, clip('whole')])).toEqual({ trimmed: 'whole' })
  })

  it('pairs both halves of a split clip with its whole copy, despite the rounding', () => {
    const source = { from: 0, sourceStart: 0, sourceFps: 29.97 }
    expect(
      twins([
        clip('left', { ...source, durationInFrames: 60 }),
        clip('right', { ...source, from: 60, durationInFrames: 240, sourceStart: 60 }),
        clip('copy', { ...source }),
      ]),
    ).toEqual({ left: 'copy', right: 'copy' })
  })

  it('leaves clips that show another moment, or run past the other, to themselves', () => {
    expect(
      twins([
        clip('a'),
        clip('slipped', { sourceStart: 51 }),
        clip('moved', { from: 101 }),
        clip('faster', { speed: 2 }),
        clip('reversed', { isReversed: true }),
        clip('later', { from: 250, sourceStart: 350 }),
        clip('other media', { mediaId: 'other', src: 'blob:other' }),
      ]),
    ).toEqual({})
  })

  it('leaves clips in a transition to themselves', () => {
    expect(twins([clip('a'), clip('b')], ['a'])).toEqual({})
  })
})
