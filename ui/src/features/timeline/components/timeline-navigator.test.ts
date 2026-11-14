// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import TimelineNavigator from './timeline-navigator.svelte'
import { getNavigatorResizeDragResult, getNavigatorThumbMetrics } from './timeline-navigator-utils'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import { ZOOM_MIN } from '@/features/timeline/constants'
import { TIMELINE_LIVE_SCROLL_EVENT } from '@/shared/timeline/live-scroll-sync'

// React's `act` flushes synchronously without draining microtasks; dispatch,
// then flush, to keep the same ordering against the zoom microtask.
function act(dispatch: () => unknown): void {
  void dispatch()
  flushSync()
}

function captureAnimationFrames(): FrameRequestCallback[] {
  const frameCallbacks: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallbacks.push(callback)
    return frameCallbacks.length
  })
  return frameCallbacks
}

describe('timeline navigator resize math', () => {
  it('keeps scroll pinned to zero when the right handle expands from the far left', () => {
    const result = getNavigatorResizeDragResult({
      dragTarget: 'right',
      deltaX: 40,
      dragStartThumbLeft: 0,
      dragStartThumbWidth: 80,
      trackWidth: 300,
      viewportWidth: 1200,
      contentDuration: 60,
    })

    expect(result.nextThumbLeft).toBe(0)
    expect(result.nextScrollLeft).toBe(0)
  })

  it('keeps the right edge fixed when dragging the left handle', () => {
    const result = getNavigatorResizeDragResult({
      dragTarget: 'left',
      deltaX: 20,
      dragStartThumbLeft: 60,
      dragStartThumbWidth: 90,
      trackWidth: 300,
      viewportWidth: 1200,
      contentDuration: 60,
    })

    expect(result.targetThumbWidth).toBe(70)
    expect(result.nextThumbLeft + result.targetThumbWidth).toBe(150)
  })

  it('stops resizing and scrolling once the minimum zoom thumb width is reached', () => {
    const input = {
      dragTarget: 'right' as const,
      dragStartThumbLeft: 30,
      dragStartThumbWidth: 40,
      trackWidth: 300,
      viewportWidth: 1200,
      contentDuration: 6000,
    }

    const atMinimum = getNavigatorResizeDragResult({ ...input, deltaX: 20 })
    const draggedPastMinimum = getNavigatorResizeDragResult({ ...input, deltaX: 200 })

    expect(atMinimum.nextZoom).toBe(ZOOM_MIN)
    expect(draggedPastMinimum.nextZoom).toBe(ZOOM_MIN)
    expect(draggedPastMinimum.targetThumbWidth).toBeCloseTo(atMinimum.targetThumbWidth)
    expect(draggedPastMinimum.nextThumbLeft).toBeCloseTo(atMinimum.nextThumbLeft)
    expect(draggedPastMinimum.nextScrollLeft).toBeCloseTo(atMinimum.nextScrollLeft)
  })
})

