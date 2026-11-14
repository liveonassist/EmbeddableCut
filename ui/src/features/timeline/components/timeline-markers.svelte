<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import {
    getTimelineScrubViewportProgress,
    notifyTimelineScrubVisualFrame,
  } from '@/shared/timeline/live-scroll-sync'
  import {
    getEdgeScrollDelta,
    getPlayheadEdgeScrollVelocity,
  } from '@/features/timeline/utils/playhead-edge-scroll'

  function applyMainTimelineScrubVisual({
    scrollContainer,
    viewportRect,
    frame,
    maxFrame,
    frameToPixels,
    playheadElements,
  }: {
    scrollContainer: HTMLDivElement | null
    viewportRect: Pick<DOMRect, 'left' | 'width'> | null
    frame: number
    maxFrame: number
    frameToPixels: (frame: number) => number
    playheadElements: HTMLElement[]
  }): void {
    if (!scrollContainer || !viewportRect) return
    // Keep the transient visual on the same integer-frame pixel as the committed
    // playhead. Following the raw pointer here makes a stationary click appear to
    // shift on release even when both positions resolve to the same frame.
    const frameTimelineX = Math.round(frameToPixels(frame))
    const visualTimelineX = Math.max(
      scrollContainer.scrollLeft,
      Math.min(
        frameTimelineX,
        scrollContainer.scrollLeft + Math.max(0, viewportRect.width - 1),
        Math.round(frameToPixels(maxFrame)),
      ),
    )
    for (const element of playheadElements) {
      element.style.transform = `translate3d(${visualTimelineX}px, 0, 0)`
    }
    notifyTimelineScrubVisualFrame(scrollContainer, {
      frame,
      source: 'main',
      viewportProgress: getTimelineScrubViewportProgress(
        visualTimelineX - scrollContainer.scrollLeft,
        viewportRect.width - 1,
      ),
    })
  }

  function applyMainTimelineEdgeScroll(
    scrollContainer: HTMLDivElement | null,
    viewportRect: Pick<DOMRect, 'left' | 'right'> | null,
    clientX: number,
    timestamp: number,
    previousTimestamp: number | null,
  ): number | null {
    if (!scrollContainer || !viewportRect) return null
    const velocity = getPlayheadEdgeScrollVelocity(clientX, viewportRect)
    const canScroll =
      (velocity < 0 && scrollContainer.scrollLeft > 0) ||
      (velocity > 0 &&
        scrollContainer.scrollLeft + scrollContainer.clientWidth < scrollContainer.scrollWidth)
    if (velocity === 0 || !canScroll) return null

    scrollContainer.scrollLeft += getEdgeScrollDelta(
      velocity,
      timestamp,
      previousTimestamp ?? timestamp - 1000 / 60,
    )
    return timestamp
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'

  // Stores and selectors
  import { useMarkersStore } from '@/features/timeline/stores/markers-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { markDirty } from '@/features/timeline/stores/timeline-actions'
  import { setInOutPointsWithoutHistory } from '@/features/timeline/stores/actions/marker-actions'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useMicRecordingStore, isMicRecordingActive } from '@/shared/state/mic-recording-store'
  import { useSelectionStore } from '@/shared/state/selection'

  // Components
  import TimelineInOutMarkers from './timeline-in-out-markers.svelte'
  import { TimelineProjectMarkers } from './timeline-project-markers'
  import { previewScrubberSuppressRef } from './preview-scrubber-suppress'
  import { beginIoPointerDrag, IoRangeStrip } from '@/shared/timeline/io-range'
  import {
    beginTimelineSkimmerScrub,
    endTimelineSkimmerScrub,
    mainTimelineScrubActiveRef,
  } from '@/shared/timeline/main-timeline-scrub'
  import { useSettingsStore } from '@/features/timeline/deps/settings'

  // Utilities and hooks
  import { useTimelineCommittedZoomContext } from '../contexts/timeline-zoom-context.svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'
  import {
    createScrubThrottleState,
    shouldCommitScrubFrame,
  } from '@/features/timeline/utils/scrub-throttle'
  import { EDITOR_LAYOUT_CSS_VALUES, getEditorLayout } from '@/config/editor-layout'
  import { sanitizeInOutPoints } from '@/features/timeline/utils/in-out-points'
  import { frameToPixelsNow, pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { drawTimelineRulerViewportCanvas } from './timeline-ruler-viewport-canvas'
  import { setGlobalCursorStyle } from '@/shared/ui/global-cursor-roots'
  import { IO_LANE_HEIGHT } from './timeline-markers'

  interface TimelineMarkersProps {
    duration: number // Total timeline duration in seconds
    width?: number // Explicit width in pixels (optional)
  }

  /**
   * Timeline markers with a single viewport-sized ruler canvas.
   */
  let { duration, width }: TimelineMarkersProps = $props()

  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  const zoom = useTimelineCommittedZoomContext()
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const inPoint = select(useMarkersStore, (s) => s.inPoint)
  const outPoint = select(useMarkersStore, (s) => s.outPoint)

  let container = $state<HTMLDivElement | null>(null)
  let rulerCanvas = $state<HTMLCanvasElement | null>(null)
  let viewportWidth = $state(0)
  // scrollLeft is ref-only — the viewport canvas updates imperatively from
  // the scroll RAF callback without a render.
  let isDragging = $state(false)
  let isRangeDragging = $state(false)

  let rangeDragCleanup: (() => void) | null = null
  const maxFrame = $derived(Math.max(1, Math.floor(duration * fps.current)))
  const sanitizedInOutPoints = $derived(
    sanitizeInOutPoints({ inPoint: inPoint.current, outPoint: outPoint.current, maxFrame }),
  )
  const safeInPoint = $derived(sanitizedInOutPoints.inPoint)
  const safeOutPoint = $derived(sanitizedInOutPoints.outPoint)

  $effect(() => {
    const nextIn = safeInPoint
    const nextOut = safeOutPoint
    if (nextIn === inPoint.current && nextOut === outPoint.current) {
      return
    }

    untrack(() => setInOutPointsWithoutHistory(nextIn, nextOut))
  })

  // Track viewport and scroll
  let scrollLeft = 0
  let rafId: number | null = null
  let hoverPreviewRaf: number | null = null
  let pendingHoverPreviewFrame: number | null = null

  // Unified scrubbing state (scroll + playhead in same RAF frame)
  let scrollContainer: HTMLDivElement | null = null
  let scrubMouseClientX = 0
  let scrubRAFId: number | null = null
  let scrubAnimationTime: number | null = null
  let scrubPlayheadElements: HTMLElement[] = []
  const skimmerScrubOwner = {}
  let isScrubActive = false
  let scrubThrottleState = createScrubThrottleState()

  // Ticks live in the lane below the IO bar, so the canvas is the ruler height
  // minus the IO lane.
  const canvasHeight = $derived(editorLayout.timelineRulerHeight - IO_LANE_HEIGHT)

  /** Draw the visible ruler directly into its viewport-sized canvas. */
  const syncRulerScroll = () =>
    untrack(() => {
      if (!rulerCanvas) return
      drawTimelineRulerViewportCanvas({
        canvas: rulerCanvas,
        scrollLeft,
        viewportWidth,
        canvasHeight,
        pixelsPerSecond: useZoomStore.getState().pixelsPerSecond,
        fps: fps.current,
      })
    })

  $effect(() => {
    const element = container
    if (!element) return

    return untrack(() => {
      // Find the actual scroll container (not the sticky parent)
      const timelineScrollContainer = element.closest('.timeline-container') as HTMLElement
      if (!timelineScrollContainer) return

      const updateViewport = () => {
        // Measure scroll container - that's the actual viewport
        viewportWidth = timelineScrollContainer.clientWidth
      }

      const updateScroll = () => {
        const newScrollLeft = timelineScrollContainer.scrollLeft
        if (newScrollLeft !== scrollLeft) {
          scrollLeft = newScrollLeft
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null
              syncRulerScroll()
            })
          }
        }
      }

      updateViewport()
      scrollLeft = timelineScrollContainer.scrollLeft
      // Initial sync is deferred to the config-change effect (runs after first render)

      // Observe scroll container for viewport size changes
      const resizeObserver = new ResizeObserver(updateViewport)
      resizeObserver.observe(timelineScrollContainer)
      timelineScrollContainer.addEventListener('scroll', updateScroll, { passive: true })

      return () => {
        resizeObserver.disconnect()
        timelineScrollContainer.removeEventListener('scroll', updateScroll)
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
        }
      }
    })
  })

  // Redraw once per animation frame at live zoom. The viewport canvas keeps
  // work bounded to visible pixels without creating timeline-length nodes.
  $effect(() =>
    useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond === previousState.pixelsPerSecond) return

      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        syncRulerScroll()
      })
    }),
  )

  // Trigger sync on non-store config changes.
  $effect(() => {
    void [fps.current, canvasHeight, viewportWidth, rulerCanvas]
    syncRulerScroll()
  })

  /**
   * Unified scrub loop - handles BOTH edge scroll AND playhead in same RAF frame
   * This ensures scroll and playhead are always perfectly synchronized
   */
  const runUnifiedScrubLoop = (timestamp: number) => {
    if (!isScrubActive || !container) {
      scrubRAFId = null
      return
    }

    const activeScrollContainer = scrollContainer
    if (!activeScrollContainer) {
      scrubRAFId = null
      return
    }
    const mouseClientX = scrubMouseClientX
    // One layout read owns all viewport and timeline-coordinate work for this
    // frame. The content origin is the viewport origin minus native scroll.
    const viewportRect = activeScrollContainer.getBoundingClientRect()

    // --- STEP 1: Calculate and apply edge scroll ---
    scrubAnimationTime = applyMainTimelineEdgeScroll(
      activeScrollContainer,
      viewportRect,
      mouseClientX,
      timestamp,
      scrubAnimationTime,
    )

    // --- STEP 2: Update playhead with the freshly applied scroll position ---
    const x = mouseClientX - viewportRect.left + activeScrollContainer.scrollLeft

    // Calculate frame (pixel-perfect: round to whole frames)
    const maxFrame = Math.floor(duration * fps.current)
    const frame = Math.min(maxFrame, Math.max(0, Math.round(pixelsToFrameNow(x))))

    const nowMs = performance.now()
    if (
      shouldCommitScrubFrame({
        state: scrubThrottleState,
        pointerX: x,
        targetFrame: frame,
        pixelsPerSecond: useZoomStore.getState().pixelsPerSecond,
        nowMs,
      })
    ) {
      usePlaybackStore.getState().setScrubFrame(frame)
    }

    applyMainTimelineScrubVisual({
      scrollContainer: activeScrollContainer,
      viewportRect,
      frame,
      maxFrame,
      frameToPixels: frameToPixelsNow,
      playheadElements: scrubPlayheadElements,
    })

    // --- STEP 3: Continue loop while scrubbing ---
    scrubRAFId = requestAnimationFrame(runUnifiedScrubLoop)
  }

  const getTimelineXFromClientX = (clientX: number): number => {
    if (!container) return 0
    return clientX - container.getBoundingClientRect().left
  }

  const getFrameFromClientX = (clientX: number): number => {
    const x = getTimelineXFromClientX(clientX)
    const maxFrame = Math.floor(duration * fps.current)
    return Math.min(maxFrame, Math.max(0, Math.round(pixelsToFrameNow(x))))
  }

  const handleRulerMouseMove = (e: MouseEvent) => {
    if (isDragging || isRangeDragging) return
    // The ruler owns this hover. Prevent TimelineContent's bubbling handler
    // from scheduling a second publication for the same pointer sample.
    e.stopPropagation()

    const frame = getFrameFromClientX(e.clientX)
    pendingHoverPreviewFrame = frame
    if (hoverPreviewRaf !== null) return
    hoverPreviewRaf = requestAnimationFrame(() => {
      hoverPreviewRaf = null
      const nextFrame = pendingHoverPreviewFrame
      pendingHoverPreviewFrame = null
      if (nextFrame !== null) {
        usePlaybackStore.getState().setPreviewFrame(nextFrame)
      }
    })
  }

  const handleRulerMouseLeave = (e: MouseEvent) => {
    if (isDragging || isRangeDragging) return

    const timelineContainer = (e.currentTarget as HTMLElement).closest(
      '[data-timeline-scroll-container]',
    )
    if (e.relatedTarget instanceof Node && timelineContainer?.contains(e.relatedTarget)) {
      if (hoverPreviewRaf !== null) {
        cancelAnimationFrame(hoverPreviewRaf)
        hoverPreviewRaf = null
      }
      pendingHoverPreviewFrame = null
      // The parent timeline owns skimming across both its ruler and tracks.
      // Crossing that internal boundary is not a skim release: clearing here
      // briefly retargets the committed frame and cancels compound-frame work
      // before the parent publishes the next hovered frame.
      return
    }

    if (hoverPreviewRaf !== null) {
      cancelAnimationFrame(hoverPreviewRaf)
      hoverPreviewRaf = null
    }
    pendingHoverPreviewFrame = null
    usePlaybackStore.getState().setPreviewFrame(null)
  }

  $effect(() => () => {
    if (hoverPreviewRaf !== null) {
      cancelAnimationFrame(hoverPreviewRaf)
    }
    hoverPreviewRaf = null
    pendingHoverPreviewFrame = null
  })

  const handleRangeMouseDown = (e: PointerEvent) => {
    const startIn = safeInPoint
    const startOut = safeOutPoint
    if (startIn === null || startOut === null) return

    const startTimelineX = getTimelineXFromClientX(e.clientX)
    const rangeTop = (e.currentTarget as HTMLElement).getBoundingClientRect().top
    let restoreCursor: (() => void) | null = null
    let lastIn = startIn
    let lastOut = startOut

    const cleanup = beginIoPointerDrag(
      e,
      (clientX) => {
        const currentFps = fps.current
        const deltaFrames = Math.round(
          pixelsToFrameNow(getTimelineXFromClientX(clientX)) - pixelsToFrameNow(startTimelineX),
        )
        const span = Math.max(1, startOut - startIn)
        const maxIn = Math.max(0, Math.floor(duration * currentFps) - span)
        const nextIn = Math.max(0, Math.min(startIn + deltaFrames, maxIn))
        const nextOut = nextIn + span
        const label = `${formatTimecodeCompact(nextIn, currentFps)} → ${formatTimecodeCompact(
          nextOut,
          currentFps,
        )}`
        const rulerScrollContainer = container?.closest(
          '.timeline-container',
        ) as HTMLDivElement | null
        const coordinateBox = rulerScrollContainer ?? container
        const coordinateRect = coordinateBox?.getBoundingClientRect()
        const containerScrollLeft = rulerScrollContainer?.scrollLeft ?? 0
        const rangeLeft =
          (coordinateRect?.left ?? 0) + zoom.frameToPixels(nextIn) - containerScrollLeft
        const rangeRight =
          (coordinateRect?.left ?? 0) + zoom.frameToPixels(nextOut) - containerScrollLeft
        const visibleLeft = coordinateRect
          ? Math.max(coordinateRect.left, Math.min(coordinateRect.right, rangeLeft))
          : rangeLeft
        const visibleRight = coordinateRect
          ? Math.max(coordinateRect.left, Math.min(coordinateRect.right, rangeRight))
          : rangeRight
        const readout = {
          label,
          x: (visibleLeft + visibleRight) / 2,
          // The global readout places its bottom 16px above this coordinate;
          // offset by the lane height so it sits just above the body.
          y: rangeTop + IO_LANE_HEIGHT,
        }
        // Skip redundant writes while dragging (still update the readout).
        if (nextIn === lastIn && nextOut === lastOut) return readout
        setInOutPointsWithoutHistory(nextIn, nextOut)
        // Skim the preview to the range's leading (in) edge as it slides.
        usePlaybackStore.getState().setPreviewFrame(nextIn)
        lastIn = nextIn
        lastOut = nextOut
        return readout
      },
      () => {
        restoreCursor?.()
        previewScrubberSuppressRef.current = false
        usePlaybackStore.getState().setPreviewFrame(null)
        markDirty()
        isRangeDragging = false
        rangeDragCleanup = null
      },
    )
    if (!cleanup) return
    restoreCursor = setGlobalCursorStyle('cursor', 'move')
    // Keep the preview canvas refreshing but pin the ghost skimmer so it
    // doesn't chase the range as it slides (matches the Color workspace).
    previewScrubberSuppressRef.current = true
    isRangeDragging = true
    rangeDragCleanup = cleanup
  }

  // Scrubbing handlers
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation() // Prevent click from bubbling to container and clearing selection
    if (!container) return

    // Seeking is disabled during a voiceover take — moving the playhead
    // without moving the mic audio would desync the recording irreparably.
    if (isMicRecordingActive(useMicRecordingStore.getState().status)) return

    // Clear marker selection when clicking on ruler (only if a marker is selected)
    const { selectedMarkerId, selectMarker } = useSelectionStore.getState()
    if (selectedMarkerId) {
      selectMarker(null)
    }

    // Cache scroll container for edge-scrolling
    scrollContainer = container.closest('.timeline-container') as HTMLDivElement | null
    scrubPlayheadElements = scrollContainer
      ? Array.from(scrollContainer.querySelectorAll<HTMLElement>('[data-timeline-playhead]'))
      : []

    // Initialize unified scrub state
    scrubMouseClientX = e.clientX
    scrubAnimationTime = null
    isScrubActive = true
    mainTimelineScrubActiveRef.current = true
    beginTimelineSkimmerScrub(skimmerScrubOwner)

    usePlaybackStore.getState().pause()

    // Immediate frame update on click using the ruler's time-axis origin.
    const viewportRect = scrollContainer?.getBoundingClientRect() ?? null
    const x = viewportRect
      ? e.clientX - viewportRect.left + scrollContainer!.scrollLeft
      : e.clientX - container.getBoundingClientRect().left
    const maxFrame = Math.floor(duration * fps.current)
    const frame = Math.min(maxFrame, Math.max(0, Math.round(pixelsToFrameNow(x))))
    usePlaybackStore.getState().setScrubFrame(frame)
    applyMainTimelineScrubVisual({
      scrollContainer,
      viewportRect,
      frame,
      maxFrame,
      frameToPixels: frameToPixelsNow,
      playheadElements: scrubPlayheadElements,
    })
    scrubThrottleState = createScrubThrottleState({
      pointerX: x,
      frame,
      nowMs: performance.now(),
    })

    isDragging = true

    // Start unified RAF loop
    if (scrubRAFId === null) {
      scrubRAFId = requestAnimationFrame(runUnifiedScrubLoop)
    }
  }

  $effect(() => {
    if (!isDragging) return

    return untrack(() => {
      const restoreCursor = setGlobalCursorStyle('cursor', 'ew-resize')

      const handleMouseMove = (e: MouseEvent) => {
        // Just store position - the unified RAF loop handles everything else
        scrubMouseClientX = e.clientX
      }

      const handleMouseUp = () => {
        // Stop the unified scrub loop
        isScrubActive = false
        if (scrubRAFId !== null) {
          cancelAnimationFrame(scrubRAFId)
          scrubRAFId = null
        }
        const finalFrame = getFrameFromClientX(scrubMouseClientX)
        usePlaybackStore.getState().setScrubFrame(finalFrame)
        const finalTimelineX = Math.round(frameToPixelsNow(finalFrame))
        for (const element of scrubPlayheadElements) {
          element.style.transform = `translate3d(${finalTimelineX}px, 0, 0)`
        }
        scrubAnimationTime = null
        scrubPlayheadElements = []
        isDragging = false
        usePlaybackStore.getState().setPreviewFrame(null)
        // Clear after the preview notification so linked playheads retain the
        // final frame while their slower props catch up.
        mainTimelineScrubActiveRef.current = false
        endTimelineSkimmerScrub(skimmerScrubOwner)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('blur', handleMouseUp)
        restoreCursor()
        // Ensure cleanup
        isScrubActive = false
        mainTimelineScrubActiveRef.current = false
        endTimelineSkimmerScrub(skimmerScrubOwner)
        if (scrubRAFId !== null) {
          cancelAnimationFrame(scrubRAFId)
          scrubRAFId = null
        }
        scrubAnimationTime = null
        scrubPlayheadElements = []
      }
    })
  })

  // Tear down an in-flight range drag if the component unmounts mid-gesture.
  $effect(() => () => rangeDragCleanup?.())
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={container}
  class="border-b border-border/80 relative"
  onmousedown={handleMouseDown}
  onmousemove={handleRulerMouseMove}
  onmouseleave={handleRulerMouseLeave}
  style:background="oklch(0.22 0 0 / 0.22)"
  style:user-select="none"
  style:cursor="ew-resize"
  style:height={EDITOR_LAYOUT_CSS_VALUES.timelineRulerHeight}
  style:width={width ? `${width}px` : undefined}
  style:min-width={width ? `${width}px` : undefined}
