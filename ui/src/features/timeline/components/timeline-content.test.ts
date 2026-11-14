// SPDX-License-Identifier: MIT

import { flushSync, tick } from 'svelte'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useEditorStore } from '@/shared/state/editor'
import { usePlaybackStore } from '@/shared/state/playback'
import { resetPlaybackPreviewState } from '@/shared/state/playback-preview-test-helpers'
import { useSelectionStore } from '@/shared/state/selection'
import type { TimelineTrack, VideoItem } from '@/types/timeline'

import {
  _resetViewportThrottle,
  useTimelineViewportStore,
} from '@/features/timeline/stores/timeline-viewport-store'
import { setTimelineState } from '@/features/timeline/test-helpers'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import { TIMELINE_RULER_HEIGHT, ZOOM_MAX, ZOOM_MIN } from '@/features/timeline/constants'
import {
  TimelineContent,
  type TimelineContentProps,
  type TimelineZoomHandlers,
} from './timeline-content'
import { getTimelineZoomInteractionShieldBounds } from '@/features/timeline/utils/timeline-zoom-interaction-shield'
import { TIMELINE_LIVE_SCROLL_EVENT } from '@/shared/timeline/live-scroll-sync'
import { trackStubMounts } from './timeline-content.test-state'

const marqueeMocks = vi.hoisted(() => ({
  options: undefined as
    | (() => { onGestureEnd?: (event: MouseEvent, wasActualDrag: boolean) => void })
    | undefined,
}))

vi.mock('@/shared/logging/perf-marks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/logging/perf-marks')>()),
  withPerfMeasure: (_name: string, callback: () => unknown) => callback(),
}))

vi.mock('@/shared/marquee/use-marquee-selection.svelte', async (importOriginal) => {
  const INACTIVE = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
  return {
    ...(await importOriginal<typeof import('@/shared/marquee/use-marquee-selection.svelte')>()),
    useMarqueeSelection: (
      options: () => { onGestureEnd?: (event: MouseEvent, wasActualDrag: boolean) => void },
    ) => {
      marqueeMocks.options = options
      return {
        isActive: false,
        marquee: {
          subscribe: () => () => {},
          getSnapshot: () => INACTIVE,
        },
        selectedIds: [],
      }
    },
  }
})

vi.mock('../hooks/use-waveform-prefetch.svelte', () => ({
  useWaveformPrefetch: () => {},
}))

vi.mock('./timeline-markers.svelte', async () => ({
  default: (await import('./timeline-content-empty.stub.svelte')).default,
}))

vi.mock('./timeline-playhead.svelte', async () => ({
  default: (await import('./timeline-content-playhead.stub.svelte')).default,
}))

vi.mock('./timeline-preview-scrubber.svelte', async () => ({
  default: (await import('./timeline-content-preview-scrubber.stub.svelte')).default,
}))

vi.mock('./timeline-track.svelte', async () => ({
  default: (await import('./timeline-content-track.stub.svelte')).default,
}))

vi.mock('./timeline-guidelines.svelte', async () => ({
  default: (await import('./timeline-content-empty.stub.svelte')).default,
}))

vi.mock('./timeline-media-drop-zone', async () => ({
  TimelineMediaDropZone: (await import('./timeline-content-empty.stub.svelte')).default,
}))

vi.mock('./track-row-frame', async () => {
  const children = (await import('./timeline-content-children.stub.svelte')).default
  return {
    FirstTrackRowFrame: children,
    TrackRowFrame: children,
    TrackSectionDivider: (await import('./timeline-content-empty.stub.svelte')).default,
  }
})

vi.mock('@/shared/marquee/marquee-overlay.svelte', async () => ({
  default: (await import('./timeline-content-empty.stub.svelte')).default,
}))

const VIDEO_TRACK: TimelineTrack = {
  id: 'track-video-1',
  name: 'V1',
  kind: 'video',
  height: 72,
  locked: false,
  visible: true,
  muted: false,
  solo: false,
  order: 0,
  items: [],
}

