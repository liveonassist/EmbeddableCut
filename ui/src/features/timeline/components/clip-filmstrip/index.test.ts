// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import ClipFilmstrip from './index.svelte'
import Harness from './index.harness.svelte'
import {
  resetDecodedFilmstripImagesForTest,
  subscribeFilmstripImage,
} from './filmstrip-image-cache'
import {
  latestFilmstripOptions,
  resetClipFilmstripMocks,
  setFilmstripResult,
  setMediaBlobUrl,
} from './index.test-state.svelte'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'

const mediaResolverMocks = vi.hoisted(() => ({
  resolveMediaUrl: vi.fn(),
  resolveProxyUrl: vi.fn((): string | null => null),
}))

const mediaLibraryState = vi.hoisted(() => ({
  current: { proxyStatus: new Map<string, string>() },
}))

const filmstripCacheMocks = vi.hoisted(() => ({
  refreshFrames: vi.fn(() => Promise.resolve()),
}))

const canvasContextMocks = vi.hoisted(() => ({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  restore: vi.fn(),
}))

class TestImage {
  static instances: TestImage[] = []

  width = 160
  height = 90
  decoding = 'auto'
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private source = ''

  constructor() {
    TestImage.instances.push(this)
  }

  get src(): string {
    return this.source
  }

  set src(value: string) {
    this.source = value
  }
}

vi.mock('../../hooks/use-filmstrip.svelte', async () => ({
  useFilmstrip: (await import('./index.test-state.svelte')).useFilmstripMock,
}))

vi.mock('../../hooks/use-media-blob-url.svelte', async () => ({
  useMediaBlobUrl: (await import('./index.test-state.svelte')).useMediaBlobUrlMock,
}))

vi.mock('@/features/timeline/deps/media-library-resolver', () => ({
  resolveMediaUrl: mediaResolverMocks.resolveMediaUrl,
  resolveProxyUrl: mediaResolverMocks.resolveProxyUrl,
}))

vi.mock('@/features/timeline/deps/media-library-store', () => ({
  useMediaLibraryStore: {
    getState: () => mediaLibraryState.current,
    subscribe: () => () => {},
  },
}))

vi.mock('@/features/timeline/services/filmstrip-cache', () => ({
  THUMBNAIL_WIDTH: 80,
  filmstripCache: filmstripCacheMocks,
}))

// React's async act() drains a few extra microtask turns after its callback;
// the shared canvas scheduler can need them to pass its cadence gate.
async function act(update: () => Promise<void> | void): Promise<void> {
  await update()
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
  flushSync()
}

const baseProps = {
  mediaId: 'media-1',
  clipWidth: 320,
  sourceStart: 0,
  sourceDuration: 10,
  trimStart: 0,
  speed: 1,
  fps: 31,
  isVisible: true,
  pixelsPerSecond: 120,
}

