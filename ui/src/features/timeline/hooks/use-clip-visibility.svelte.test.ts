// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { useClipVisibility, type ClipVisibilityState } from './use-clip-visibility.svelte'
import {
  _resetViewportThrottle,
  useTimelineViewportStore,
} from '@/features/timeline/stores/timeline-viewport-store'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import { act, renderHook } from '../test/render-hook.svelte'

function format(visibility: ClipVisibilityState) {
  return `${visibility.isVisible}:${visibility.visibleStartRatio.toFixed(3)}:${visibility.visibleEndRatio.toFixed(3)}`
}

function renderVisibility(clipLeftPx: number, clipWidthPx: number, geometry?: number) {
  const { result } = renderHook(() =>
    useClipVisibility(
      () => clipLeftPx,
      () => clipWidthPx,
      () => geometry,
    ),
  )
  let value = ''
  // Read inside an effect, as a component would, so the subscription is live.
  const stop = $effect.root(() => {
    $effect(() => {
      value = format(result.current.current)
    })
  })
  act(() => {})
  return {
    get value() {
      return value
    },
    stop,
  }
}

function setViewport(scrollLeft: number, viewportWidth: number) {
  useTimelineViewportStore.getState().setViewport({
    scrollLeft,
    scrollTop: 0,
    viewportWidth,
    viewportHeight: 120,
  })
}

describe('useClipVisibility', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
    _resetViewportThrottle()
    setViewport(0, 1000)
  })

  it('updates visibility when viewport scrolls', () => {
    const probe = renderVisibility(200, 400)

    // Clip at 200-600 in viewport 0-1000: fully visible
    expect(probe.value).toBe('true:0.000:1.000')

    // Viewport resize (non-scroll-only) bypasses throttle and fires immediately
    act(() => setViewport(1000, 900))

    // Clip at 200-600, viewport at 1000-1900, margin 600 → visible range [400, 2500]
    // Clip is partially visible: startRatio = (400-200)/400 = 0.5
    expect(probe.value).toBe('true:0.500:1.000')
    probe.stop()
  })

  it('marks clip as not visible when scrolled far away', () => {
    const probe = renderVisibility(200, 400)
    expect(probe.value).toBe('true:0.000:1.000')

    // Scroll far away — viewport resize bypasses throttle
    act(() => setViewport(5000, 900))

    // Clip at 200-600, visible range [4400, 6500] — clip is outside
    expect(probe.value).toBe('false:0.000:1.000')
    probe.stop()
  })

  it('freezes the last bounded visibility window during zoom interaction', () => {
    const probe = renderVisibility(200, 400)
    expect(probe.value).toBe('true:0.000:1.000')

    // Scroll far away so clip is normally not visible
    act(() => setViewport(5000, 900))
    expect(probe.value).toBe('false:0.000:1.000')

    // Start zoom interaction. The last valid offscreen state remains frozen.
    act(() => useZoomStore.getState().setZoomLevelImmediate(2))
    expect(probe.value).toBe('false:0.000:1.000')

    // Viewport changes during the gesture do not expand or move the window.
    act(() => setViewport(0, 800))
    expect(probe.value).toBe('false:0.000:1.000')

    // Settling zoom recomputes against the current viewport.
    act(() => useZoomStore.getState().setZoomLevelSynchronized(2))
    expect(probe.value).toBe('true:0.000:1.000')
    probe.stop()
  })

  it('stays frozen while the bridged geometry scale lags the settled zoom', () => {
    setViewport(5000, 900)
    const probe = renderVisibility(200, 400, 100)
    expect(probe.value).toBe('false:0.000:1.000')

    // The store has settled at 200 px/s but this clip's geometry is still 100 px/s.
    act(() => {
      useZoomStore.setState({ contentLevel: 2, contentPixelsPerSecond: 200 })
      setViewport(0, 901)
    })
    expect(probe.value).toBe('false:0.000:1.000')
    probe.stop()
  })
})
