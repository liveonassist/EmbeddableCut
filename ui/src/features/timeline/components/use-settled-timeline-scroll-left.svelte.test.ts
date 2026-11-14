// SPDX-License-Identifier: MIT
// oxlint-disable react-hooks/rules-of-hooks -- hooks run in an effect root, not a component

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  _resetViewportThrottle,
  useTimelineViewportStore,
} from '@/features/timeline/stores/timeline-viewport-store'
import {
  EDIT_DOPESHEET_PAN_REBASE_VIEWPORT_RATIO,
  EDIT_DOPESHEET_PAN_SETTLE_MS,
  useSettledTimelineGeometry,
  useSettledTimelineScrollLeft,
} from './use-settled-timeline-scroll-left.svelte'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import { act, actAsync, renderHook } from '../test/render-hook.svelte'

describe('useSettledTimelineScrollLeft', () => {
  const unmounts: Array<() => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))
    _resetViewportThrottle()
    _resetZoomStoreForTest()
    useTimelineViewportStore.getState().setViewportImmediate({
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 640,
      viewportHeight: 320,
    })
  })

  afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount())
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('publishes the live DOM position after pan settles', () => {
    const container = document.createElement('div')
    container.scrollLeft = 20
    const { result, unmount } = renderHook(() =>
      useSettledTimelineScrollLeft(
        () => container,
        () => true,
      ),
    )
    unmounts.push(unmount)

    expect(result.current.current).toBe(20)

    act(() => {
      container.scrollLeft = 80
      container.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(EDIT_DOPESHEET_PAN_SETTLE_MS - 1)
    })
    expect(result.current.current).toBe(20)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.current).toBe(80)
  })

  it('rebases only after the compositor pan crosses a viewport-relative distance', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 200 })
    const { result, unmount } = renderHook(() =>
      useSettledTimelineScrollLeft(
        () => container,
        () => true,
      ),
    )
    unmounts.push(unmount)

    const rebaseDistance = 200 * EDIT_DOPESHEET_PAN_REBASE_VIEWPORT_RATIO
    act(() => {
      container.scrollLeft = rebaseDistance - 1
      container.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.current).toBe(0)

    act(() => {
      container.scrollLeft = rebaseDistance
      container.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.current).toBe(rebaseDistance)
  })

  it('publishes zoom and its anchored scroll position as one settled snapshot', async () => {
    const container = document.createElement('div')
    container.scrollLeft = 100
    let pixelsPerSecond = $state(100)
    const { result, unmount } = renderHook(() =>
      useSettledTimelineGeometry(
        () => container,
        () => true,
        () => pixelsPerSecond,
      ),
    )
    unmounts.push(unmount)
    const snapshot = () => ({
      scrollLeft: result.current.scrollLeft,
      pixelsPerSecond: result.current.pixelsPerSecond,
    })

    act(() => vi.runOnlyPendingTimers())
    expect(snapshot()).toEqual({ scrollLeft: 100, pixelsPerSecond: 100 })

    act(() => {
      useZoomStore.setState({
        level: 1.5,
        pixelsPerSecond: 150,
        isZoomInteracting: true,
      })
      container.scrollLeft = 180
      container.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(EDIT_DOPESHEET_PAN_SETTLE_MS)
    })
    expect(snapshot()).toEqual({ scrollLeft: 100, pixelsPerSecond: 100 })

    act(() => {
      useZoomStore.setState({
        contentLevel: 1.5,
        contentPixelsPerSecond: 150,
        isZoomInteracting: false,
      })
      pixelsPerSecond = 150
    })
    await actAsync(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })
    expect(snapshot()).toEqual({ scrollLeft: 180, pixelsPerSecond: 150 })
  })
})