describe('ClipFilmstrip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let frameTimestamp = 0
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++frameId
      queueMicrotask(() => callback((frameTimestamp += 40)))
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    )
    vi.stubGlobal('Image', TestImage)
    resetDecodedFilmstripImagesForTest()
    resetClipFilmstripMocks()
    _resetZoomStoreForTest()
    useTimelineViewportStore.setState({
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 0,
      viewportHeight: 0,
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
    ;(
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
        mockReturnValue: (value: CanvasRenderingContext2D) => void
      }
    ).mockReturnValue({
      ...canvasContextMocks,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D)
    TestImage.instances = []

    setMediaBlobUrl({
      blobUrl: 'blob:original',
      setBlobUrl: vi.fn(),
      hasStartedLoadingRef: { current: true },
      blobUrlVersion: 0,
    })
    mediaLibraryState.current = { proxyStatus: new Map<string, string>() }
    mediaResolverMocks.resolveProxyUrl.mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prefers a ready proxy as the filmstrip source', () => {
    mediaLibraryState.current = { proxyStatus: new Map([['media-1', 'ready']]) }
    mediaResolverMocks.resolveProxyUrl.mockReturnValue('blob:proxy')

    render(ClipFilmstrip, baseProps)

    expect(latestFilmstripOptions()).toEqual(
      expect.objectContaining({
        mediaId: 'media-1',
        blobUrl: 'blob:proxy',
        enabled: true,
      }),
    )
  })

  it('notifies a late subscriber when a shared image is already decoded', () => {
    const firstOnChange = vi.fn()
    const unsubscribeFirst = subscribeFilmstripImage('blob:shared-frame', firstOnChange, vi.fn())
    const image = TestImage.instances.at(-1)
    expect(image).toBeDefined()

    image?.onload?.()
    expect(firstOnChange).toHaveBeenCalledTimes(1)
    unsubscribeFirst()

    const lateOnChange = vi.fn()
    const unsubscribeLate = subscribeFilmstripImage('blob:shared-frame', lateOnChange, vi.fn())

    expect(lateOnChange).toHaveBeenCalledTimes(1)
    unsubscribeLate()
  })

  it('uses the refreshed proxy URL when blob URLs are invalidated', async () => {
    mediaLibraryState.current = { proxyStatus: new Map([['media-1', 'ready']]) }
    mediaResolverMocks.resolveProxyUrl.mockReturnValue('blob:stale-proxy')

    const { rerender } = render(ClipFilmstrip, baseProps)

    expect(latestFilmstripOptions()?.blobUrl).toBe('blob:stale-proxy')

    mediaResolverMocks.resolveProxyUrl.mockReturnValue('blob:refreshed-proxy')
    setMediaBlobUrl({
      blobUrl: 'blob:refreshed-original',
      setBlobUrl: vi.fn(),
      hasStartedLoadingRef: { current: false },
      blobUrlVersion: 1,
    })
    await rerender({ fps: 32 })

    expect(latestFilmstripOptions()?.blobUrl).toBe('blob:refreshed-proxy')
  })

  it('falls back to the original media blob when no proxy is ready', () => {
    render(ClipFilmstrip, { ...baseProps, fps: 32 })

    expect(latestFilmstripOptions()).toEqual(
      expect.objectContaining({
        mediaId: 'media-1',
        blobUrl: 'blob:original',
        enabled: true,
      }),
    )
  })

  it('targets the padded visible thumbnail slots for extraction', async () => {
    const { rerender } = render(ClipFilmstrip, {
      ...baseProps,
      clipWidth: 2000,
      sourceDuration: 120,
      visibleStartRatio: 0.5,
      visibleEndRatio: 0.75,
      pixelsPerSecond: 100,
    })

    const firstCall = latestFilmstripOptions()
    expect(firstCall?.priorityWindow).toEqual({ startTime: 0, endTime: 20 })
    expect(firstCall?.targetFrameCount).toBeUndefined()
    expect(firstCall?.targetFrameIndices).toEqual([
      3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ])

    await rerender({ pixelsPerSecond: 200 })

    const latestCall = latestFilmstripOptions()
    expect(latestCall?.priorityWindow).toEqual(firstCall?.priorityWindow)
    expect(latestCall?.targetFrameCount).toBeUndefined()
    expect(latestCall?.targetFrameIndices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('keeps tile media full width while the canvas clips a short segment', async () => {
    const widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set')
    const heightSetter = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set')
    setFilmstripResult({
      frames: [{ index: 0, timestamp: 0, url: 'blob:frame-0' }],
      isLoading: false,
      isComplete: true,
      progress: 100,
      error: null,
    })

    const { container } = render(ClipFilmstrip, { ...baseProps, clipWidth: 40 })

    const canvas = container.querySelector('[data-filmstrip-canvas]') as HTMLCanvasElement | null
    const fallback = container.querySelector('[data-filmstrip-fallback]') as HTMLDivElement | null
    expect(canvas).not.toBeNull()
    expect(fallback).not.toBeNull()
    expect(canvas!.style.width).toBe('40px')
    expect(fallback!.style.backgroundImage).toContain('blob:frame-0')
    expect(fallback!.style.backgroundRepeat).toBe('repeat-x')
    expect(fallback!.style.backgroundSize).toBe('107px 60px')
    expect(container.querySelectorAll('img')).toHaveLength(0)

    const source = TestImage.instances.find((image) => image.src === 'blob:frame-0')
    expect(source).toBeDefined()
    const widthAssignmentCountBeforeDecode = widthSetter.mock.calls.length
    const heightAssignmentCountBeforeDecode = heightSetter.mock.calls.length
    source!.onload?.()

    await waitFor(() => {
      expect(canvasContextMocks.rect).toHaveBeenCalledWith(0, 0, 107, 60)
      const drawCall = canvasContextMocks.drawImage.mock.calls.at(-1) as unknown[] | undefined
      expect(drawCall?.[0]).toBe(source)
      expect(drawCall?.[1]).toBe(0)
      expect(drawCall?.[3]).toBe(107)
      expect(drawCall?.[4]).toBeGreaterThanOrEqual(60)
    })
    // The decode repaints the existing canvas imperatively.
    expect(container.querySelector('[data-filmstrip-canvas]')).toBe(canvas)
    expect(widthSetter).toHaveBeenCalledTimes(widthAssignmentCountBeforeDecode)
    expect(heightSetter).toHaveBeenCalledTimes(heightAssignmentCountBeforeDecode)
  })

  it('paints live zoom from timeline coordinates without layout reads or a re-render', async () => {
    const frames = Array.from({ length: 10 }, (_, index) => ({
      index,
      timestamp: index,
      url: `blob:live-frame-${index}`,
    }))
    setFilmstripResult({
      frames,
      isLoading: false,
      isComplete: true,
      progress: 100,
      error: null,
    })
    useZoomStore.setState({
      level: 1,
      pixelsPerSecond: 100,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: false,
    })
    useTimelineViewportStore.setState({
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 120,
    })

    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')

    const widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set')
    const { container, rerender } = render(Harness, {
      ...baseProps,
      mediaId: 'media-live',
      fps: 30,
      pixelsPerSecond: 100,
    })
    const canvas = container.querySelector('[data-filmstrip-canvas]') as HTMLCanvasElement
    const fallback = container.querySelector('[data-filmstrip-fallback]') as HTMLDivElement
    const fallbackStyleBeforeZoom = fallback.getAttribute('style')
    const initialCanvas = canvas
    const initialSources = new Set(TestImage.instances.map((image) => image.src))
    const clearCountBeforeZoom = canvasContextMocks.clearRect.mock.calls.length

    await act(async () => {
      useZoomStore.setState({
        level: 2,
        pixelsPerSecond: 200,
        isZoomInteracting: true,
      })
      await Promise.resolve()
    })

    // Live zoom only repaints the canvas; the component's markup is untouched.
    expect(fallback.getAttribute('style')).toBe(fallbackStyleBeforeZoom)
    expect(canvas.style.width).toBe('638px')
    expect(canvasContextMocks.clearRect).toHaveBeenCalledTimes(clearCountBeforeZoom + 1)
    expect(TestImage.instances.some((image) => !initialSources.has(image.src))).toBe(true)
    expect(getBoundingClientRect).not.toHaveBeenCalled()

    const clearCountBeforeSettle = canvasContextMocks.clearRect.mock.calls.length
    const backingWritesBeforeSettle = widthSetter.mock.calls.length
    await rerender({ clipWidth: 640, pixelsPerSecond: 200 })

    expect(container.querySelector('[data-filmstrip-canvas]')).toBe(initialCanvas)
    expect(canvasContextMocks.clearRect).toHaveBeenCalledTimes(clearCountBeforeSettle)
    expect(widthSetter).toHaveBeenCalledTimes(backingWritesBeforeSettle)
  })

  it('refreshes a stale frame URL when a tile source errors', async () => {
    setFilmstripResult({
      frames: [{ index: 0, timestamp: 0, url: 'blob:stale' }],
      isLoading: false,
      isComplete: true,
      progress: 100,
      error: null,
    })

    const { container } = render(ClipFilmstrip, { ...baseProps, fps: 32 })

    expect(container.querySelectorAll('img')).toHaveLength(0)
    const source = TestImage.instances.find((image) => image.src === 'blob:stale')
    expect(source).toBeDefined()
    source!.onerror?.()

    await waitFor(() => {
      expect(filmstripCacheMocks.refreshFrames).toHaveBeenCalledWith('media-1', [0])
    })
  })

  it('reuses a decoded cover source when a clip remounts', async () => {
    setFilmstripResult({
      frames: [{ index: 0, timestamp: 0, url: 'blob:shared-cover' }],
      isLoading: false,
      isComplete: true,
      progress: 100,
      error: null,
    })

    const props = { ...baseProps, mediaId: 'media-shared', fps: 32 }
    const first = render(ClipFilmstrip, props)
    const source = TestImage.instances.find((image) => image.src === 'blob:shared-cover')
    expect(source).toBeDefined()
    source!.onload?.()
    await waitFor(() => expect(canvasContextMocks.drawImage).toHaveBeenCalled())

    first.unmount()
    canvasContextMocks.drawImage.mockClear()
    render(ClipFilmstrip, props)

    expect(TestImage.instances.filter((image) => image.src === 'blob:shared-cover')).toHaveLength(1)
    await waitFor(() => expect(canvasContextMocks.drawImage).toHaveBeenCalled())
  })

  it('keeps the visible filmstrip stable while extraction is still streaming updates', async () => {
    setFilmstripResult({
      frames: [{ index: 0, timestamp: 0, url: 'blob:initial' }],
      isLoading: true,
      isComplete: false,
      progress: 20,
      error: null,
    })

    const { container, rerender } = render(ClipFilmstrip, { ...baseProps, fps: 32 })

    await waitFor(() => {
      expect(TestImage.instances.some((image) => image.src === 'blob:initial')).toBe(true)
    })

    setFilmstripResult({
      frames: [
        { index: 0, timestamp: 0, url: 'blob:initial' },
        { index: 4, timestamp: 4, url: 'blob:streamed' },
      ],
      isLoading: true,
      isComplete: false,
      progress: 60,
      error: null,
    })
    await rerender({ fps: 31 })

    expect(TestImage.instances.some((image) => image.src === 'blob:streamed')).toBe(false)

    setFilmstripResult({
      frames: [
        { index: 0, timestamp: 0, url: 'blob:initial' },
        { index: 4, timestamp: 4, url: 'blob:streamed' },
      ],
      isLoading: false,
      isComplete: true,
      progress: 100,
      error: null,
    })
    await rerender({ fps: 32 })

    await waitFor(() => {
      expect(TestImage.instances.some((image) => image.src === 'blob:streamed')).toBe(true)
    })
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})
