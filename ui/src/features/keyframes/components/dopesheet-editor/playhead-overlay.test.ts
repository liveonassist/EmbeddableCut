// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import DopesheetEditorHarness from './dopesheet-editor.harness.svelte'
import DopesheetPlayheadLine from './dopesheet-playhead-line.svelte'
import { PROPERTY_COLUMN_WIDTH } from './dopesheet-constants'
import {
  mainTimelineScrubActiveRef,
  mainTimelineScrubHandoffFrameRef,
  resetTimelineSkimmerScrubForTest,
  timelineSkimmerScrubSignal,
} from '@/shared/timeline/main-timeline-scrub'
import {
  TIMELINE_LIVE_SCROLL_EVENT,
  TIMELINE_SCRUB_VISUAL_FRAME_EVENT,
  notifyTimelineScrubVisualFrame,
} from '@/shared/timeline/live-scroll-sync'

describe('DopesheetEditor playhead overlay', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  beforeEach(() => {
    usePlaybackStore.setState({
      currentFrame: 0,
      previewFrame: null,
      isPlaying: false,
    })
    mainTimelineScrubActiveRef.current = false
    mainTimelineScrubHandoffFrameRef.current = null
    resetTimelineSkimmerScrubForTest()
  })

  it('skips playhead transform assignments until playback reaches the next pixel', async () => {
    usePlaybackStore.setState({ isPlaying: true })
    render(DopesheetPlayheadLine, {
      relativeFrame: 0,
      itemFrom: 0,
      totalFrames: 100,
      frameToX: (frame: number) => Math.floor(frame / 2),
      maxLeft: 100,
    })
    const playhead = screen.getByTestId('dopesheet-playhead-line')
    expect(playhead).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' })

    let transform = playhead.style.transform
    const transformAssignments: string[] = []
    Object.defineProperty(playhead.style, 'transform', {
      configurable: true,
      get: () => transform,
      set: (value: string) => {
        transform = value
        transformAssignments.push(value)
      },
    })

    flushSync(() => usePlaybackStore.setState({ currentFrame: 1 }))
    expect(transformAssignments).toEqual([])

    flushSync(() => usePlaybackStore.setState({ currentFrame: 2 }))
    expect(transformAssignments).toEqual(['translate3d(1px, 0, 0)'])
  })

  it('clamps the playhead to the left edge when the current frame is before the viewport', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      frameViewport: { startFrame: 100, endFrame: 200 },
      width: 640,
      height: 240,
    })

    const clip = screen.getByTestId('dopesheet-playhead-clip')
    const line = screen.getByTestId('dopesheet-playhead-line')

    // columnWidth (248) + 1px for the timeline cells' border-l.
    expect(clip).toHaveStyle({ left: '249px' })
    expect(clip).toHaveClass('overflow-hidden')
    // Playhead should be clamped to 0 (left edge), not negative
    expect(line).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' })
    expect(screen.getAllByTestId('dopesheet-playhead-line')).toHaveLength(1)
    expect(line.querySelectorAll('span')).toHaveLength(2)
  })

  it('removes the keyframe edge inset from the classic shared timeline axis', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      presentation: 'classic',
      width: 640,
      height: 240,
    })

    expect(screen.getByTestId('dopesheet-playhead-line')).toHaveStyle({
      transform: 'translate3d(0px, 0, 0)',
    })
  })

  it('uses the main viewport right edge for the classic shared playhead clamp', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 100,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      presentation: 'classic',
      width: 640,
      height: 240,
    })

    // 640px editor - 248px property column - 1px cell border leaves a 391px
    // viewport whose final visible pixel is x=390, matching the main ruler.
    expect(screen.getByTestId('dopesheet-playhead-line')).toHaveStyle({
      transform: 'translate3d(390px, 0, 0)',
    })
  })

  it('reserves the sheet scrollbar gutter across the ruler and playhead axis', async () => {
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'dopesheet-scroll-area' ? 628 : 0
      })

    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 100,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      presentation: 'classic',
      width: 640,
      height: 240,
    })

    expect(screen.getByTestId('dopesheet-scroll-area')).toHaveStyle({
      right: '12px',
    })
    expect(screen.getByTestId('dopesheet-scrollbar')).toHaveClass(
      'right-0',
      'w-3',
      'bg-background/80',
    )
    expect(screen.getByTestId('dopesheet-ruler-scrollbar-gutter')).toHaveStyle({
      width: '12px',
    })
    expect(screen.getByTestId('dopesheet-playhead-line')).toHaveStyle({
      transform: 'translate3d(378px, 0, 0)',
    })

    clientWidthSpy.mockRestore()
  })

  it('shows the shared ruler in graph mode and defers the playhead to the graph', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      frameViewport: { startFrame: 100, endFrame: 200 },
      width: 640,
      height: 240,
      visualizationMode: 'graph',
    })

    expect(screen.getByTestId('dopesheet-ruler')).toHaveClass('cursor-ew-resize')
    // In graph mode the dopesheet overlay playhead is not rendered — the graph
    // draws its own playhead (GraphPlayhead) in the graph's coordinate space.
    expect(screen.queryByTestId('dopesheet-playhead-line')).not.toBeInTheDocument()
  })

  it('lets the shared Edit ruler drag beyond the selected item bounds', async () => {
    const onScrub = vi.fn()
    const onScrubStart = vi.fn()
    const onScrubEnd = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 50,
      frameViewport: { startFrame: -100, endFrame: 100 },
      clampViewportToContent: false,
      scrubClampToItemBounds: false,
      width: 640,
      height: 240,
      onScrub: onScrub,
      onScrubStart: onScrubStart,
      onScrubEnd: onScrubEnd,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 7, clientX: 294 })
    await fireEvent.pointerMove(ruler, { pointerId: 7, clientX: 350 })
    await fireEvent.pointerUp(ruler, { pointerId: 7, clientX: 350 })

    expect(onScrubStart).toHaveBeenCalledOnce()
    expect(onScrub).toHaveBeenNthCalledWith(1, 52)
    expect(onScrub).toHaveBeenLastCalledWith(82)
    expect(onScrubEnd).toHaveBeenCalledOnce()
  })

  it('clamps shared Edit ruler scrubbing to the composition bounds', async () => {
    const onScrub = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 50,
      frameViewport: { startFrame: -100, endFrame: 200 },
      clampViewportToContent: false,
      scrubClampToItemBounds: false,
      scrubFrameBounds: { minFrame: -20, maxFrame: 80 },
      width: 640,
      height: 240,
      onScrub: onScrub,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 17, clientX: 640 })
    await fireEvent.pointerUp(ruler, { pointerId: 17, clientX: 640 })

    expect(onScrub).toHaveBeenCalledWith(80)
  })

  it('snaps the committed playhead to a primary ruler press before pointer movement', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 10,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onScrub: (frame: number) => usePlaybackStore.getState().setScrubFrame(frame, 'item-1'),
      onScrubEnd: () => usePlaybackStore.getState().setPreviewFrame(null),
      onSkim: () => {},
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    const playhead = screen.getByTestId('dopesheet-playhead-line')
    const initialTransform = playhead.style.transform

    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 8, clientX: 196 })

    expect(usePlaybackStore.getState().currentFrame).toBe(50)
    expect(playhead.style.transform).not.toBe(initialTransform)
    expect(playhead).toHaveStyle({ transform: 'translate3d(196px, 0, 0)' })

    await fireEvent.pointerUp(ruler, { pointerId: 8, clientX: 196 })
    expect(playhead).toHaveStyle({ transform: 'translate3d(196px, 0, 0)' })
  })

  it('aligns the classic ruler pointer with the playhead after the cell border', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      frameViewport: { startFrame: 0, endFrame: 100 },
      presentation: 'classic',
      width: 640,
      height: 240,
      onScrub: (frame: number) => usePlaybackStore.getState().setScrubFrame(frame, 'item-1'),
      onSkim: () => {},
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 81, clientX: 196.5 })

    expect(usePlaybackStore.getState().currentFrame).toBe(50)
    expect(screen.getByTestId('dopesheet-playhead-line')).toHaveStyle({
      transform: 'translate3d(195.5px, 0, 0)',
    })

    await fireEvent.pointerUp(ruler, { pointerId: 81, clientX: 196.5 })
  })

  it('auto-scrolls a linked timeline while the ruler pointer stays at the edge', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const onScrub = vi.fn()
    const onRulerEdgeScroll = vi.fn((deltaPixels: number) => deltaPixels)
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      scrubClampToItemBounds: false,
      presentation: 'classic',
      width: 640,
      height: 240,
      onScrub: onScrub,
      onRulerEdgeScroll: onRulerEdgeScroll,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      x: 249,
      y: 0,
      left: 249,
      top: 0,
      right: 640,
      bottom: 22,
      width: 391,
      height: 22,
      toJSON: () => ({}),
    } as DOMRect)

    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 9, clientX: 640 })
    expect(frameCallbacks).toHaveLength(1)

    flushSync(() => frameCallbacks.shift()?.(16))
    expect(onRulerEdgeScroll).toHaveBeenCalledOnce()
    expect(onRulerEdgeScroll.mock.calls[0]?.[0]).toBeGreaterThan(0)

    // Flush the coalesced scrub produced by edge scrolling. The pointer has not
    // moved, but its frame advances as the linked viewport pans underneath it.
    flushSync(() => frameCallbacks.shift()?.(32))
    expect(onScrub.mock.calls.length).toBeGreaterThan(1)
    expect(onScrub.mock.lastCall?.[0]).toBeGreaterThan(onScrub.mock.calls[0]?.[0])

    await fireEvent.pointerUp(ruler, { pointerId: 9, clientX: 640 })
    animationFrameSpy.mockRestore()
  })

  it('keeps the playhead cursor-locked between an edge scroll and its queued scrub frame', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const scrollContainer = document.createElement('div')
    const pixelsPerFrame = 391 / 100
    const onRulerEdgeScroll = vi.fn((deltaPixels: number) => {
      const appliedPixels = Math.min(deltaPixels, 12)
      scrollContainer.scrollLeft += appliedPixels
      scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))
      return appliedPixels
    })

    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      scrubClampToItemBounds: false,
      presentation: 'classic',
      width: 640,
      height: 240,
      onScrub: (frame: number) => usePlaybackStore.getState().setScrubFrame(frame),
      onRulerEdgeScroll: onRulerEdgeScroll,
      globalFrameToPixels: (frame: number) => frame * pixelsPerFrame - scrollContainer.scrollLeft,
      timelineScrollContainer: scrollContainer,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      x: 249,
      y: 0,
      left: 249,
      top: 0,
      right: 640,
      bottom: 22,
      width: 391,
      height: 22,
      toJSON: () => ({}),
    } as DOMRect)

    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 91, clientX: 640 })
    const playhead = screen.getByTestId('dopesheet-playhead-line')
    const cursorLockedTransform = playhead.style.transform

    flushSync(() => frameCallbacks.shift()?.(16))

    expect(onRulerEdgeScroll).toHaveBeenCalledOnce()
    expect(playhead.style.transform).toBe(cursorLockedTransform)

    await fireEvent.pointerUp(ruler, { pointerId: 91, clientX: 640 })
    animationFrameSpy.mockRestore()
  })

  it('uses main-timeline wheel semantics in a standalone keyframe editor', async () => {
    const onFrameViewportChange = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onFrameViewportChange: onFrameViewportChange,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    await fireEvent.wheel(ruler, { deltaY: 120 })
    expect(onFrameViewportChange).toHaveBeenLastCalledWith({
      startFrame: 31,
      endFrame: 131,
    })

    onFrameViewportChange.mockClear()
    await fireEvent.wheel(ruler, { deltaY: 120, shiftKey: true })
    expect(onFrameViewportChange).not.toHaveBeenCalled()

    await fireEvent.wheel(ruler, { clientX: 196, deltaY: -120, ctrlKey: true })
    const zoomedViewport = onFrameViewportChange.mock.lastCall?.[0]
    expect(zoomedViewport.endFrame - zoomedViewport.startFrame).toBeLessThan(100)
  })

  it('routes linked keyframe wheel navigation through the main timeline handler', async () => {
    const timeline = document.createElement('div')
    const forwardedEvents: WheelEvent[] = []
    timeline.addEventListener(
      'wheel',
      (event) => {
        forwardedEvents.push(event)
        event.preventDefault()
      },
      { passive: false },
    )
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      viewportInteractionEnabled: false,
      timelineScrollContainer: timeline,
      presentation: 'classic',
      width: 640,
      height: 240,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    const panEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      deltaY: 120,
    })
    flushSync(() => ruler.dispatchEvent(panEvent))
    expect(panEvent.defaultPrevented).toBe(true)
    expect(forwardedEvents).toHaveLength(1)
    expect(forwardedEvents[0]).toMatchObject({
      clientX: 320,
      deltaY: 120,
      ctrlKey: false,
    })

    const zoomEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      deltaY: -120,
      ctrlKey: true,
    })
    flushSync(() => ruler.dispatchEvent(zoomEvent))
    expect(forwardedEvents).toHaveLength(2)
    expect(forwardedEvents[1]).toMatchObject({
      clientX: 400,
      deltaY: -120,
      ctrlKey: true,
    })

    await fireEvent.wheel(ruler, { deltaY: 120, shiftKey: true })
    expect(forwardedEvents).toHaveLength(2)
  })

  it('shows a separate skim playhead while keeping the committed playhead in place', async () => {
    const onSkim = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 10,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onSkim: onSkim,
      globalFrameToPixels: () => 123.25,
    })

    const committed = screen.getByTestId('dopesheet-playhead-line')
    const committedTransform = committed.style.transform
    const skim = screen.getByTestId('timeline-preview-scrubber')

    flushSync(() => usePlaybackStore.getState().setPreviewFrame(80, 'item-1'))

    expect(skim.style.display).toBe('')
    expect(skim.style.transform).toBe('translate3d(123.25px, 0, 0)')
    expect(committed.style.transform).toBe(committedTransform)

    const ruler = screen.getByTestId('dopesheet-ruler')
    await fireEvent.pointerMove(ruler, { pointerId: 1, clientX: 196 })
    expect(onSkim).toHaveBeenCalledWith(50)
    await fireEvent.pointerLeave(ruler, { pointerId: 1, clientX: 196 })
    expect(onSkim).toHaveBeenLastCalledWith(null)
  })

  it('follows an active main timeline scrub without following ordinary hover previews', async () => {
    const onSkim = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 10,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onSkim: onSkim,
    })

    const committed = screen.getByTestId('dopesheet-playhead-line')
    const initialTransform = committed.style.transform

    flushSync(() => usePlaybackStore.getState().setPreviewFrame(40, 'item-1'))
    expect(committed.style.transform).toBe(initialTransform)

    mainTimelineScrubActiveRef.current = true
    flushSync(() => usePlaybackStore.getState().setScrubFrame(60))
    expect(committed.style.transform).not.toBe(initialTransform)
    expect(mainTimelineScrubHandoffFrameRef.current).toBe(60)

    // The main timeline clears preview before ending the shared gesture. The
    // lower playhead must keep the final position rather than snapping back.
    const finalTransform = committed.style.transform
    flushSync(() => usePlaybackStore.getState().setPreviewFrame(null))
    expect(mainTimelineScrubHandoffFrameRef.current).toBe(60)
    mainTimelineScrubActiveRef.current = false
    expect(committed.style.transform).toBe(finalTransform)
  })

  it('repositions the Edit playhead from the live scroll axis without a React render', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 20
    const globalFrameToPixels = (globalFrame: number) => globalFrame - scrollContainer.scrollLeft

    flushSync(() => usePlaybackStore.getState().setCurrentFrame(150))
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 50,
      playheadFrame: 50,
      playheadClampToItemBounds: false,
      itemFrom: 100,
      totalFrames: 100,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onSkim: () => {},
      globalFrameToPixels: globalFrameToPixels,
      timelineScrollContainer: scrollContainer,
    })

    const committed = screen.getByTestId('dopesheet-playhead-line')
    expect(committed).toHaveStyle({ transform: 'translate3d(130px, 0, 0)' })

    scrollContainer.scrollLeft = 60
    scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))

    expect(committed).toHaveStyle({ transform: 'translate3d(90px, 0, 0)' })

    // Seeking can remain outside the selected clip, but the visible playhead
    // pins to the ruler edge while the shared timeline scrolls underneath it.
    scrollContainer.scrollLeft = 200
    await fireEvent.scroll(scrollContainer)

    expect(committed).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' })
  })

  it('keeps the keyframe playhead stable during main-timeline edge scrolling', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 20
    const globalFrameToPixels = (globalFrame: number) => globalFrame - scrollContainer.scrollLeft

    flushSync(() => usePlaybackStore.getState().setCurrentFrame(150))
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 50,
      playheadFrame: 50,
      playheadClampToItemBounds: false,
      itemFrom: 100,
      totalFrames: 100,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onSkim: () => {},
      globalFrameToPixels: globalFrameToPixels,
      timelineScrollContainer: scrollContainer,
    })

    const playhead = screen.getByTestId('dopesheet-playhead-line')
    const cursorLockedTransform = playhead.style.transform
    mainTimelineScrubActiveRef.current = true
    scrollContainer.scrollLeft = 60
    scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))

    expect(playhead.style.transform).toBe(cursorLockedTransform)

    notifyTimelineScrubVisualFrame(scrollContainer, {
      frame: 190,
      source: 'main',
      viewportProgress: 130 / 391,
    })
    expect(playhead.style.transform).toBe(cursorLockedTransform)

    notifyTimelineScrubVisualFrame(scrollContainer, {
      frame: 300,
      source: 'main',
      viewportProgress: 1,
    })
    expect(playhead).toHaveStyle({ transform: 'translate3d(391px, 0, 0)' })
    mainTimelineScrubActiveRef.current = false
  })

  it('derives linked edge-scroll frames from the live main-timeline scale', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const scrollContainer = document.createElement('div')
    const onScrub = vi.fn((frame: number) => {
      usePlaybackStore.getState().setScrubFrame(frame)
    })
    const onVisualFrame = vi.fn()
    scrollContainer.addEventListener(TIMELINE_SCRUB_VISUAL_FRAME_EVENT, (event) => {
      onVisualFrame((event as CustomEvent).detail)
    })
    const onRulerEdgeScroll = vi.fn(() => {
      scrollContainer.scrollLeft += 12
      scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))
      return 12
    })

    render(DopesheetEditorHarness, {
      mainSkimmer: true,
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      scrubClampToItemBounds: false,
      presentation: 'classic',
      width: 640,
      height: 240,
      fps: 30,
      onScrub: onScrub,
      onScrubEnd: () => usePlaybackStore.getState().setPreviewFrame(null),
      onRulerEdgeScroll: onRulerEdgeScroll,
      timelineScrollContainer: scrollContainer,
      getTimelineLivePixelsPerSecond: () => 240,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    const mainSkimmer = screen.getByTestId('timeline-preview-scrubber')
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      x: PROPERTY_COLUMN_WIDTH,
      y: 0,
      left: PROPERTY_COLUMN_WIDTH,
      top: 0,
      right: 640,
      bottom: 22,
      width: 392,
      height: 22,
      toJSON: () => ({}),
    } as DOMRect)

    flushSync(() => usePlaybackStore.getState().setPreviewFrame(20))
    expect(mainSkimmer).not.toHaveStyle({ display: 'none' })

    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 92, clientX: 640 })
    expect(onScrub).toHaveBeenLastCalledWith(49)
    expect(timelineSkimmerScrubSignal.current).toBe(true)
    expect(mainSkimmer).toHaveStyle({ display: 'none' })

    flushSync(() => frameCallbacks.shift()?.(16))

    expect(onVisualFrame).toHaveBeenLastCalledWith(
      expect.objectContaining({ frame: 50, source: 'keyframe' }),
    )
    expect(mainSkimmer).toHaveStyle({ display: 'none' })

    await fireEvent.pointerUp(ruler, { pointerId: 92, clientX: 640 })
    expect(timelineSkimmerScrubSignal.current).toBe(false)
    animationFrameSpy.mockRestore()
  })

  it('repositions keyframe geometry without scaling between settled React viewport updates', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 20
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-pan', frame: 30, value: 100, easing: 'linear' }],
      },
      currentFrame: 0,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      timelineScrollContainer: scrollContainer,
      timelinePanBaseScrollLeft: 20,
    })

    const rulerSurface = screen
      .getByTestId('dopesheet-ruler')
      .querySelector<HTMLElement>('[data-motion-ruler-surface]')
    expect(rulerSurface?.style.transform).not.toContain('scaleX')

    const keyframe = screen
      .getByTestId('dopesheet-editor-root')
      .querySelector<HTMLElement>('[data-dopesheet-frame="30"]')
    const initialLeft = Number.parseFloat(keyframe?.style.left ?? 'NaN')

    scrollContainer.scrollLeft = 65
    scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))

    expect(Number.parseFloat(keyframe?.style.left ?? 'NaN')).toBeCloseTo(initialLeft - 45)
    expect(keyframe?.style.transform).toBe('')
  })

  it('applies live zoom as direct keyframe pixel positions', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 60
    let livePixelsPerSecond = 150
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-zoom', frame: 30, value: 100, easing: 'linear' }],
      },
      currentFrame: 0,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      timelineScrollContainer: scrollContainer,
      timelinePanBaseScrollLeft: 20,
      timelinePanBasePixelsPerSecond: 100,
      getTimelineLivePixelsPerSecond: () => livePixelsPerSecond,
    })

    const root = screen.getByTestId('dopesheet-editor-root')
    const keyframe = root.querySelector<HTMLElement>('[data-dopesheet-frame="30"]')
    expect(keyframe?.style.left).toBe('90px')
    expect(root.style.getPropertyValue('--dopesheet-live-axis-transform')).toBe('')

    livePixelsPerSecond = 75
    scrollContainer.dispatchEvent(new Event(TIMELINE_LIVE_SCROLL_EVENT))
    expect(keyframe?.style.left).toBe('15px')
    expect(keyframe?.style.transform).toBe('')
  })

  it('uses live main-timeline pixels during the Edit settle handoff', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 500
    const mainViewportWidth = 393
    const basePixelsPerSecond = (mainViewportWidth / 100) * 30

    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-handoff', frame: 100, value: 100, easing: 'linear' }],
      },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      presentation: 'classic',
      fps: 30,
      width: 640,
      height: 240,
      timelineScrollContainer: scrollContainer,
      timelinePanBaseScrollLeft: 100,
      timelinePanBasePixelsPerSecond: basePixelsPerSecond,
      getTimelineLivePixelsPerSecond: () => basePixelsPerSecond,
    })

    const keyframe = screen
      .getByTestId('dopesheet-editor-root')
      .querySelector<HTMLElement>('[data-dopesheet-frame="100"]')
    const keyframeLeft = Number.parseFloat(keyframe?.style.left ?? 'NaN')

    expect(keyframeLeft).toBeCloseTo((100 / 30) * basePixelsPerSecond - scrollContainer.scrollLeft)
    expect(keyframe?.style.transform).toBe('')
  })

  it('uses the linked Edit viewport width as the authoritative settled axis', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.scrollLeft = 500
    const mainViewportWidth = 393
    const basePixelsPerSecond = (mainViewportWidth / 100) * 30

    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-linked', frame: 100, value: 100, easing: 'linear' }],
      },
      currentFrame: 0,
      totalFrames: 300,
      frameViewport: { startFrame: 0, endFrame: 100 },
      clampViewportToContent: false,
      presentation: 'classic',
      fps: 30,
      width: 640,
      height: 240,
      timelineScrollContainer: scrollContainer,
      timelinePanBaseScrollLeft: 100,
      timelinePanBasePixelsPerSecond: basePixelsPerSecond,
      linkedTimelineViewportWidth: mainViewportWidth,
      getTimelineLivePixelsPerSecond: () => basePixelsPerSecond,
    })

    const root = screen.getByTestId('dopesheet-editor-root')
    const keyframe = root.querySelector<HTMLElement>('[data-dopesheet-frame="100"]')
    expect(Number.parseFloat(keyframe?.style.left ?? 'NaN')).toBeCloseTo(
      (100 / 30) * basePixelsPerSecond - scrollContainer.scrollLeft - 1,
    )
    expect(root.querySelector<HTMLElement>('[data-motion-viewport-surface]')?.style.transform).toBe(
      '',
    )
    expect(screen.getByTestId('dopesheet-playhead-clip')).toHaveStyle({
      left: `${PROPERTY_COLUMN_WIDTH}px`,
    })
  })

  it('offers explicit cleanup when keyframes are parked beyond the clip', async () => {
    const onTrimAnimation = vi.fn()
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      presentation: 'classic',
      width: 640,
      height: 240,
      trimmedKeyframeCount: 2,
      onTrimAnimation: onTrimAnimation,
    })

    await fireEvent.click(screen.getByRole('button', { name: '2 trimmed' }))
    expect(onTrimAnimation).toHaveBeenCalledOnce()
  })

  it('pre-renders ruler marks around the linked viewport for immediate pans', async () => {
    const scrollContainer = document.createElement('div')
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      timelineScrollContainer: scrollContainer,
      timelinePanBaseScrollLeft: 0,
    })

    const rulerSurface = screen
      .getByTestId('dopesheet-ruler')
      .querySelector('[data-motion-ruler-surface]')
    expect(rulerSurface?.children.length).toBeGreaterThan(10)
  })

  it('hides the skim playhead while scrubbing the keyframe ruler', async () => {
    const onSkim = vi.fn((frame: number | null) => {
      usePlaybackStore.getState().setPreviewFrame(frame, frame === null ? null : 'item-1')
    })
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 10,
      frameViewport: { startFrame: 0, endFrame: 100 },
      width: 640,
      height: 240,
      onScrub: () => {},
      onScrubEnd: () => usePlaybackStore.getState().setPreviewFrame(null),
      onSkim: onSkim,
    })

    const ruler = screen.getByTestId('dopesheet-ruler')
    const skim = screen.getByTestId('timeline-preview-scrubber')

    flushSync(() => usePlaybackStore.getState().setPreviewFrame(40, 'item-1'))
    expect(skim.style.display).toBe('')

    await fireEvent.pointerDown(ruler, { button: 0, pointerId: 3, clientX: 196 })
    expect(skim.style.display).toBe('none')

    await fireEvent.pointerMove(ruler, { pointerId: 3, clientX: 220 })
    expect(skim.style.display).toBe('none')

    await fireEvent.pointerUp(ruler, { pointerId: 3, clientX: 220 })
    expect(skim.style.display).toBe('none')

    await fireEvent.pointerMove(ruler, { pointerId: 4, clientX: 240 })
    expect(onSkim).toHaveBeenLastCalledWith(expect.any(Number))
    expect(skim.style.display).toBe('')
  })

  it('keeps the navigator in the right viewport column', async () => {
    render(DopesheetEditorHarness, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      currentFrame: 0,
      width: 640,
      height: 240,
    })

    expect(screen.getByTestId('keyframe-navigator-property-column')).toBeInTheDocument()
    expect(screen.getByTestId('keyframe-navigator-viewport-column')).toContainElement(
      screen.getByTestId('keyframe-navigator-thumb'),
    )
  })
})