const VIDEO_ITEM: VideoItem = {
  id: 'clip-video-1',
  type: 'video',
  trackId: VIDEO_TRACK.id,
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:clip-video-1',
  mediaId: 'media-video-1',
}

const VIEWPORT_RECT = {
  left: 0,
  top: 0,
  right: 400,
  bottom: 200,
  width: 400,
  height: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect

function renderContent(props: TimelineContentProps) {
  return render(TimelineContent, { props })
}

function act(update: () => void) {
  update()
  flushSync()
}

beforeAll(() => {
  if (!globalThis.requestIdleCallback) {
    globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
      return window.setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => 0,
        })
      }, 0)
    }) as typeof requestIdleCallback
  }

  if (!globalThis.cancelIdleCallback) {
    globalThis.cancelIdleCallback = ((id: number) => {
      window.clearTimeout(id)
    }) as typeof cancelIdleCallback
  }
})

function resetStores() {
  _resetZoomStoreForTest()
  useEditorStore.setState({
    linkedSelectionEnabled: true,
    transcriptionDialogDepth: 0,
  })

  useSelectionStore.setState({
    selectedItemIds: [],
    selectedMarkerId: null,
    selectedTransitionId: null,
    selectedTrackId: null,
    selectedTrackIds: [],
    activeTrackId: null,
    selectionType: null,
    activeTool: 'select',
    dragState: null,
    expandedKeyframeLanes: new Set<string>(),
    editKeyframePanelOpen: false,
  })

  resetPlaybackPreviewState()

  setTimelineState({
    fps: 30,
    items: [VIDEO_ITEM],
    tracks: [VIDEO_TRACK],
    transitions: [],
    keyframes: [],
    markers: [],
    inPoint: null,
    outPoint: null,
    scrollPosition: 0,
    snapEnabled: true,
    isDirty: false,
  })

  _resetViewportThrottle()
  useTimelineViewportStore.setState({
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 0,
    viewportHeight: 0,
  })
}

function getScrollContainer(container: HTMLElement): HTMLDivElement {
  const scrollContainer = container.querySelector('[data-timeline-scroll-container]')
  if (!(scrollContainer instanceof HTMLDivElement)) {
    throw new Error('Expected timeline scroll container')
  }
  return scrollContainer
}