describe('timeline navigator interaction', () => {
  beforeEach(() => {
    useTimelineSettingsStore.setState({ fps: 30 })
    useItemsStore.getState().setItems([])
    useItemsStore.getState().setTracks([])
    useZoomStore.getState().setZoomLevelSynchronized(1)
    useTimelineViewportStore.getState().setViewport({
      scrollLeft: 120,
      scrollTop: 0,
      viewportWidth: 300,
      viewportHeight: 100,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not bubble thumb clicks into a track recenter', () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 120

    const { getByTestId } = render(TimelineNavigator, { actualDuration: 10, scrollContainer })

    act(() => fireEvent.click(getByTestId('timeline-navigator-thumb')))

    expect(scrollContainer.scrollLeft).toBe(120)
  })

  it('does not rewrite the thumb for scroll-only viewport publications', () => {
    const scrollContainer = document.createElement('div')
    const { getByTestId } = render(TimelineNavigator, { actualDuration: 10, scrollContainer })
    const thumb = getByTestId('timeline-navigator-thumb')
    thumb.style.left = '7px'

    act(() => useTimelineViewportStore.setState({ scrollLeft: 240 }))

    expect(thumb.style.left).toBe('7px')
  })

  it('keeps live wheel zoom and anchor scrolling synchronized before content settles', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollContainer = document.createElement('div')

    const { getByTestId } = render(TimelineNavigator, { actualDuration: 10, scrollContainer })

    const thumb = getByTestId('timeline-navigator-thumb')
    const initialWidth = thumb.style.width

    useZoomStore.getState().setZoomLevelImmediate(0.5)
    scrollContainer.scrollLeft = 200
    await Promise.resolve()
    flushSync()

    const expected = getNavigatorThumbMetrics({
      timelineWidth: 740,
      viewportWidth: 300,
      trackWidth: 400,
      scrollLeft: 200,
    })
    expect(thumb.style.width).not.toBe(initialWidth)
    expect(Number.parseFloat(thumb.style.width)).toBeCloseTo(expected.thumbWidth)
    expect(Number.parseFloat(thumb.style.left)).toBeCloseTo(expected.thumbLeft)
  })

  it('previews handle resizing immediately and flushes the final drag on release', async () => {
    const frameCallbacks = captureAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 120

    const { getByTestId, rerender } = render(TimelineNavigator, {
      actualDuration: 10,
      scrollContainer,
    })

    const thumb = getByTestId('timeline-navigator-thumb')
    const initialWidth = thumb.style.width
    act(() => fireEvent.mouseDown(getByTestId('timeline-navigator-right-handle'), { clientX: 200 }))
    act(() => fireEvent.mouseMove(window, { clientX: 240 }))

    const previewWidth = thumb.style.width
    expect(previewWidth).not.toBe(initialWidth)
    expect(frameCallbacks).toHaveLength(1)

    await rerender({ actualDuration: 10, scrollContainer })
    expect(thumb.style.width).toBe(previewWidth)

    act(() => fireEvent.mouseUp(window))

    expect(useZoomStore.getState().level).not.toBe(1)
    expect(thumb.style.width).toBe(previewWidth)
  })

  it('publishes navigator pan and zoom geometry before each drag frame paints', () => {
    const frameCallbacks = captureAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 120
    const liveViewportChange = vi.fn()
    scrollContainer.addEventListener(TIMELINE_LIVE_SCROLL_EVENT, liveViewportChange)

    const { getByTestId } = render(TimelineNavigator, { actualDuration: 10, scrollContainer })

    act(() => fireEvent.mouseDown(getByTestId('timeline-navigator-thumb'), { clientX: 200 }))
    act(() => fireEvent.mouseMove(window, { clientX: 230 }))
    act(() => frameCallbacks.shift()?.(0))
    expect(liveViewportChange).toHaveBeenCalledTimes(1)
    act(() => fireEvent.mouseUp(window))

    liveViewportChange.mockClear()
    act(() => fireEvent.mouseDown(getByTestId('timeline-navigator-right-handle'), { clientX: 250 }))
    act(() => fireEvent.mouseMove(window, { clientX: 280 }))
    act(() => frameCallbacks.shift()?.(16))
    expect(liveViewportChange).toHaveBeenCalledTimes(1)
    act(() => fireEvent.mouseUp(window))
  })

  it('does not pan when a resize handle is dragged past minimum zoom', () => {
    const frameCallbacks = captureAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 2000

    const { getByTestId } = render(TimelineNavigator, { actualDuration: 1000, scrollContainer })

    const thumb = getByTestId('timeline-navigator-thumb')
    act(() => fireEvent.mouseDown(getByTestId('timeline-navigator-right-handle'), { clientX: 200 }))
    act(() => fireEvent.mouseMove(window, { clientX: 300 }))
    frameCallbacks.shift()?.(0)
    const minimumWidth = thumb.style.width
    const minimumLeft = thumb.style.left
    const minimumScrollLeft = scrollContainer.scrollLeft

    act(() => fireEvent.mouseMove(window, { clientX: 500 }))
    frameCallbacks.shift()?.(16)

    expect(thumb.style.width).toBe(minimumWidth)
    expect(thumb.style.left).toBe(minimumLeft)
    expect(scrollContainer.scrollLeft).toBe(minimumScrollLeft)

    act(() => fireEvent.mouseUp(window))
    expect(scrollContainer.scrollLeft).toBe(minimumScrollLeft)
    expect(useZoomStore.getState()).toMatchObject({
      level: ZOOM_MIN,
      contentLevel: ZOOM_MIN,
      isZoomInteracting: false,
    })

    // Simulate the browser clamping scrollLeft while the newly settled content
    // width commits. The release handoff restores the exact clamped resize view
    // before the next paint instead of letting that clamp become a pan.
    scrollContainer.scrollLeft = minimumScrollLeft + 200
    frameCallbacks.shift()?.(32)
    expect(scrollContainer.scrollLeft).toBe(minimumScrollLeft)
  })

  it('rebases an active handle drag when the navigator track resizes', () => {
    captureAnimationFrames()
    let currentTrackWidth = 400
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => currentTrackWidth,
    )
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 120

    const { getByTestId } = render(TimelineNavigator, { actualDuration: 10, scrollContainer })

    const initialMetrics = getNavigatorThumbMetrics({
      timelineWidth: 1240,
      viewportWidth: 300,
      trackWidth: 400,
      scrollLeft: 120,
    })
    act(() => fireEvent.mouseDown(getByTestId('timeline-navigator-right-handle'), { clientX: 200 }))
    act(() => fireEvent.mouseMove(window, { clientX: 240 }))

    const firstDrag = getNavigatorResizeDragResult({
      dragTarget: 'right',
      deltaX: 40,
      dragStartThumbLeft: initialMetrics.thumbLeft,
      dragStartThumbWidth: initialMetrics.thumbWidth,
      trackWidth: 400,
      viewportWidth: 300,
      contentDuration: 10,
    })
    const rebasedMetrics = getNavigatorThumbMetrics({
      timelineWidth: firstDrag.nextTimelineWidth,
      viewportWidth: 300,
      trackWidth: 800,
      scrollLeft: firstDrag.nextScrollLeft,
    })

    currentTrackWidth = 800
    act(() => fireEvent.mouseMove(window, { clientX: 250 }))

    const finalDrag = getNavigatorResizeDragResult({
      dragTarget: 'right',
      deltaX: 10,
      dragStartThumbLeft: rebasedMetrics.thumbLeft,
      dragStartThumbWidth: rebasedMetrics.thumbWidth,
      trackWidth: 800,
      viewportWidth: 300,
      contentDuration: 10,
    })
    const finalMetrics = getNavigatorThumbMetrics({
      timelineWidth: finalDrag.nextTimelineWidth,
      viewportWidth: 300,
      trackWidth: 800,
      scrollLeft: finalDrag.nextScrollLeft,
    })
    const thumb = getByTestId('timeline-navigator-thumb')
    expect(Number.parseFloat(thumb.style.width)).toBeCloseTo(finalMetrics.thumbWidth)
    expect(Number.parseFloat(thumb.style.left)).toBeCloseTo(finalMetrics.thumbLeft)

    act(() => fireEvent.mouseUp(window))

    expect(useZoomStore.getState().level).toBeCloseTo(finalDrag.nextZoom)
  })
})
