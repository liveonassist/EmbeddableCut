// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { getHeldFrameRate, resolveHeldTimelineFrame } from './clip-frame-rate'

const clip = (overrides: { from?: number; frameRate?: number; type?: string } = {}) => ({
  type: 'video',
  from: 0,
  ...overrides,
})

const heldFrames = (item: ReturnType<typeof clip>, frames: number[], fps = 30) =>
  frames.map((frame) => resolveHeldTimelineFrame(item, frame, fps))

describe('clip frame rate', () => {
  it('holds each picture for fps / frameRate frames', () => {
    expect(heldFrames(clip({ frameRate: 2 }), [0, 14, 15, 29, 30])).toEqual([0, 0, 15, 15, 30])
  })

  it('starts each step on the first frame inside it when the ratio is fractional', () => {
    // 30 / 12 = 2.5 frames per step: steps begin at 0, 2.5, 5, 7.5.
    expect(heldFrames(clip({ frameRate: 12 }), [0, 1, 2, 3, 4, 5, 7, 8])).toEqual([
      0, 0, 0, 3, 3, 5, 5, 8,
    ])
  })

  it('keeps the halves of a split clip stepping together', () => {
    const left = clip({ frameRate: 2 })
    const right = clip({ from: 15, frameRate: 2 })
    expect(heldFrames(left, [14])).toEqual([0])
    expect(heldFrames(right, [15, 29, 30])).toEqual([15, 15, 30])
  })

  it('holds a clip that starts mid-step on its own first frame', () => {
    expect(heldFrames(clip({ from: 20, frameRate: 2 }), [20, 29, 30])).toEqual([20, 20, 30])
  })

  it('plays every frame when the rate is unset, invalid or not below the timeline fps', () => {
    for (const frameRate of [undefined, 0, -5, Number.NaN, 30, 60]) {
      expect(getHeldFrameRate(clip({ frameRate }), 30)).toBeNull()
    }
    expect(getHeldFrameRate(clip({ type: 'audio', frameRate: 2 }), 30)).toBeNull()
    expect(heldFrames(clip({ frameRate: 30 }), [7])).toEqual([7])
  })
})