describe('TimelineContent playback selection behavior', () => {
  beforeEach(() => {
    resetStores()
    marqueeMocks.options = undefined
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders one full-height playhead and one tool-only preview overlay', () => {
    const { container, getAllByTestId, getByTestId } = renderContent({
      duration: 10,
      tracks: [VIDEO_TRACK],
    })

    expect(getAllByTestId('unified-timeline-playhead')).toHaveLength(1)
    expect(getAllByTestId('unified-timeline-preview-scrubber')).toHaveLength(1)
    expect(getByTestId('unified-timeline-preview-scrubber')).toBeInTheDocument()
    expect(container.querySelector('.timeline-container')).toHaveClass('isolate')
  })

  it('keeps the selected clip selected after the playhead moves past it', async () => {
    renderContent({ duration: 10, tracks: [VIDEO_TRACK] })

    act(() => {
      useSelectionStore.getState().selectItems([VIDEO_ITEM.id])
      usePlaybackStore.getState().setCurrentFrame(30)
    })

    expect(useSelectionStore.getState().selectedItemIds).toEqual([VIDEO_ITEM.id])

    act(() => {
      usePlaybackStore
        .getState()
        .setCurrentFrame(VIDEO_ITEM.from + VIDEO_ITEM.durationInFrames + 15)
    })

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedItemIds).toEqual([VIDEO_ITEM.id])
    })
  })

  it('does not remount the timeline tree for live or settled gesture zoom', () => {
    const { container } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })
    const committedSurface = container.querySelector('[data-timeline-committed-surface="tracks"]')
    const trackNode = container.querySelector(`[data-track-id="${VIDEO_TRACK.id}"]`)
    const mountsBefore = trackStubMounts.count

    act(() => {
      useZoomStore.getState().setZoomLevelImmediate(1.5)
    })

    expect(trackStubMounts.count).toBe(mountsBefore)

    act(() => {
      useZoomStore.setState({
        contentLevel: 1.5,
        contentPixelsPerSecond: 150,
        isZoomInteracting: false,
      })
    })

    expect(trackStubMounts.count).toBe(mountsBefore)
    expect(container.querySelector('[data-timeline-committed-surface="tracks"]')).toBe(
      committedSurface,
    )
    expect(container.querySelector(`[data-track-id="${VIDEO_TRACK.id}"]`)).toBe(trackNode)
  })

  it('steps zoom buttons multiplicatively while preserving the playhead anchor', () => {
    let zoomHandlers: TimelineZoomHandlers | undefined

    useZoomStore.getState().setZoomLevelSynchronized(ZOOM_MIN)
    usePlaybackStore.getState().setCurrentFrame(150)

    const { container } = renderContent({
      duration: 10,
      tracks: [VIDEO_TRACK],
      onZoomHandlersReady: (handlers) => {
        zoomHandlers = handlers
      },
    })
    const scrollContainer = getScrollContainer(container)
    if (!zoomHandlers) {
      throw new Error('Expected timeline scroll container and zoom handlers')
    }
    scrollContainer.scrollLeft = 2

    const frameCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    act(() => zoomHandlers?.handleZoomIn())
    expect(frameCallbacks).toHaveLength(1)
    act(() => frameCallbacks.shift()?.(performance.now()))

    expect(useZoomStore.getState().level).toBeCloseTo(0.011)
    expect(useZoomStore.getState().level).not.toBeCloseTo(0.11)
    expect(scrollContainer.scrollLeft).toBeCloseTo(2.5)

    act(() => zoomHandlers?.handleZoomOut())
    expect(frameCallbacks).toHaveLength(1)
    act(() => frameCallbacks.shift()?.(performance.now()))

    expect(useZoomStore.getState().level).toBeCloseTo(ZOOM_MIN)
    expect(scrollContainer.scrollLeft).toBeCloseTo(2)
  })

  it('keeps zoom buttons within the production zoom limits', () => {
    let zoomHandlers: TimelineZoomHandlers | undefined

    renderContent({
      duration: 10,
      tracks: [VIDEO_TRACK],
      onZoomHandlersReady: (handlers) => {
        zoomHandlers = handlers
      },
    })
    if (!zoomHandlers) {
      throw new Error('Expected zoom handlers')
    }

    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')

    act(() => useZoomStore.getState().setZoomLevelSynchronized(ZOOM_MIN))
    act(() => zoomHandlers?.handleZoomOut())
    expect(useZoomStore.getState().level).toBe(ZOOM_MIN)
    expect(animationFrameSpy).not.toHaveBeenCalled()

    act(() => useZoomStore.getState().setZoomLevelSynchronized(ZOOM_MAX))
    act(() => zoomHandlers?.handleZoomIn())
    expect(useZoomStore.getState().level).toBe(ZOOM_MAX)
    expect(animationFrameSpy).not.toHaveBeenCalled()
  })

  it('applies live zoom and its cursor-anchor scroll in the same animation frame', async () => {
    const { container, unmount } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })
    const scrollContainer = getScrollContainer(container)
    const committedSurface = container.querySelector(
      '[data-timeline-committed-surface="tracks"]',
    ) as HTMLDivElement
    const contentLayer = committedSurface.querySelector(
      '[data-timeline-track-content-layer]',
    ) as HTMLDivElement
    const trackNode = container.querySelector(`[data-track-id="${VIDEO_TRACK.id}"]`)
    const liveScroll = vi.fn()
    scrollContainer.addEventListener(TIMELINE_LIVE_SCROLL_EVENT, liveScroll)

    const liveRectRead = vi.fn(() => VIEWPORT_RECT)
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: liveRectRead,
    })

    const frameCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    await fireEvent.wheel(scrollContainer, {
      clientX: 200,
      clientY: 100,
      ctrlKey: true,
      deltaY: -120,
    })

    expect(frameCallbacks).toHaveLength(1)
    expect(useZoomStore.getState().level).toBe(1)
    expect(scrollContainer.scrollLeft).toBe(0)
    expect(liveRectRead).not.toHaveBeenCalled()

    act(() => {
      frameCallbacks.shift()?.(performance.now())
    })

    expect(useZoomStore.getState().level).toBeCloseTo(1.15)
    expect(scrollContainer.scrollLeft).toBeCloseTo(30)
    expect(useTimelineViewportStore.getState().scrollLeft).toBeCloseTo(30)
    expect(liveScroll).toHaveBeenCalledOnce()
    expect(frameCallbacks).toHaveLength(0)
    expect(container.querySelector('[data-timeline-committed-surface="tracks"]')).toBe(
      committedSurface,
    )
    expect(container.querySelector(`[data-track-id="${VIDEO_TRACK.id}"]`)).toBe(trackNode)
    expect(committedSurface.style.transform).toBe('none')
    expect(contentLayer.style.width).toBe('1150px')
    expect(
      Number.parseFloat(committedSurface.style.getPropertyValue('--timeline-percent-per-frame')),
    ).toBeCloseTo(100 / (10 * 30))
    expect(committedSurface.style.getPropertyValue('--timeline-px-per-frame')).toBe('')

    unmount()
  })

  it('notifies linked panels inside each horizontal momentum frame', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const { container, unmount } = renderContent({ duration: 100, tracks: [VIDEO_TRACK] })
    const scrollContainer = getScrollContainer(container)
    const liveScroll = vi.fn()
    scrollContainer.addEventListener(TIMELINE_LIVE_SCROLL_EVENT, liveScroll)
    frameCallbacks.length = 0

    await fireEvent.wheel(scrollContainer, { deltaY: 120 })
    expect(frameCallbacks).toHaveLength(1)
    act(() => frameCallbacks.shift()?.(performance.now()))

    expect(scrollContainer.scrollLeft).toBeGreaterThan(0)
    expect(liveScroll).toHaveBeenCalledOnce()

    unmount()
  })

  it('preserves the mouse pivot when wheel-zooming immediately after zoom to fit', async () => {
    let zoomToFit: (() => void) | undefined
    const frameCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const { container, unmount } = renderContent({
      duration: 100,
      tracks: [VIDEO_TRACK],
      onZoomHandlersReady: (handlers) => {
        zoomToFit = handlers.handleZoomToFit
      },
    })
    const scrollContainer = getScrollContainer(container)
    if (!zoomToFit) {
      throw new Error('Expected timeline scroll container and zoom handlers')
    }
    frameCallbacks.length = 0
    Object.defineProperty(scrollContainer, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => VIEWPORT_RECT,
    })

    act(() => window.dispatchEvent(new Event('resize')))
    act(() => zoomToFit?.())
    expect(useZoomStore.getState().level).toBeCloseTo(0.35)
    expect(scrollContainer.scrollLeft).toBe(0)

    await fireEvent.wheel(scrollContainer, {
      clientX: 300,
      clientY: 100,
      ctrlKey: true,
      deltaY: -120,
    })
    act(() => {
      frameCallbacks.shift()?.(performance.now())
    })

    expect(useZoomStore.getState().level).toBeCloseTo(0.4025)
    expect(scrollContainer.scrollLeft).toBeCloseTo(45)

    await fireEvent.wheel(scrollContainer, {
      clientX: 300,
      clientY: 100,
      ctrlKey: true,
      deltaY: -120,
    })
    act(() => {
      frameCallbacks.shift()?.(performance.now())
      frameCallbacks.shift()?.(performance.now())
    })

    expect(useZoomStore.getState().level).toBeCloseTo(0.463)
    expect(scrollContainer.scrollLeft).toBeCloseTo(96.75)

    unmount()
  })

  it('does not update the hover scrub preview while the transcription dialog is open', async () => {
    const { container } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })
    const scrollContainer = getScrollContainer(container)

    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => VIEWPORT_RECT,
    })

    act(() => {
      useEditorStore.setState({ transcriptionDialogDepth: 1 })
      usePlaybackStore.getState().setPreviewFrame(12)
    })

    await fireEvent.mouseMove(scrollContainer, { clientX: 180, clientY: 48 })

    expect(usePlaybackStore.getState().previewFrame).toBeNull()
  })

  it('cancels a queued hover preview when cursor-anchored zoom starts', async () => {
    let nextFrameId = 1
    const scheduledFrames = new Map<number, FrameRequestCallback>()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId++
      scheduledFrames.set(id, callback)
      return id
    })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        scheduledFrames.delete(id)
      })

    const { container, unmount } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })
    const scrollContainer = getScrollContainer(container)

    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => VIEWPORT_RECT,
    })
    scheduledFrames.clear()

    await fireEvent.mouseMove(scrollContainer, { clientX: 180, clientY: 48 })
    const previewFrameId = [...scheduledFrames.keys()].at(-1)
    expect(previewFrameId).toBeDefined()

    await fireEvent.wheel(scrollContainer, {
      clientX: 180,
      clientY: 48,
      ctrlKey: true,
      deltaY: -120,
    })

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(previewFrameId)
    act(() => {
      for (const [id, callback] of [...scheduledFrames]) {
        scheduledFrames.delete(id)
        callback(performance.now())
      }
    })
    expect(usePlaybackStore.getState().previewFrame).toBeNull()
    expect(useZoomStore.getState().level).toBeGreaterThan(1)

    unmount()
  })

  it('gives dense timelines a short window to cancel hover preview before zoom', async () => {
    vi.useFakeTimers()
    try {
      const denseItems = Array.from({ length: 80 }, (_, index) => ({
        ...VIDEO_ITEM,
        id: `clip-video-${index}`,
        from: index * VIDEO_ITEM.durationInFrames,
      }))
      act(() => {
        useItemsStore.getState().setItems(denseItems)
      })

      let nextFrameId = 1
      const scheduledFrames = new Map<number, FrameRequestCallback>()
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = nextFrameId++
        scheduledFrames.set(id, callback)
        return id
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
        scheduledFrames.delete(id)
      })

      const { container, unmount } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })
      const scrollContainer = getScrollContainer(container)
      const zoomInteractionShield = container.querySelector<HTMLElement>(
        '[data-timeline-zoom-interaction-shield]',
      )
      expect(zoomInteractionShield).not.toBeNull()
      Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
        configurable: true,
        value: () => VIEWPORT_RECT,
      })
      scheduledFrames.clear()

      await fireEvent.mouseMove(scrollContainer, { clientX: 180, clientY: 48 })
      expect(scheduledFrames.size).toBe(0)

      await fireEvent.wheel(scrollContainer, {
        clientX: 180,
        clientY: 48,
        ctrlKey: true,
        deltaY: -120,
      })
      expect(zoomInteractionShield!.style.display).toBe('block')
      expect(zoomInteractionShield).toHaveAttribute('data-marquee-ignore')
      expect(
        getTimelineZoomInteractionShieldBounds({ left: 0, top: 0, width: 400, height: 200 }),
      ).toEqual({
        left: 0,
        top: TIMELINE_RULER_HEIGHT,
        width: 400,
        height: 200 - TIMELINE_RULER_HEIGHT,
      })
      const zoomFrameCount = scheduledFrames.size
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(scheduledFrames.size).toBe(zoomFrameCount)

      act(() => {
        for (const [id, callback] of [...scheduledFrames]) {
          scheduledFrames.delete(id)
          callback(performance.now())
        }
      })
      expect(usePlaybackStore.getState().previewFrame).toBeNull()
      expect(useZoomStore.getState().level).toBeGreaterThan(1)
      expect(zoomInteractionShield!.style.display).toBe('block')

      act(() => {
        useZoomStore.setState({ isZoomInteracting: false })
      })
      expect(zoomInteractionShield!.style.display).toBe('none')

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reveals the active track when selection moves to an offscreen lane', async () => {
    const videoTracks: TimelineTrack[] = [
      { ...VIDEO_TRACK, id: 'track-video-1', name: 'V1', order: 0 },
      { ...VIDEO_TRACK, id: 'track-video-2', name: 'V2', order: 1 },
      { ...VIDEO_TRACK, id: 'track-video-3', name: 'V3', order: 2 },
    ]

    setTimelineState({
      tracks: videoTracks,
      items: [],
    })

    const { container } = renderContent({ duration: 10, tracks: videoTracks })
    const scrollContainer = container.querySelector(
      '[data-track-section-scroll="video"]',
    ) as HTMLDivElement | null
    expect(scrollContainer).toBeTruthy()

    const trackElements = Array.from(container.querySelectorAll<HTMLElement>('[data-track-id]'))
    expect(trackElements).toHaveLength(3)

    Object.defineProperty(scrollContainer!, 'clientHeight', {
      configurable: true,
      value: 100,
    })
    scrollContainer!.scrollTop = 120
    vi.spyOn(scrollContainer!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const trackRects = new Map<string, DOMRect>([
      [
        'track-video-1',
        {
          x: 0,
          y: -120,
          left: 0,
          top: -120,
          right: 200,
          bottom: -48,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
      [
        'track-video-2',
        {
          x: 0,
          y: -48,
          left: 0,
          top: -48,
          right: 200,
          bottom: 24,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
      [
        'track-video-3',
        {
          x: 0,
          y: 24,
          left: 0,
          top: 24,
          right: 200,
          bottom: 96,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
    ])

    for (const element of trackElements) {
      const trackId = element.getAttribute('data-track-id')
      const rect = trackId ? trackRects.get(trackId) : null
      expect(rect).toBeTruthy()
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect!)
    }

    act(() => {
      useSelectionStore.getState().setActiveTrack('track-video-1')
    })

    await waitFor(() => {
      expect(scrollContainer!.scrollTop).toBe(0)
    })
  })

  it('reveals the active track through the split-pane video scroll container', async () => {
    const tracks: TimelineTrack[] = [
      { ...VIDEO_TRACK, id: 'track-video-1', name: 'V1', order: 0 },
      { ...VIDEO_TRACK, id: 'track-video-2', name: 'V2', order: 1 },
      { ...VIDEO_TRACK, id: 'track-video-3', name: 'V3', order: 2 },
      {
        ...VIDEO_TRACK,
        id: 'track-audio-1',
        name: 'A1',
        kind: 'audio',
        order: 3,
      },
    ]

    setTimelineState({
      tracks,
      items: [],
    })

    const { container } = renderContent({ duration: 10, tracks })
    const videoScrollContainer = container.querySelector(
      '[data-track-section-scroll="video"]',
    ) as HTMLDivElement | null
    const audioScrollContainer = container.querySelector(
      '[data-track-section-scroll="audio"]',
    ) as HTMLDivElement | null
    expect(videoScrollContainer).toBeTruthy()
    expect(audioScrollContainer).toBeTruthy()

    const videoTrackElements = Array.from(
      videoScrollContainer!.querySelectorAll<HTMLElement>('[data-track-id]'),
    )
    expect(videoTrackElements).toHaveLength(3)

    Object.defineProperty(videoScrollContainer!, 'clientHeight', {
      configurable: true,
      value: 100,
    })
    videoScrollContainer!.scrollTop = 120
    audioScrollContainer!.scrollTop = 55
    vi.spyOn(videoScrollContainer!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const trackRects = new Map<string, DOMRect>([
      [
        'track-video-1',
        {
          x: 0,
          y: -120,
          left: 0,
          top: -120,
          right: 200,
          bottom: -48,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
      [
        'track-video-2',
        {
          x: 0,
          y: -48,
          left: 0,
          top: -48,
          right: 200,
          bottom: 24,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
      [
        'track-video-3',
        {
          x: 0,
          y: 24,
          left: 0,
          top: 24,
          right: 200,
          bottom: 96,
          width: 200,
          height: 72,
          toJSON: () => ({}),
        } as DOMRect,
      ],
    ])

    for (const element of videoTrackElements) {
      const trackId = element.getAttribute('data-track-id')
      const rect = trackId ? trackRects.get(trackId) : null
      expect(rect).toBeTruthy()
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect!)
    }

    act(() => {
      useSelectionStore.getState().setActiveTrack('track-video-1')
    })

    await waitFor(() => {
      expect(videoScrollContainer!.scrollTop).toBe(0)
    })
    expect(audioScrollContainer!.scrollTop).toBe(55)
  })

  it('does not clear previewFrame on ruler mousedown before the ruler handler runs', async () => {
    const { container } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })

    act(() => {
      usePlaybackStore.getState().setPreviewFrame(24)
    })

    const ruler = container.querySelector('.timeline-ruler') as HTMLDivElement | null
    expect(ruler).toBeTruthy()

    await fireEvent.mouseDown(ruler!, { button: 0 })

    expect(usePlaybackStore.getState().previewFrame).toBe(24)
  })

  it('locks the skim preview from track mousedown until the marquee gesture ends', async () => {
    const { container } = renderContent({ duration: 10, tracks: [VIDEO_TRACK] })

    const frameCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    act(() => {
      usePlaybackStore.getState().setCurrentFrame(90)
      usePlaybackStore.getState().setPreviewFrame(24)
    })

    const track = container.querySelector(`[data-track-id="${VIDEO_TRACK.id}"]`)
    const scrollContainer = container.querySelector('[data-timeline-scroll-container]')
    expect(track).toBeTruthy()
    expect(scrollContainer).toBeTruthy()

    vi.spyOn(scrollContainer!, 'getBoundingClientRect').mockReturnValue(VIEWPORT_RECT)

    await fireEvent.mouseDown(track!, { button: 0, clientX: 80, clientY: 100 })
    document.body.style.userSelect = 'none'
    await fireEvent.mouseMove(track!, { clientX: 180, clientY: 100 })
    await fireEvent.mouseLeave(scrollContainer!)

    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(performance.now()))
    })

    expect(usePlaybackStore.getState().currentFrame).toBe(90)
    expect(usePlaybackStore.getState().previewFrame).toBe(24)

    document.body.style.userSelect = ''
    act(() => {
      marqueeMocks
        .options?.()
        .onGestureEnd?.(new MouseEvent('mouseup', { button: 0, clientX: 180, clientY: 100 }), true)
    })
    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(performance.now()))
    })
    expect(usePlaybackStore.getState().previewFrame).not.toBe(24)

    const releaseFrame = usePlaybackStore.getState().previewFrame
    frameCallbacks.length = 0
    await fireEvent.mouseMove(track!, { clientX: 220, clientY: 100 })
    expect(frameCallbacks.length).toBeGreaterThan(0)

    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(performance.now()))
    })

    expect(usePlaybackStore.getState().previewFrame).not.toBe(releaseFrame)
    await tick()
  })
})
