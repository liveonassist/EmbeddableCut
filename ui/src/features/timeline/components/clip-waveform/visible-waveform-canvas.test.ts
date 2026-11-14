// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  computeLiveViewportWaveformCanvasGeometry,
  computeTimelineWaveformCanvasGeometry,
  computeVisibleWaveformCanvasGeometry,
} from './visible-waveform-canvas-geometry'
import Harness from './visible-waveform-canvas.harness.svelte'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'

// React's async act() drains a few extra microtask turns after its callback;
// the shared canvas scheduler can need them to pass its cadence gate (its
// last-run timestamps outlive each test's fake frame clock).
async function act(update: () => Promise<void> | void): Promise<void> {
  await update()
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
  flushSync()
}

beforeEach(() => {
  let frameTimestamp = 0
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++frameId
    queueMicrotask(() => callback((frameTimestamp += 40)))
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  _resetZoomStoreForTest()
  useTimelineViewportStore.setState({
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 0,
    viewportHeight: 0,
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const LONG_TIMELINE_ITEM = {
  'data-timeline-start-frame': '0',
  'data-timeline-duration-frames': '60000',
  'data-timeline-fps': '30',
  'data-timeline-content-inset-start-px': '1',
  'data-timeline-content-inset-end-px': '1',
}

function mockCanvasContext(extra: Record<string, unknown> = {}): CanvasRenderingContext2D {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    ...extra,
  } as unknown as CanvasRenderingContext2D
  ;(
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
      mockReturnValue: (value: CanvasRenderingContext2D) => void
    }
  ).mockReturnValue(ctx)
  return ctx
}

describe('computeVisibleWaveformCanvasGeometry', () => {
  it('creates a whole-pixel canvas for only the visible clip window', () => {
    expect(computeVisibleWaveformCanvasGeometry(100_000, 49_999.4, 51_920.2)).toEqual({
      left: 49_999,
      width: 1_922,
    })
  })

  it('clamps the canvas to the clip without expanding to the full duration', () => {
    expect(computeVisibleWaveformCanvasGeometry(2_000, -20, 2_040)).toEqual({
      left: 0,
      width: 2_000,
    })
    expect(computeVisibleWaveformCanvasGeometry(2_000, 2_100, 2_200)).toEqual({
      left: 2_000,
      width: 0,
    })
  })

  it('keeps a long live clip bounded to the real viewport plus overscan', () => {
    expect(
      computeLiveViewportWaveformCanvasGeometry({
        hostLeft: -10_000,
        hostWidth: 200_000,
        viewportLeft: 713,
        viewportWidth: 1331,
        overscanPx: 600,
      }),
    ).toEqual({
      left: 10_113,
      width: 2531,
    })
  })

  it('derives the live canvas from frame bounds, viewport state, and fixed content insets', () => {
    expect(
      computeTimelineWaveformCanvasGeometry({
        startFrame: 0,
        durationFrames: 60_000,
        fps: 30,
        pixelsPerSecond: 100,
        scrollLeft: 10_714,
        viewportWidth: 1331,
        overscanPx: 600,
        contentInsetStartPx: 1,
        contentInsetEndPx: 1,
      }),
    ).toEqual({
      left: 10_113,
      width: 2531,
    })
  })

  it('rejects invalid arithmetic bounds so callers can retain the DOM fallback', () => {
    expect(
      computeTimelineWaveformCanvasGeometry({
        startFrame: 0,
        durationFrames: 60,
        fps: 0,
        pixelsPerSecond: 100,
        scrollLeft: 0,
        viewportWidth: 1000,
        overscanPx: 600,
      }),
    ).toBeNull()
  })
})

describe('VisibleWaveformCanvas', () => {
  it('commits layout, backing size, and waveform drawing atomically on rerender', async () => {
    const ctx = mockCanvasContext()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const renderWindow = vi.fn()
    const props = {
      width: 1000,
      height: 24,
      visibleStartPx: 100,
      visibleEndPx: 300,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      renderWindow,
    }

    const { container, rerender } = render(Harness, props)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.style.left).toBe('100px')
    expect(canvas!.style.width).toBe('200px')
    expect(canvas!.width).toBe(400)
    expect(canvas!.height).toBe(48)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 100, 200)

    await rerender({
      width: 2000,
      visibleStartPx: 500,
      visibleEndPx: 900,
      version: 'zoom-2',
    })

    expect(canvas!.style.left).toBe('500px')
    expect(canvas!.style.width).toBe('400px')
    expect(canvas!.width).toBe(800)
    expect(canvas!.height).toBe(48)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 500, 400)
  })

  it('skips an identical live draw but redraws when waveform content changes', async () => {
    const clearRect = vi.fn()
    const widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set')
    const heightSetter = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set')
    const ctx = mockCanvasContext({ clearRect })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    useZoomStore.setState({ pixelsPerSecond: 100, isZoomInteracting: true })
    useTimelineViewportStore.setState({
      scrollLeft: 10_714,
      viewportWidth: 1331,
    })
    const renderWindow = vi.fn()

    const { container, rerender } = render(Harness, {
      timelineItem: LONG_TIMELINE_ITEM,
      width: 200_000,
      height: 24,
      visibleStartPx: 50_000,
      visibleEndPx: 50_100,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      contentVersion: 'samples-1',
      liveTimelineViewport: true,
      liveViewportOverscanPx: 600,
      renderWindow,
    })
    const canvas = container.querySelector('canvas')!
    const initialDrawCount = renderWindow.mock.calls.length
    const initialClearCount = clearRect.mock.calls.length
    const initialBackingWidth = canvas.width
    const initialWidthAssignmentCount = widthSetter.mock.calls.length
    const initialHeightAssignmentCount = heightSetter.mock.calls.length

    await rerender({
      contentVersion: 'samples-1',
      version: 'zoom-2',
      viewportVersion: 'viewport-2',
    })

    expect(renderWindow).toHaveBeenCalledTimes(initialDrawCount)
    expect(clearRect).toHaveBeenCalledTimes(initialClearCount)
    expect(canvas.width).toBe(initialBackingWidth)

    await rerender({
      contentVersion: 'samples-2',
      version: 'zoom-2',
      viewportVersion: 'viewport-2',
    })

    expect(renderWindow).toHaveBeenCalledTimes(initialDrawCount + 1)
    expect(clearRect).toHaveBeenCalledTimes(initialClearCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 10_113, 2531)
    expect(widthSetter).toHaveBeenCalledTimes(initialWidthAssignmentCount)
    expect(heightSetter).toHaveBeenCalledTimes(initialHeightAssignmentCount)
  })

  it('repositions a live timeline canvas arithmetically without layout reads', async () => {
    const ctx = mockCanvasContext()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    useZoomStore.setState({ pixelsPerSecond: 100, isZoomInteracting: true })
    useTimelineViewportStore.setState({
      scrollLeft: 10_714,
      viewportWidth: 1331,
    })
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const renderWindow = vi.fn()

    const { container } = render(Harness, {
      timelineItem: LONG_TIMELINE_ITEM,
      nested: true,
      width: 200_000,
      height: 24,
      visibleStartPx: 50_000,
      visibleEndPx: 50_100,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      liveTimelineViewport: true,
      liveViewportOverscanPx: 600,
      renderWindow,
    })
    const canvas = container.querySelector('canvas')!
    expect(canvas.style.left).toBe('10113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(5062)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 10_113, 2531)
    expect(getBoundingClientRect).not.toHaveBeenCalled()

    const backingWidth = canvas.width
    const redrawCount = renderWindow.mock.calls.length
    await act(async () => {
      useTimelineViewportStore.setState({ scrollLeft: 11_714 })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('11113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(backingWidth)
    expect(renderWindow).toHaveBeenCalledTimes(redrawCount)

    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 180, isZoomInteracting: true })
      useTimelineViewportStore.setState({ scrollLeft: 20_714 })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('20113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(backingWidth)
    expect(renderWindow).toHaveBeenCalledTimes(redrawCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 20_113, 2531)
    expect(getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('redraws a growing arithmetic window with a sharp matching backing size', async () => {
    const ctx = mockCanvasContext()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    useZoomStore.setState({ pixelsPerSecond: 100, isZoomInteracting: true })
    useTimelineViewportStore.setState({
      scrollLeft: 0,
      viewportWidth: 2000,
    })
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const renderWindow = vi.fn()
    const { container } = render(Harness, {
      timelineItem: { ...LONG_TIMELINE_ITEM, 'data-timeline-duration-frames': '240' },
      nested: true,
      width: 800,
      height: 24,
      visibleStartPx: 0,
      visibleEndPx: 800,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      liveTimelineViewport: true,
      renderWindow,
    })
    const canvas = container.querySelector('canvas')!
    expect(canvas.style.width).toBe('798px')
    const redrawCount = renderWindow.mock.calls.length

    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 150, isZoomInteracting: true })
      await Promise.resolve()
    })

    expect(canvas.style.width).toBe('1198px')
    expect(canvas.width).toBe(2396)
    expect(renderWindow).toHaveBeenCalledTimes(redrawCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 0, 1198)
    expect(getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('falls back to measured live geometry for a transformed timeline item', async () => {
    const ctx = mockCanvasContext()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const renderWindow = vi.fn()
    const { container, rerender } = render(Harness, {
      timelineItem: {
        'data-timeline-start-frame': '0',
        'data-timeline-duration-frames': '60000',
        'data-timeline-fps': '30',
      },
      itemStyle: 'transform: translate(12px)',
      width: 200_000,
      height: 24,
      visibleStartPx: 50_000,
      visibleEndPx: 50_100,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      liveTimelineViewport: true,
      liveViewportOverscanPx: 600,
      renderWindow,
    })
    const viewport = container.querySelector('[data-timeline-scroll-container]') as HTMLDivElement
    const canvas = container.querySelector('canvas')!
    const host = canvas.parentElement!
    const asRect = (left: number, width: number) =>
      ({
        bottom: 24,
        height: 24,
        left,
        right: left + width,
        top: 0,
        width,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    let hostLeft = -10_000
    let hostWidth = 200_000
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => asRect(hostLeft, hostWidth))
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(asRect(713, 1331))

    await rerender({ version: 'zoom-2' })

    expect(canvas.style.left).toBe('10113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(5062)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 10_113, 2531)

    const backingWidth = canvas.width
    const redrawCount = renderWindow.mock.calls.length
    hostLeft = -20_000
    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 180, isZoomInteracting: true })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('20113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(backingWidth)
    expect(renderWindow).toHaveBeenCalledTimes(redrawCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 20_113, 2531)

    hostLeft = 713
    hostWidth = 800
    await rerender({ version: 'zoom-3' })

    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.width).toBe('800px')
    expect(canvas.width).toBe(1600)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 0, 800)

    const shortClipRedrawCount = renderWindow.mock.calls.length
    hostWidth = 1200
    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 220, isZoomInteracting: true })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.width).toBe('1200px')
    expect(canvas.width).toBe(2400)
    expect(renderWindow).toHaveBeenCalledTimes(shortClipRedrawCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 0, 1200)
  })
})
