// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  _resetTimelineDetailPromotionForTest,
  MIN_TIMELINE_DETAIL_PROMOTION_BATCH_SIZE,
  TIMELINE_DETAIL_PROMOTION_BATCH_SIZE,
} from './use-staged-timeline-detail.svelte'
import Harness from './use-staged-timeline-detail.harness.svelte'
import { act } from '../test/render-hook.svelte'

let nextAnimationFrameId = 1
let animationFrames = new Map<number, FrameRequestCallback>()
let animationFrameTimestamp = 0

function flushOneAnimationFrame(frameDuration = 16) {
  const entry = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined
  if (!entry) return
  animationFrames.delete(entry[0])
  animationFrameTimestamp += frameDuration
  entry[1](animationFrameTimestamp)
}

function count(testId = 'promoted-ids') {
  return screen.getByTestId(testId).textContent?.split(',').filter(Boolean).length ?? 0
}

describe('useStagedTimelineDetailIds', () => {
  beforeEach(() => {
    _resetTimelineDetailPromotionForTest()
    nextAnimationFrameId = 1
    animationFrames = new Map()
    animationFrameTimestamp = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId++
      animationFrames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrames.delete(id)
    })
  })

  it('demotes immediately and promotes newly detailed clips in bounded frames', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `clip-${index}`)
    const view = render(Harness, { probes: [{ eligibleIds: ids, isZoomInteracting: false }] })
    expect(count()).toBe(10)

    await view.rerender({ probes: [{ eligibleIds: [], isZoomInteracting: false }] })
    expect(screen.getByTestId('promoted-ids')).toHaveTextContent('')

    await view.rerender({ probes: [{ eligibleIds: ids, isZoomInteracting: true }] })
    expect(screen.getByTestId('promoted-ids')).toHaveTextContent('')

    await view.rerender({ probes: [{ eligibleIds: ids, isZoomInteracting: false }] })
    expect(screen.getByTestId('promoted-ids')).toHaveTextContent('')

    act(flushOneAnimationFrame)
    expect(count()).toBe(MIN_TIMELINE_DETAIL_PROMOTION_BATCH_SIZE)

    let previousCount = MIN_TIMELINE_DETAIL_PROMOTION_BATCH_SIZE
    while (count() < 10) {
      act(flushOneAnimationFrame)
      const nextCount = count()
      expect(nextCount - previousCount).toBeLessThanOrEqual(TIMELINE_DETAIL_PROMOTION_BATCH_SIZE)
      previousCount = nextCount
    }
    expect(count()).toBe(10)
  })

  it('shares one promotion budget across visible tracks', async () => {
    const firstIds = Array.from({ length: 8 }, (_, index) => `first-${index}`)
    const secondIds = Array.from({ length: 8 }, (_, index) => `second-${index}`)
    const view = render(Harness, {
      probes: [
        { eligibleIds: [], isZoomInteracting: true, testId: 'first' },
        { eligibleIds: [], isZoomInteracting: true, testId: 'second' },
      ],
    })

    await view.rerender({
      probes: [
        { eligibleIds: firstIds, isZoomInteracting: false, testId: 'first' },
        { eligibleIds: secondIds, isZoomInteracting: false, testId: 'second' },
      ],
    })
    act(flushOneAnimationFrame)
    act(flushOneAnimationFrame)

    const firstCount = count('first')
    const secondCount = count('second')
    expect(firstCount + secondCount).toBe(MIN_TIMELINE_DETAIL_PROMOTION_BATCH_SIZE * 2)
    expect(firstCount).toBeGreaterThan(0)
    expect(secondCount).toBeGreaterThan(0)
  })

  it('grows its batch only on stable frames and falls back after a missed frame', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => `adaptive-${index}`)
    const view = render(Harness, { probes: [{ eligibleIds: [], isZoomInteracting: true }] })
    await view.rerender({ probes: [{ eligibleIds: ids, isZoomInteracting: false }] })

    act(flushOneAnimationFrame)
    act(flushOneAnimationFrame)
    act(flushOneAnimationFrame)
    const beforeGrowth = count()
    act(flushOneAnimationFrame)
    const afterGrowth = count()
    expect(afterGrowth - beforeGrowth).toBe(2)

    act(() => flushOneAnimationFrame(40))
    const afterSlowFrame = count()
    expect(afterSlowFrame - afterGrowth).toBe(MIN_TIMELINE_DETAIL_PROMOTION_BATCH_SIZE)
  })
})
