<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import {
    frameToPixelsNow,
    getPixelsPerSecondNow,
    pixelsToFrameNow,
  } from '@/features/timeline/utils/zoom-conversions'

  function setTranslateXIfChanged(element: HTMLElement, left: number): void {
    const transform = `translate3d(${left}px, 0, 0)`
    if (element.style.transform !== transform) element.style.transform = transform
  }

  function updatePlayheadPosition(element: HTMLElement | null, frame: number): void {
    if (!element) return
    setTranslateXIfChanged(element, Math.round(frameToPixelsNow(frame)))
  }

  function getPlayheadDragSurfaces({
    playhead,
    explicitCoordinateSurface,
    inRuler,
  }: {
    playhead: HTMLDivElement | null
    explicitCoordinateSurface: HTMLDivElement | null
    inRuler: boolean
  }): {
    scrollContainer: HTMLDivElement | null
    coordinateSurface: HTMLDivElement | null
  } {
    if (!playhead) {
      return {
        scrollContainer: null,
        coordinateSurface: explicitCoordinateSurface,
      }
    }

    const scrollContainer = playhead.closest<HTMLDivElement>('.timeline-container')
    const fallbackSurface = inRuler
      ? playhead.closest<HTMLDivElement>('.timeline-ruler')
      : playhead.closest<HTMLDivElement>('.timeline-tracks')
    const coordinateSurface =
      explicitCoordinateSurface ?? (scrollContainer ? null : fallbackSurface)

    return { scrollContainer, coordinateSurface }
  }

  function getPlayheadPointerX(
    coordinateSurface: HTMLDivElement | null,
    scrollContainer: HTMLDivElement | null,
    clientX: number,
    fallbackX: number,
  ): number {
    if (coordinateSurface) {
      return clientX - coordinateSurface.getBoundingClientRect().left
    }
    if (scrollContainer) {
      return clientX - scrollContainer.getBoundingClientRect().left + scrollContainer.scrollLeft
    }

    return fallbackX
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'

  // Stores and selectors
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useMicRecordingStore, isMicRecordingActive } from '@/shared/state/mic-recording-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'

  // Utilities and hooks
  import {
    createScrubThrottleState,
    shouldCommitScrubFrame,
  } from '@/features/timeline/utils/scrub-throttle'
  import { withPerfMeasure } from '@/shared/logging/perf-marks'
  import PlayheadMarks from '@/shared/ui/playhead-marks.svelte'
  import {
    beginTimelineSkimmerScrub,
    endTimelineSkimmerScrub,
    mainTimelineScrubActiveRef,
  } from '@/shared/timeline/main-timeline-scrub'
  import {
    TIMELINE_SCRUB_VISUAL_FRAME_EVENT,
    getTimelineScrubViewportProgress,
    getTimelineScrubViewportX,
    notifyTimelineScrubVisualFrame,
    type TimelineScrubVisualFrameDetail,
  } from '@/shared/timeline/live-scroll-sync'
  import {
    getEdgeScrollDelta,
    getPlayheadEdgeScrollVelocity,
  } from '@/features/timeline/utils/playhead-edge-scroll'
  import { setGlobalCursorStyle } from '@/shared/ui/global-cursor-roots'

  interface TimelinePlayheadProps {
    inRuler?: boolean // If true, shows diamond indicator for ruler
    maxFrame?: number // Maximum frame the playhead can be dragged to (content duration)
    // Drop the marks below the ruler's top IO lane so the flag doesn't share it.
    topOffsetPx?: number
    coordinateSurface?: HTMLDivElement | null
  }

  /**
   * Timeline Playhead Component
   *
   * Renders the playhead indicator that shows the current frame position
   * - Vertical line across all tracks
   * - Diamond indicator in ruler when inRuler=true
   * - Synchronized with playback store via manual subscription (no re-renders during playback)
   * - Draggable for scrubbing through timeline
   */
  let {
    inRuler = false,
    maxFrame,
    topOffsetPx = 0,
    coordinateSurface,
  }: TimelinePlayheadProps = $props()

  let isDragging = $state(false)
  let isExternalDrag = $state(false)
  let playhead = $state<HTMLDivElement | null>(null)
  let isDraggingNow = false

  // Only the hit area's cursor and pointer-events read the tool, so a tool
  // change updates those two styles and nothing else.
  const activeTool = select(useSelectionStore, (s) => s.activeTool)

  let pixelsPerSecond = getPixelsPerSecondNow()

  // RAF throttling state for smooth scrubbing without excessive state updates
  let rafId: number | null = null
  let scrubClientX: number | null = null
  let scrubAnimationTime: number | null = null
  let scrubScrollContainer: HTMLDivElement | null = null
  let scrubCoordinateSurface: HTMLDivElement | null = null
  let scrubPlayheadElements: HTMLElement[] = []
  let resumePlaybackRaf: number | null = null
  const skimmerScrubOwner = {}
  let scrubThrottleState = createScrubThrottleState({
    frame: usePlaybackStore.getState().currentFrame,
    nowMs: performance.now(),
  })

  $effect(() => {
    const dragging = isDragging
    untrack(() => {
      isDraggingNow = dragging
      const playbackState = usePlaybackStore.getState()
      updatePlayheadPosition(
        playhead,
        dragging && playbackState.previewFrame !== null
          ? playbackState.previewFrame
          : playbackState.currentFrame,
      )
    })
  })

  $effect(() => {
    return () => {
      if (resumePlaybackRaf !== null) {
        cancelAnimationFrame(resumePlaybackRaf)
        usePlaybackStore.getState().cancelPlaybackScrubResume()
      }
    }
  })

  // Subscribe to playback frame changes and update position directly.
  // During playhead drags, use the same atomic scrub state as the main ruler
  // so the fast-scrub overlay hands back to the player consistently.
  $effect(() => {
    const element = playhead
    if (!element) return

    const updateCurrentPosition = () => {
      const playbackState = usePlaybackStore.getState()
      updatePlayheadPosition(
        element,
        isDraggingNow && playbackState.previewFrame !== null
          ? playbackState.previewFrame
          : playbackState.currentFrame,
      )
    }

    // Initial update
    updateCurrentPosition()

    const unsubscribePlayback = usePlaybackStore.subscribe((state) => {
      updatePlayheadPosition(
        element,
        isDraggingNow && state.previewFrame !== null ? state.previewFrame : state.currentFrame,
      )
    })
    const unsubscribeZoom = useZoomStore.subscribe((state, previousState) => {
      pixelsPerSecond = state.pixelsPerSecond
      if (state.pixelsPerSecond !== previousState.pixelsPerSecond) {
        updateCurrentPosition()
      }
    })
    const unsubscribeTimelineSettings = useTimelineSettingsStore.subscribe(
      (state, previousState) => {
        if (state.fps !== previousState.fps) {
          updateCurrentPosition()
        }
      },
    )

    return () => {
      unsubscribePlayback()
      unsubscribeZoom()
      unsubscribeTimelineSettings()
    }
  })

  $effect(() => {
    const element = playhead
    const scrollContainer = element?.closest<HTMLDivElement>('.timeline-container')
    if (!element || !scrollContainer) return

    const updateFromLinkedScrub = (event: Event) => {
      const { source, viewportProgress } = (event as CustomEvent<TimelineScrubVisualFrameDetail>)
        .detail
      if (source !== 'keyframe') return
      const viewportX = getTimelineScrubViewportX(viewportProgress, scrollContainer.clientWidth - 1)
      setTranslateXIfChanged(element, scrollContainer.scrollLeft + viewportX)
    }

    scrollContainer.addEventListener(TIMELINE_SCRUB_VISUAL_FRAME_EVENT, updateFromLinkedScrub)
    return () => {
      scrollContainer.removeEventListener(TIMELINE_SCRUB_VISUAL_FRAME_EVENT, updateFromLinkedScrub)
    }
  })

  // Track external drag operations to disable pointer events on hit areas
  $effect(() => {
    const handleDragStart = () => (isExternalDrag = true)
    const handleDragEnd = () => (isExternalDrag = false)

    document.addEventListener('dragstart', handleDragStart)
    document.addEventListener('dragend', handleDragEnd)
    document.addEventListener('drop', handleDragEnd)

    return () => {
      document.removeEventListener('dragstart', handleDragStart)
      document.removeEventListener('dragend', handleDragEnd)
      document.removeEventListener('drop', handleDragEnd)
    }
  })

  // Handle drag start
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Seeking is disabled during a voiceover take (see timeline-markers).
    if (isMicRecordingActive(useMicRecordingStore.getState().status)) return
    const playbackState = usePlaybackStore.getState()
    if (resumePlaybackRaf !== null) {
      cancelAnimationFrame(resumePlaybackRaf)
      resumePlaybackRaf = null
      playbackState.cancelPlaybackScrubResume()
    }
    // Match ruler scrubbing: grabbing the playhead takes transport ownership
    // immediately so the playback clock cannot overwrite the drag.
    playbackState.beginPlaybackScrub()
    const { scrollContainer, coordinateSurface: surface } = getPlayheadDragSurfaces({
      playhead,
      explicitCoordinateSurface: coordinateSurface ?? null,
      inRuler,
    })
    const pointerX = getPlayheadPointerX(
      surface,
      scrollContainer,
      e.clientX,
      frameToPixelsNow(playbackState.currentFrame),
    )
    scrubClientX = e.clientX
    scrubAnimationTime = null
    scrubScrollContainer = scrollContainer
    scrubCoordinateSurface = surface
    scrubPlayheadElements = scrollContainer
      ? Array.from(scrollContainer.querySelectorAll<HTMLElement>('[data-timeline-playhead]'))
      : playhead
        ? [playhead]
        : []
    scrubThrottleState = createScrubThrottleState({
      pointerX,
      frame: playbackState.currentFrame,
      nowMs: performance.now(),
    })
    isDraggingNow = true
    mainTimelineScrubActiveRef.current = true
    beginTimelineSkimmerScrub(skimmerScrubOwner)
    usePlaybackStore.getState().setPreviewFrame(null)
    isDragging = true
  }

  // Handle dragging
  $effect(() => {
    if (!isDragging) return

    return untrack(() => {
      // Keep the horizontal scrub cursor stable while crossing timeline children.
      const restoreCursor = setGlobalCursorStyle('cursor', 'ew-resize')

      const runScrubLoop = (timestamp: number) => {
        rafId = null
        const clientX = scrubClientX
        if (clientX === null) return

        withPerfMeasure('tl.raf.playheadScrub', () => {
          const scrollContainer = scrubScrollContainer
          const bounds = scrollContainer?.getBoundingClientRect()
          if (scrollContainer && bounds) {
            const velocity = getPlayheadEdgeScrollVelocity(clientX, bounds)
            const canScroll =
              (velocity < 0 && scrollContainer.scrollLeft > 0) ||
              (velocity > 0 &&
                scrollContainer.scrollLeft + scrollContainer.clientWidth <
                  scrollContainer.scrollWidth)
            if (velocity !== 0 && canScroll) {
              const previousTimestamp = scrubAnimationTime ?? timestamp - 1000 / 60
              scrollContainer.scrollLeft += getEdgeScrollDelta(
                velocity,
                timestamp,
                previousTimestamp,
              )
              scrubAnimationTime = timestamp
            } else {
              scrubAnimationTime = null
            }
          }

          const surface = scrubCoordinateSurface
          const coordinateBounds =
            surface?.getBoundingClientRect() ?? scrollContainer?.getBoundingClientRect()
          if (!coordinateBounds) return

          const scrollLeft = scrollContainer?.scrollLeft ?? 0
          const coordinateScrollOffset = surface ? 0 : scrollLeft
          const pointerX = clientX - coordinateBounds.left + coordinateScrollOffset
          let targetFrame = Math.max(0, Math.round(pixelsToFrameNow(pointerX)))
          if (maxFrame !== undefined) {
            targetFrame = Math.min(targetFrame, maxFrame)
          }

          if (
            shouldCommitScrubFrame({
              state: scrubThrottleState,
              pointerX,
              targetFrame,
              pixelsPerSecond,
              nowMs: performance.now(),
            })
          ) {
            usePlaybackStore.getState().setScrubFrame(targetFrame)
          }

          const viewportBounds = scrollContainer?.getBoundingClientRect() ?? coordinateBounds
          // Match the committed playhead's integer-frame position during the
          // gesture so a stationary press/release cannot visibly settle sideways.
          const frameTimelineX = Math.round(frameToPixelsNow(targetFrame))
          const maxTimelineX =
            maxFrame === undefined ? undefined : Math.round(frameToPixelsNow(maxFrame))
          const visualTimelineX = Math.max(
            scrollLeft,
            Math.min(
              frameTimelineX,
              scrollLeft + Math.max(0, viewportBounds.width - 1),
              maxTimelineX ?? Number.POSITIVE_INFINITY,
            ),
          )
          for (const element of scrubPlayheadElements) {
            setTranslateXIfChanged(element, visualTimelineX)
          }
          notifyTimelineScrubVisualFrame(scrollContainer, {
            frame: targetFrame,
            source: 'main',
            viewportProgress: getTimelineScrubViewportProgress(
              visualTimelineX - scrollLeft,
              viewportBounds.width - 1,
            ),
          })
        })

        if (isDraggingNow) rafId = requestAnimationFrame(runScrubLoop)
      }

      const handleMouseMove = (e: MouseEvent) => {
        scrubClientX = e.clientX
      }

      const finishDrag = (resumePlayback: boolean) => {
        // Cancel any pending RAF before clearing preview to prevent resurrection
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }

        const clientX = scrubClientX
        const scrollContainer = scrubScrollContainer
        const surface = scrubCoordinateSurface
        const bounds = surface?.getBoundingClientRect() ?? scrollContainer?.getBoundingClientRect()
        if (clientX !== null && bounds) {
          const pointerX =
            clientX - bounds.left + (surface ? 0 : (scrollContainer?.scrollLeft ?? 0))
          let frame = Math.max(0, Math.round(pixelsToFrameNow(pointerX)))
          if (maxFrame !== undefined) frame = Math.min(frame, maxFrame)
          usePlaybackStore.getState().setScrubFrame(frame)
        }

        isDraggingNow = false
        scrubClientX = null
        scrubAnimationTime = null
        scrubScrollContainer = null
        scrubCoordinateSurface = null
        scrubPlayheadElements = []
        usePlaybackStore.getState().setPreviewFrame(null)
        // Keep the shared flag set through the preview-clear notification so the
        // keyframe playhead retains the final scrub position until props settle.
        mainTimelineScrubActiveRef.current = false
        endTimelineSkimmerScrub(skimmerScrubOwner)
        isDragging = false

        if (resumePlayback) {
          // Give the paused seek one paint boundary to settle before restarting.
          // Resuming in the mouseup event can let the previous playback clock
          // overwrite the released frame.
          resumePlaybackRaf = requestAnimationFrame(() => {
            resumePlaybackRaf = null
            usePlaybackStore.getState().resumePlaybackAfterScrub()
          })
        } else {
          usePlaybackStore.getState().cancelPlaybackScrubResume()
        }
      }
      const handleMouseUp = () => finishDrag(true)
      const handleWindowBlur = () => finishDrag(false)

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleWindowBlur)
      rafId = requestAnimationFrame(runScrubLoop)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('blur', handleWindowBlur)
        // Restore original cursor
        restoreCursor()
        // Cancel any pending RAF to prevent memory leaks
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        scrubAnimationTime = null
        mainTimelineScrubActiveRef.current = false
        endTimelineSkimmerScrub(skimmerScrubOwner)
      }
    })
  })
</script>

<!-- The transform is written from store subscriptions (no re-renders during playback). -->
<div
  bind:this={playhead}
  data-timeline-playhead={inRuler ? 'ruler' : 'tracks'}
  class="absolute top-0 bottom-0"
  style:pointer-events="none"
  style:z-index="9999"
>
  <!-- Shared line + (ruler-only) flag handle. -->
  <PlayheadMarks handle={inRuler ? 'flag' : 'none'} {topOffsetPx} />

  <!-- Invisible larger hit area over the flag — draggable to scrub. -->
  {#if inRuler}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      data-playhead-handle
      class="absolute"
      style:top="{topOffsetPx}px"
      style:left="0px"
      style:width="20px"
      style:height="20px"
      style:transform="translateX(-50%)"
      style:cursor={activeTool.current === 'razor' ? 'default' : 'ew-resize'}
      style:pointer-events={activeTool.current === 'razor' || isExternalDrag ? 'none' : 'auto'}
      style:background-color="transparent"
      onmousedown={handleMouseDown}
    ></div>
  {/if}
</div>