>
  <!-- Viewport-sized ruler canvas below the IO lane. -->
  <div
    class="absolute left-0 right-0 bottom-0 pointer-events-none"
    style:top="{IO_LANE_HEIGHT}px"
  >
    <canvas
      bind:this={rulerCanvas}
      data-main-timeline-ruler-canvas
      aria-hidden="true"
      class="sticky left-0 block pointer-events-none text-[10px] text-muted-foreground"
      style:width={viewportWidth ? `${viewportWidth}px` : undefined}
      style:height="{canvasHeight}px"
      style:contain="layout paint"
    ></canvas>
  </div>

  <!-- IO lane backdrop + divider so the in/out bar reads as its own track
       rather than floating over the ruler ticks. -->
  <div
    class="absolute left-0 right-0 top-0 border-b border-border/70 bg-black/25 pointer-events-none"
    style:height="{IO_LANE_HEIGHT}px"
    style:z-index="8"
  ></div>

  <!-- Draggable in/out strip — its own lane at the top of the ruler -->
  {#if safeInPoint !== null && safeOutPoint !== null}
    <IoRangeStrip
      left="{zoom.frameToPixels(safeInPoint)}px"
      width="{zoom.frameToPixels(safeOutPoint) - zoom.frameToPixels(safeInPoint)}px"
      height={IO_LANE_HEIGHT}
      class="cursor-move active:cursor-move"
      onDragStart={handleRangeMouseDown}
      testId="edit-timeline-io-strip"
    />
  {/if}

  <!-- In/Out markers (DOM - only 2 elements) -->
  <TimelineInOutMarkers />

  <!-- Project markers (DOM - minimal count) -->
  <TimelineProjectMarkers />
</div>
