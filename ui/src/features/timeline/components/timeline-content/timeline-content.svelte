<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const ACTIVE_TIMELINE_GESTURE_CURSOR_CLASSES = [
    'timeline-cursor-trim-left',
    'timeline-cursor-trim-right',
    'timeline-cursor-trim-center',
    'timeline-cursor-slip-smart',
    'timeline-cursor-slide-smart',
    'timeline-cursor-gauge',
  ] as const

  const FINE_ZOOM_FACTOR = 1.1
  const DENSE_TIMELINE_HOVER_PREVIEW_DELAY_MS = 150
  const ZOOM_UPDATE_INTERVAL = 50 // Match store throttle - update at most 20fps during momentum
  const SCROLL_PERSIST_DEBOUNCE_MS = 150

  function revealTrackInScrollContainer(
    container: HTMLDivElement | null,
    trackId: string,
  ): boolean {
    if (!container) {
      return false
    }

    const trackElement = Array.from(
      container.querySelectorAll<HTMLElement>('[data-track-id]'),
    ).find((element) => element.getAttribute('data-track-id') === trackId)

    if (!trackElement) {
      return false
    }

    const containerRect = container.getBoundingClientRect()
    const trackRect = trackElement.getBoundingClientRect()
    const trackTop = trackRect.top - containerRect.top + container.scrollTop
    const trackBottom = trackTop + trackRect.height
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight

    if (trackTop < viewTop) {
      container.scrollTop = Math.max(0, trackTop)
    } else if (trackBottom > viewBottom) {
      container.scrollTop = Math.max(0, trackBottom - container.clientHeight)
    }

    return true
  }

  function getVerticalScrollTarget(target: EventTarget | null): HTMLDivElement | null {
    if (!(target instanceof Element)) {
      return null
    }

    return target.closest('[data-track-section-scroll]') as HTMLDivElement | null
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'

  // Stores and selectors
  import { setScrollPosition } from '@/features/timeline/stores/timeline-actions'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { selectItemIds } from '@/features/timeline/stores/items-store-indexes'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
  import { registerZoomTo100, useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'

  // Hooks
  import { useWaveformPrefetch } from '../../hooks/use-waveform-prefetch.svelte'
  import { useTimelineAudioSkimPreview } from '../../hooks/use-timeline-audio-skim-preview.svelte'
  import { withPerfMeasure } from '@/shared/logging/perf-marks'
  import { useTrackSectionHasOverflow } from './use-track-section-has-overflow.svelte'

  // Constants
  import {
    SCROLL_SENSITIVITY,
    SCROLL_FRICTION,
    SCROLL_MIN_VELOCITY,
    MOMENTUM_REF_FRAME_MS,
    SCROLL_SMOOTHING,
    SCROLL_GESTURE_TIMEOUT,
    ZOOM_FRICTION,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_MIN_VELOCITY,
    TIMELINE_RULER_HEIGHT,
    TRACK_SECTION_DIVIDER_HEIGHT,
    computeWheelZoomStep,
  } from '@/features/timeline/constants'

  // Components
  import TimelinePlayhead from '../timeline-playhead.svelte'
  import TimelinePreviewScrubber from '../timeline-preview-scrubber.svelte'
  import TimelineRulerSurface from '../timeline-ruler-surface.svelte'
  import TimelineGuidelines from '../timeline-guidelines.svelte'
  import TimelineRecordingOverlay from '../timeline-recording-overlay.svelte'
  import { IO_LANE_HEIGHT } from '../timeline-markers'
  import TimelineMarqueeLayer from './timeline-marquee-layer.svelte'
  import TimelineTrackSectionsSurface from './timeline-track-sections-surface.svelte'
  import TrackSectionScrollbarOverlay from './track-section-scrollbar-overlay.svelte'
  import { announceTimelineMarqueeActive } from '@/features/timeline/utils/timeline-interaction-events'

  // Group utilities
  import { getVisibleTrackIds } from '@/features/timeline/utils/group-utils'
  import { getRazorSplitPosition } from '@/features/timeline/utils/razor-snap'
  import { getTrackKind } from '@/features/timeline/utils/classic-tracks'
  import { resizeTracksOfKindByDelta } from '@/features/timeline/utils/track-resize'
  import type { RazorSnapTarget } from '@/features/timeline/utils/razor-snap'
  import { useMarkersStore } from '@/features/timeline/stores/markers-store'
  import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
  import { getFilteredItemSnapEdges } from '@/features/timeline/utils/timeline-snap-utils'
  import { expandSelectionWithLinkedItems } from '@/features/timeline/utils/linked-items'
  import { getTimelineWidth, getZoomToFitLevel } from '@/features/timeline/utils/timeline-layout'
  import { DENSE_TIMELINE_TRACK_ITEM_THRESHOLD } from '@/features/timeline/utils/timeline-dom-density'
  import {
    getAnchoredZoomScrollLeft,
    getCursorZoomAnchor,
    getPlayheadZoomAnchor,
    type TimelineZoomAnchor,
  } from '@/features/timeline/utils/zoom-anchor'
  import { frameToPixelsNow, pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { notifyTimelineLiveScroll } from '@/shared/timeline/live-scroll-sync'
  import TimelineSettledContentZoomProvider from '../timeline-settled-content-zoom-provider.svelte'
  import { getTimelineZoomInteractionShieldBounds } from '@/features/timeline/utils/timeline-zoom-interaction-shield'
  import type { TimelineContentProps } from './types'

  /**
   * Timeline Content Component
   *
   * Main timeline rendering area that composes:
   * - TimelineMarkers (time ruler)
   * - TimelineTracks (all tracks with items)
   * - One full-height TimelinePlayhead (flag + line)
   *
   * Dynamically calculates width based on furthest item
   */
  let {
    tracks,
    scroll = $bindable(null),
    allTracksScroll = $bindable(null),
    videoTracksScroll = $bindable(null),
    audioTracksScroll = $bindable(null),
    videoPaneHeight = 0,
    audioPaneHeight = 0,
    onSectionDividerMouseDown,
    onZoomHandlersReady,
  }: TimelineContentProps = $props()

  // Prefetch waveforms for clips approaching the viewport
  useWaveformPrefetch()

  // Use granular selectors - Zustand v5 best practice
  const fpsState = select(useTimelineSettingsStore, (s) => s.fps)
  const fps = $derived(fpsState.current)

  const videoTracks = $derived(tracks.filter((track) => getTrackKind(track) === 'video'))
  const audioTracks = $derived(tracks.filter((track) => getTrackKind(track) === 'audio'))
  const hasTrackSections = $derived(videoTracks.length > 0 && audioTracks.length > 0)
  const firstTrackId = $derived(tracks[0]?.id ?? null)
  const lastTrackId = $derived(tracks[tracks.length - 1]?.id ?? null)
  const topZoneAnchorTrackId = $derived(
    tracks.find((track) => getTrackKind(track) === 'video')?.id ?? firstTrackId,
  )
  const bottomZoneAnchorTrackId = $derived(
    [...tracks].reverse().find((track) => getTrackKind(track) === 'audio')?.id ?? lastTrackId,
  )
  const videoSectionContentHeight = $derived(
    videoTracks.reduce((sum, track) => sum + track.height, 0),
  )
  const audioSectionContentHeight = $derived(
    audioTracks.reduce((sum, track) => sum + track.height, 0),
  )
  const videoZoneHeight = $derived(Math.max(24, videoPaneHeight - videoSectionContentHeight))
  const audioZoneHeight = $derived(Math.max(24, audioPaneHeight - audioSectionContentHeight))

  // PERFORMANCE: Don't subscribe to items directly - it causes ALL tracks to update
  // when ANY item changes. Instead, use derived selectors for specific needs.

  // O(1) pre-computed value from items store instead of O(n) reduce on every change
  const furthestItemEndFrameState = select(useItemsStore, (s) => s.maxItemEndFrame)
  const furthestItemEndFrame = $derived(furthestItemEndFrameState.current)
  const maxTimelineFrame = $derived(Math.floor(Math.max(furthestItemEndFrame / fps, 10) * fps))
  // NOTE: Don't subscribe to currentFrame here - it would update every frame!
  // Track it through a store subscription instead (see currentFrame below)
  const activeTrackIdState = select(useSelectionStore, (s) => s.activeTrackId)
  const isTranscriptionDialogOpenState = select(
    useEditorStore,
    (s) => s.transcriptionDialogDepth > 0,
  )
  // Granular selectors for drag state - avoid subscribing to entire dragState object
  const isDraggingState = select(useSelectionStore, (s) => !!s.dragState?.isDragging)
  const isDragging = $derived(isDraggingState.current)
  let containerEl = $state<HTMLDivElement | null>(null)
  let zoomInteractionShield = $state<HTMLDivElement | null>(null)
  let rulerCoordinateSurface = $state<HTMLDivElement | null>(null)
  let tracksContainer = $state<HTMLDivElement | null>(null)
  let containerWidth = $state(0)
  let marqueeWasActive = false
  let marqueeResetTimeout: ReturnType<typeof setTimeout> | null = null
  let marqueePointerDown = false
  let marqueeStartPreviewFrame: number | null = null
  let marqueeReleasePreview: { frame: number; itemId?: string } | null = null
  let marqueeReleaseRaf: number | null = null
  let dragWasActive = false
  let scrubWasActive = false
  let scrubTimeout: ReturnType<typeof setTimeout> | null = null
  let verticalScrollTarget: HTMLDivElement | null = null

  // Preview frame hover state
  const setPreviewFrame = (frame: number | null, itemId?: string) =>
    usePlaybackStore.getState().setPreviewFrame(frame, itemId)
  let previewRaf: number | null = null
  let previewDelayTimeout: ReturnType<typeof setTimeout> | null = null
  function cancelPendingHoverPreview() {
    if (previewDelayTimeout !== null) {
      clearTimeout(previewDelayTimeout)
      previewDelayTimeout = null
    }
    if (previewRaf !== null) {
      cancelAnimationFrame(previewRaf)
      previewRaf = null
    }
  }
  useTimelineAudioSkimPreview()

  const pixelsToFrame = pixelsToFrameNow

  // Clear previewFrame when playback starts
  $effect(() =>
    usePlaybackStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) {
        state.setPreviewFrame(null)
      }
    }),
  )

  $effect(() => {
    if (isDragging && usePlaybackStore.getState().previewFrame !== null) {
      untrack(() => usePlaybackStore.getState().setPreviewFrame(null))
    }
  })

  $effect(() => {
    if (!isTranscriptionDialogOpenState.current) return
    if (usePlaybackStore.getState().previewFrame !== null) {
      untrack(() => usePlaybackStore.getState().setPreviewFrame(null))
    }
  })

  // Cleanup preview RAF on unmount
  $effect(() => {
    return () => {
      cancelPendingHoverPreview()
    }
  })

  // Access currentFrame via store subscription (no updates) instead of a selector
  let currentFrame = usePlaybackStore.getState().currentFrame
  $effect(() =>
    usePlaybackStore.subscribe((state) => {
      currentFrame = state.currentFrame
    }),
  )

  const frameToPixels = frameToPixelsNow

  // Momentum scrolling state
  let velocityX = 0
  let velocityY = 0
  let velocityZoom = 0
  let momentumId: number | null = null
  // Last momentum-frame timestamp; drives frame-rate-independent decay so flick
  // and smoothed-wheel scrolling feel identical on 60/120/144Hz displays.
  let momentumLastTime = 0
  let lastWheelTime = 0
  let zoomCursorX = 0 // Cursor X position (relative to container) for zoom anchor
  let pendingScroll: number | null = null // Queued scroll to apply after the next update
  let lastZoomApplyTime = 0 // Throttle zoom updates in momentum loop
  let viewportSyncRaf: number | null = null
  let queuedZoomLevel: number | null = null
  let queuedZoomScrollLeft: number | null = null
  let zoomApplyRaf: number | null = null
  // Latest known scrollLeft, kept fresh by the scroll handler. Declared here so
  // scheduleViewportSync can hand it to syncViewportFromContainer instead of
  // reading container.scrollLeft back (a forced reflow after a width write).
  let scrollLeft = 0

  // Cached viewport box dimensions. clientWidth/clientHeight are invariant under
  // scroll and horizontal zoom (only the *content* width changes), so reading
  // them every scroll/zoom frame forces a needless layout flush. A ResizeObserver
  // refreshes this cache; we fall back to a live read until it has measured once.
  let viewportDims: {
    width: number
    height: number
    left: number
    top: number
    fullHeight: number
  } | null = null

  function syncViewportFromContainer(knownScrollLeft?: number, immediate = false) {
    const container = containerEl
    if (!container) return
    const dims = viewportDims
    const viewportWidth = dims?.width ?? container.clientWidth
    const viewportHeight = dims?.height ?? tracksContainer?.clientHeight ?? container.clientHeight
    // When the caller just wrote scrollLeft it passes that value so we can skip
    // the read-back. Reading scrollLeft/scrollTop after a write forces a
    // synchronous reflow — negligible normally, but ~16ms/frame at extreme zoom
    // widths (>1M px). The main scroll container is overflow-y-hidden, so its
    // scrollTop is always 0 in the known-value path.
    const nextScrollLeft = knownScrollLeft ?? container.scrollLeft
    const scrollTop = knownScrollLeft !== undefined ? 0 : container.scrollTop
    const viewport = {
      scrollLeft: nextScrollLeft,
      scrollTop,
      viewportWidth,
      viewportHeight,
    }
    const viewportStore = useTimelineViewportStore.getState()
    if (immediate) {
      viewportStore.setViewportImmediate(viewport)
    } else {
      viewportStore.setViewport(viewport)
    }
  }

  function scheduleViewportSync() {
    if (viewportSyncRaf !== null) return
    viewportSyncRaf = requestAnimationFrame(() => {
      viewportSyncRaf = null
      // Pass the tracked scrollLeft (handleScroll updates it before scheduling)
      // so the sync skips a container.scrollLeft read-back, which would force a
      // synchronous reflow when a zoom width write landed the same frame.
      withPerfMeasure('tl.raf.viewportSync', () => syncViewportFromContainer(scrollLeft))
    })
  }

  // Shares the scroll container with the parent and seeds the viewport on attach.
  function attachContainer(node: HTMLDivElement) {
    containerEl = node
    scroll = node
    untrack(() => {
      const tracksViewportHeight = tracksContainer?.clientHeight ?? node.clientHeight
      useTimelineViewportStore.getState().setViewport({
        scrollLeft: node.scrollLeft,
        scrollTop: node.scrollTop,
        viewportWidth: node.clientWidth,
        viewportHeight: tracksViewportHeight,
      })
    })
    return () => {
      containerEl = null
      scroll = null
    }
  }

  // Measure container width - run after mount and on resize
  $effect(() => {
    const observedContainer = containerEl
    const observedTracks = tracksContainer
    if (!observedContainer) return

    return untrack(() => {
      const updateWidth = () => {
        const container = containerEl
        if (!container) return
        // Refresh the cached box dims (read here, on actual resizes only, instead
        // of every scroll/zoom frame).
        const containerRect = container.getBoundingClientRect()
        viewportDims = {
          width: container.clientWidth,
          height: tracksContainer?.clientHeight ?? container.clientHeight,
          left: containerRect.left,
          top: containerRect.top,
          fullHeight: containerRect.height,
        }
        containerWidth = container.clientWidth
        syncViewportFromContainer()
      }

      // Measure immediately
      updateWidth()

      // Re-measure during idle in case DOM wasn't fully laid out on mount
      const idleId = requestIdleCallback(updateWidth)

      // Measure on resize. A ResizeObserver catches panel/track-height changes that
      // the window 'resize' event misses, and keeps the cached dims fresh.
      window.addEventListener('resize', updateWidth)
      let lastTracksHeight = observedTracks?.clientHeight ?? 0
      const ro = new ResizeObserver((entries) => {
        const shouldMeasure = entries.some((entry) => {
          if (entry.target === observedContainer) return true
          if (entry.target !== observedTracks) return false

          // Live zoom intentionally changes the track surface width. Ignore those
          // width-only notifications; measuring them would put a synchronous
          // layout read back onto every zoom frame. Track-pane height changes still
          // refresh viewport culling.
          const nextHeight = entry.contentRect.height
          if (Math.abs(nextHeight - lastTracksHeight) < 0.5) return false
          lastTracksHeight = nextHeight
          return true
        })
        if (shouldMeasure) updateWidth()
      })
      ro.observe(observedContainer)
      if (observedTracks) ro.observe(observedTracks)

      return () => {
        cancelIdleCallback(idleId)
        if (viewportSyncRaf !== null) {
          cancelAnimationFrame(viewportSyncRaf)
          viewportSyncRaf = null
        }
        window.removeEventListener('resize', updateWidth)
        ro.disconnect()
      }
    })
  })

  // Also remeasure when timeline content changes (might resize)
  $effect(() => {
    void furthestItemEndFrame // Depends on content end, not full items array
    const currentWidth = containerWidth
    const container = containerEl
    untrack(() => {
      if (container) {
        const width = container.clientWidth
        if (width > 0 && width !== currentWidth) {
          containerWidth = width
        }
        syncViewportFromContainer()
      }
    })
  })

  // Persist scroll position after scrolling settles. Viewport culling already
  // uses the dedicated viewport store on RAF; publishing this persistence-only
  // value during the gesture wakes every subscriber to the timeline settings store.
  let scrollUpdateTimeout: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const container = containerEl
    if (!container) return

    const handleScroll = () => {
      scrollLeft = container.scrollLeft
      scheduleViewportSync()

      if (scrollUpdateTimeout !== null) {
        clearTimeout(scrollUpdateTimeout)
      }
      scrollUpdateTimeout = setTimeout(() => {
        scrollUpdateTimeout = null
        setScrollPosition(scrollLeft)
      }, SCROLL_PERSIST_DEBOUNCE_MS)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollUpdateTimeout !== null) {
        clearTimeout(scrollUpdateTimeout)
      }
      if (viewportSyncRaf !== null) {
        cancelAnimationFrame(viewportSyncRaf)
        viewportSyncRaf = null
      }
    }
  })

  // Restore scroll position from store on initial mount
  let initialScrollRestored = false
  $effect(() => {
    const container = containerEl
    if (initialScrollRestored) return
    if (!container) return

    untrack(() => {
      const savedScrollPosition = useTimelineSettingsStore.getState().scrollPosition
      if (savedScrollPosition > 0) {
        container.scrollLeft = savedScrollPosition
        scrollLeft = savedScrollPosition
      }
      syncViewportFromContainer()
      initialScrollRestored = true
    })
  })

  // Scroll the timeline so a specific frame is visible (requested externally)
  const pendingScrollToFrame = select(useTimelineViewportStore, (s) => s.pendingScrollToFrame)
  $effect(() => {
    const frame = pendingScrollToFrame.current
    const container = containerEl
    if (frame === null) return
    if (!container) return
    untrack(() => {
      useTimelineViewportStore.getState().clearScrollToFrame()

      const frameX = frameToPixels(frame)
      const sl = container.scrollLeft
      const vw = container.clientWidth
      // Already visible — nothing to do
      if (frameX >= sl && frameX <= sl + vw) return

      // Center the frame in the viewport
      container.scrollLeft = Math.max(0, frameX - vw / 2)
      syncViewportFromContainer()
    })
  })

  $effect(() => {
    const activeTrackId = activeTrackIdState.current
    if (!activeTrackId) {
      return
    }

    void [videoTracks.length, audioTracks.length, tracks.length]
    const scrollContainers = [videoTracksScroll ?? null, audioTracksScroll ?? null, allTracksScroll ?? null]

    untrack(() => {
      for (const container of scrollContainers) {
        if (revealTrackInScrollContainer(container, activeTrackId)) {
          break
        }
      }
    })
  })

  // Marquee selection - create items array for getBoundingRect lookups.
  // selectItemIds memoizes the id array per items revision so the marquee layer
  // doesn't re-allocate (or update) on unrelated item property updates.
  const itemIds = select(useItemsStore, selectItemIds)

  function handleMarqueeSelectionChange(ids: string[]) {
    const linkedSelectionEnabled = useEditorStore.getState().linkedSelectionEnabled
    useSelectionStore
      .getState()
      .selectItems(
        linkedSelectionEnabled
          ? expandSelectionWithLinkedItems(useItemsStore.getState().items, ids)
          : ids,
      )
  }

  function handleMarqueeActiveChange(active: boolean) {
    announceTimelineMarqueeActive(active)
    if (marqueeResetTimeout !== null) {
      clearTimeout(marqueeResetTimeout)
      marqueeResetTimeout = null
    }

    if (active) {
      useSelectionStore.getState().clearItemSelection()
      marqueeWasActive = true
      const lockedFrame = marqueeStartPreviewFrame
      if (lockedFrame !== null && usePlaybackStore.getState().previewFrame !== lockedFrame) {
        setPreviewFrame(lockedFrame)
      }
      return
    }

    if (!marqueeWasActive) {
      return
    }

    marqueeResetTimeout = setTimeout(() => {
      marqueeWasActive = false
      marqueeResetTimeout = null
    }, 100)
  }

  $effect(() => {
    return () => {
      if (marqueeResetTimeout !== null) {
        clearTimeout(marqueeResetTimeout)
      }
    }
  })

  // Track drag state to prevent deselection after drop
  $effect(() => {
    if (isDragging) {
      dragWasActive = true
    } else if (dragWasActive) {
      // Reset after a short delay when drag ends
      const timeout = setTimeout(() => {
        dragWasActive = false
      }, 100)
      return () => clearTimeout(timeout)
    }
  })

  // Track playhead/ruler scrubbing to prevent deselection after scrub ends
  $effect(() => {
    const handleScrubStart = (e: MouseEvent) => {
      const target = (e.composedPath()[0] ?? e.target) as HTMLElement
      // Check if mousedown is on a playhead handle or timeline ruler
      if (
        target instanceof Element &&
        (target.closest('[data-playhead-handle]') || target.closest('.timeline-ruler'))
      ) {
        scrubWasActive = true
      }
    }

    const handleScrubEnd = () => {
      if (scrubWasActive) {
        // Clear any existing timeout before scheduling a new one
        if (scrubTimeout !== null) {
          clearTimeout(scrubTimeout)
          scrubTimeout = null
        }

        // Reset after a short delay when scrub ends
        scrubTimeout = setTimeout(() => {
          scrubWasActive = false
          scrubTimeout = null
        }, 100)
      }
    }

    document.addEventListener('mousedown', handleScrubStart, true)
    document.addEventListener('mouseup', handleScrubEnd)

    return () => {
      document.removeEventListener('mousedown', handleScrubStart, true)
      document.removeEventListener('mouseup', handleScrubEnd)
      if (scrubTimeout !== null) {
        clearTimeout(scrubTimeout)
        scrubTimeout = null
      }
    }
  })

  // Click empty space to deselect items and markers (but preserve track selection)
  function handleContainerClick(e: MouseEvent) {
    // Don't deselect if marquee selection, drag, or scrubbing just finished
    if (marqueeWasActive || dragWasActive || scrubWasActive) {
      return
    }

    // Don't deselect if clicking inside a context menu
    const target = e.target as HTMLElement
    if (target.closest('[role="menu"]')) {
      return
    }

    // Deselect items and markers if NOT clicking on a timeline item
    const clickedOnItem = target.closest('[data-item-id]')

    if (!clickedOnItem) {
      const selection = useSelectionStore.getState()
      selection.clearItemSelection()
      selection.selectMarker(null) // Also clear marker selection
    }
  }

  // Build snap targets for razor shift-snap (item edges, grid, playhead, markers)
  // Called on-demand during mouse move — reads stores directly to avoid subscriptions
  function buildRazorSnapTargets(): RazorSnapTarget[] {
    const items = useItemsStore.getState().items
    const tracks = useItemsStore.getState().tracks
    const transitions = useTransitionsStore.getState().transitions
    const visibleTrackIds = getVisibleTrackIds(tracks)

    // Item edges + transition midpoints
    const targets: RazorSnapTarget[] = getFilteredItemSnapEdges(items, transitions, visibleTrackIds)

    // Playhead
    targets.push({ frame: Math.round(currentFrame), type: 'playhead' })

    // Markers
    const markers = useMarkersStore.getState().markers
    for (const marker of markers) {
      targets.push({ frame: marker.frame, type: 'marker' })
    }

    return targets
  }

  // Preview scrubber: show ghost playhead on hover
  function handleTimelineMouseDownCapture(e: MouseEvent) {
    if (e.button !== 0) return

    const target = e.target as HTMLElement
    if (
      !target.closest('[data-track-id]') ||
      target.closest('[data-item-id]') ||
      target.closest('[data-timeline-density-bucket]')
    ) {
      return
    }

    // A press on track background is a potential marquee gesture. Freeze the
    // skim target immediately so the few pixels before marquee activation do
    // not briefly seek the preview away from the mouse-down frame.
    marqueePointerDown = true
    if (marqueeReleaseRaf !== null) {
      cancelAnimationFrame(marqueeReleaseRaf)
      marqueeReleaseRaf = null
    }
    const playback = usePlaybackStore.getState()
    marqueeStartPreviewFrame = playback.previewFrame
    marqueeReleasePreview =
      playback.previewFrame === null
        ? null
        : { frame: playback.previewFrame, itemId: playback.previewItemId ?? undefined }
    if (previewRaf !== null) {
      cancelAnimationFrame(previewRaf)
      previewRaf = null
    }
  }

  function finishMarqueePointerGesture(e: MouseEvent) {
    const wasMarqueePointerGesture = marqueePointerDown
    const releasePreview = marqueeReleasePreview
    marqueePointerDown = false
    marqueeStartPreviewFrame = null
    marqueeReleasePreview = null

    if (!wasMarqueePointerGesture) return

    const rect = containerEl?.getBoundingClientRect()
    const pointerIsInsideTimeline =
      rect !== undefined &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom

    if (pointerIsInsideTimeline && releasePreview) {
      // Complete marquee teardown first. Its mouseup path may clear transient
      // preview state later in the same event dispatch.
      marqueeReleaseRaf = requestAnimationFrame(() => {
        marqueeReleaseRaf = null
        setPreviewFrame(releasePreview.frame, releasePreview.itemId)
      })
    } else {
      setPreviewFrame(null)
    }
  }

  function cancelMarqueePointerGesture() {
    const wasMarqueePointerGesture = marqueePointerDown
    marqueePointerDown = false
    marqueeStartPreviewFrame = null
    marqueeReleasePreview = null

    if (!wasMarqueePointerGesture) return
    if (marqueeReleaseRaf !== null) {
      cancelAnimationFrame(marqueeReleaseRaf)
      marqueeReleaseRaf = null
    }
    setPreviewFrame(null)
  }

  $effect(
    () => () => {
      if (marqueeReleaseRaf !== null) {
        cancelAnimationFrame(marqueeReleaseRaf)
      }
    },
  )

  function handleTimelineMouseMove(e: MouseEvent) {
    // A hover-skim request that lands in the same frame as the first zoom
    // wheel update makes the program monitor render a new preview frame while
    // the dense timeline is also changing scale. Keep the last settled
    // preview during zoom; the next real pointer move refreshes it.
    if (useZoomStore.getState().isZoomInteracting) {
      cancelPendingHoverPreview()
      return
    }

    if (useEditorStore.getState().transcriptionDialogDepth > 0) {
      cancelPendingHoverPreview()
      if (usePlaybackStore.getState().previewFrame !== null) {
        setPreviewFrame(null)
      }
      return
    }

    // Skip during playback
    if (usePlaybackStore.getState().isPlaying) {
      cancelPendingHoverPreview()
      if (usePlaybackStore.getState().previewFrame !== null) {
        setPreviewFrame(null)
      }
      return
    }

    const body = document.body
    const gestureCursorActive = ACTIVE_TIMELINE_GESTURE_CURSOR_CLASSES.some((className) =>
      body.classList.contains(className),
    )
    const interactionLockActive = gestureCursorActive || body.style.userSelect === 'none'
    if (interactionLockActive && !marqueePointerDown) {
      cancelPendingHoverPreview()
      if (usePlaybackStore.getState().previewFrame !== null) {
        setPreviewFrame(null)
      }
      return
    }

    // Skip during any drag (playhead drag, item drag, marquee)
    if (!marqueePointerDown && (dragWasActive || scrubWasActive)) {
      cancelPendingHoverPreview()
      return
    }

    const scrollContainer = containerEl
    if (!scrollContainer) return

    // Prefer the ResizeObserver-maintained box cache; a live rect read on every
    // hover move can force a layout flush after gesture transform writes.
    const containerLeft = viewportDims?.left ?? scrollContainer.getBoundingClientRect().left
    const x = e.clientX - containerLeft + scrollContainer.scrollLeft

    // In razor mode with Shift held, snap to nearby targets
    const isRazor = useSelectionStore.getState().activeTool === 'razor'
    const maxFrame = maxTimelineFrame
    let frame: number
    if (isRazor && e.shiftKey) {
      const snapTargets = buildRazorSnapTargets()
      const { splitFrame } = getRazorSplitPosition({
        cursorX: x,
        currentFrame,
        isPlaying: false,
        frameToPixels,
        pixelsToFrame,
        shiftHeld: true,
        snapTargets,
      })
      frame = Math.max(0, Math.min(splitFrame, maxFrame))
    } else {
      frame = Math.max(0, Math.min(Math.round(pixelsToFrame(x)), maxFrame))
    }

    // Detect hovered item
    const target = e.target as HTMLElement
    const itemEl = target.closest('[data-item-id]') as HTMLElement | null
    const itemId = itemEl?.dataset.itemId

    if (marqueePointerDown) {
      marqueeReleasePreview = { frame, itemId }
      return
    }

    // Dense timelines give a wheel gesture one short intent window before
    // starting the comparatively expensive program-monitor skim. This keeps
    // normal hover responsive while allowing Ctrl/Cmd-wheel to cancel the
    // pending preview before it can compete with the first zoom frame.
    cancelPendingHoverPreview()
    const schedulePreviewFrame = () => {
      previewDelayTimeout = null
      previewRaf = requestAnimationFrame(() => {
        previewRaf = null
        withPerfMeasure('tl.raf.previewHover', () => setPreviewFrame(frame, itemId))
      })
    }
    if (
      useItemsStore.getState().items.length >= DENSE_TIMELINE_TRACK_ITEM_THRESHOLD &&
      usePlaybackStore.getState().previewFrame === null
    ) {
      previewDelayTimeout = setTimeout(schedulePreviewFrame, DENSE_TIMELINE_HOVER_PREVIEW_DELAY_MS)
    } else {
      schedulePreviewFrame()
    }
  }

  function handleTimelineMouseLeave() {
    if (marqueePointerDown) return

    cancelPendingHoverPreview()
    setPreviewFrame(null)
  }

  // Calculate the actual timeline duration and width based on content
  // Uses derived furthestItemEndFrame selector instead of full items array
  const timelineGeometry = $derived.by(() => {
    // Convert furthest item end from frames to seconds
    const furthestItemEnd = furthestItemEndFrame / fps

    // Use actual content end, with minimum of 10 seconds for empty timelines
    const contentDuration = Math.max(furthestItemEnd, 10)

    // Keep the visible fit behavior, but leave extra space after the project end
    // so the user can still scroll a bit farther to the right when needed.
    const effectiveContainerWidth = containerWidth > 0 ? containerWidth : 1920
    // Read untracked: settled zoom must not re-derive the whole content tree.
    const settledContentWidth = contentDuration * useZoomStore.getState().contentPixelsPerSecond

    // Timeline width is based on content only - don't depend on scroll position
    // This prevents feedback loops during zoom where scroll->width->scroll causes gradual shifts
    return {
      actualDuration: contentDuration,
      timelineWidth: getTimelineWidth({
        contentWidth: settledContentWidth,
        viewportWidth: effectiveContainerWidth,
      }),
    }
  })
  const actualDuration = $derived(timelineGeometry.actualDuration)
  const timelineWidth = $derived(timelineGeometry.timelineWidth)

  // Apply pending scroll after an update, when the DOM has the updated width.
  // This ensures zoom anchor works correctly even when timeline extends beyond content.
  // FreeCut runs this after every render; these are the inputs that update this view.
  $effect(() => {
    void [
      tracks,
      fps,
      furthestItemEndFrame,
      containerWidth,
      timelineWidth,
      videoPaneHeight,
      audioPaneHeight,
      isDragging,
      itemIds.current,
      activeTrackIdState.current,
      isTranscriptionDialogOpenState.current,
    ]
    const container = containerEl
    untrack(() => {
      if (pendingScroll !== null && container) {
        const next = pendingScroll
        container.scrollLeft = next
        pendingScroll = null
        // Keep scrollLeft fresh so the clamp effect below can decide without a
        // forced scrollLeft read, and pass the known value to skip the read-back.
        scrollLeft = next
        syncViewportFromContainer(next)
      }
    })
  })

  $effect(() => {
    const width = timelineWidth
    const container = containerEl
    if (!container) {
      return
    }

    untrack(() => {
      // Use the cached viewport width and tracked scrollLeft instead of reading
      // container.clientWidth / container.scrollLeft. Both are layout reads that,
      // after this update's width write, force a synchronous reflow every frame —
      // ~16ms at extreme zoom widths. clientWidth is invariant under horizontal
      // zoom, and scrollLeft is kept fresh by the scroll handler and the
      // pending-scroll effect above. Fall back to a live read only before the
      // ResizeObserver has measured (mount).
      const cachedWidth = viewportDims?.width
      const viewportWidthForClamp = cachedWidth ?? container.clientWidth
      const maxScrollLeft = Math.max(0, width - viewportWidthForClamp)
      const currentScrollLeft = cachedWidth !== undefined ? scrollLeft : container.scrollLeft
      if (currentScrollLeft <= maxScrollLeft + 1) {
        return
      }

      // Clamp stale scroll after timeline shrink so ruler and tracks stay aligned
      // without subscribing broad UI surfaces to item-array churn.
      container.scrollLeft = maxScrollLeft
      scrollLeft = maxScrollLeft
      syncViewportFromContainer(maxScrollLeft)
    })
  })

  function scheduleZoomApply(nextZoomLevel: number, nextScrollLeft: number) {
    queuedZoomLevel = nextZoomLevel
    queuedZoomScrollLeft = nextScrollLeft

    if (zoomApplyRaf !== null) {
      return
    }

    zoomApplyRaf = requestAnimationFrame(() => {
      zoomApplyRaf = null
      withPerfMeasure('tl.raf.zoomApply', () => {
        const zoomLevel = queuedZoomLevel
        const queuedScrollLeft = queuedZoomScrollLeft
        queuedZoomLevel = null
        queuedZoomScrollLeft = null

        if (zoomLevel === null || queuedScrollLeft === null) {
          return
        }

        useZoomStore.getState().setZoomLevelImmediate(zoomLevel)
        // Live geometry subscribers update the scrollable width synchronously.
        // Apply the matching anchor offset in the same frame so direction
        // changes cannot paint at the previous scroll position.
        const container = containerEl
        if (container) {
          container.scrollLeft = queuedScrollLeft
          scrollLeft = queuedScrollLeft
          // Edit's lower keyframe timeline derives its axis from this shared
          // viewport plus the live zoom store. Publish the matching scroll
          // immediately in the same RAF as the zoom update; the normal
          // throttled scroll path would briefly combine the new scale with an
          // old offset and put its playhead at a different screen position.
          syncViewportFromContainer(queuedScrollLeft, true)
          notifyTimelineLiveScroll(container)
        }
      })
    })
  }

  function clearQueuedZoomApply() {
    queuedZoomLevel = null
    queuedZoomScrollLeft = null
    if (zoomApplyRaf !== null) {
      cancelAnimationFrame(zoomApplyRaf)
      zoomApplyRaf = null
    }
  }

  function applyZoomWithAnchor(newZoomLevel: number, anchor: TimelineZoomAnchor) {
    const currentZoom = queuedZoomLevel ?? useZoomStore.getState().level
    const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoomLevel))
    if (clampedZoom === currentZoom) return

    const nextScrollLeft = getAnchoredZoomScrollLeft({
      anchor,
      maxDurationSeconds: actualDuration,
      nextZoomLevel: clampedZoom,
    })

    scheduleZoomApply(clampedZoom, nextScrollLeft)
  }

  function applyZoomWithCursorAnchor(newZoomLevel: number) {
    const container = containerEl
    if (!container) return

    const currentZoom = queuedZoomLevel ?? useZoomStore.getState().level
    const baseScrollLeft = queuedZoomScrollLeft ?? pendingScroll ?? container.scrollLeft

    applyZoomWithAnchor(
      newZoomLevel,
      getCursorZoomAnchor({
        currentZoomLevel: currentZoom,
        cursorScreenX: zoomCursorX,
        maxDurationSeconds: actualDuration,
        scrollLeft: baseScrollLeft,
      }),
    )
  }

  function applyZoomWithPlayheadAnchor(newZoomLevel: number) {
    const container = containerEl
    if (!container) return

    const currentZoom = queuedZoomLevel ?? useZoomStore.getState().level
    const baseScrollLeft = queuedZoomScrollLeft ?? pendingScroll ?? container.scrollLeft

    applyZoomWithAnchor(
      newZoomLevel,
      getPlayheadZoomAnchor({
        currentFrame,
        currentZoomLevel: currentZoom,
        fps: useTimelineSettingsStore.getState().fps,
        maxDurationSeconds: actualDuration,
        scrollLeft: baseScrollLeft,
      }),
    )
  }

  function handleZoomChange(newZoom: number) {
    applyZoomWithPlayheadAnchor(newZoom)
  }

  function handleZoomIn() {
    const currentZoomLevel = queuedZoomLevel ?? useZoomStore.getState().level
    const newZoomLevel = Math.min(ZOOM_MAX, currentZoomLevel * FINE_ZOOM_FACTOR)
    applyZoomWithPlayheadAnchor(newZoomLevel)
  }

  function handleZoomOut() {
    const currentZoomLevel = queuedZoomLevel ?? useZoomStore.getState().level
    const newZoomLevel = Math.max(ZOOM_MIN, currentZoomLevel / FINE_ZOOM_FACTOR)
    applyZoomWithPlayheadAnchor(newZoomLevel)
  }

  function handleZoomToFit() {
    const container = containerEl
    if (!container) return
    clearQueuedZoomApply()

    const effectiveContainerWidth = containerWidth > 0 ? containerWidth : container.clientWidth

    // actualDuration is kept in sync with timeline content
    const contentDuration = actualDuration

    const newZoomLevel = getZoomToFitLevel(effectiveContainerWidth, contentDuration)

    // Apply zoom and reset scroll to start. This scroll is applied immediately,
    // so do not leave a pending value behind: TimelineContent intentionally does
    // not update for live wheel zoom and the stale zero would override the
    // real anchored position on the next wheel event.
    pendingScroll = null
    scrollLeft = 0
    useZoomStore.getState().setZoomLevelSynchronized(newZoomLevel)
    container.scrollLeft = 0
    syncViewportFromContainer(0, true)
  }

  function handleZoomTo100(centerFrame: number) {
    const container = containerEl
    if (!container) return
    clearQueuedZoomApply()

    const currentFps = useTimelineSettingsStore.getState().fps

    // At zoom 1, pixelsPerSecond = 100
    const targetPixelX = (centerFrame / currentFps) * 100
    const effectiveWidth = containerWidth > 0 ? containerWidth : container.clientWidth
    const newScrollLeft = Math.max(0, targetPixelX - effectiveWidth / 2)

    // Queue scroll via pendingScroll so it applies AFTER the next update
    pendingScroll = newScrollLeft
    scrollLeft = newScrollLeft

    useZoomStore.getState().setZoomLevelSynchronized(1)
  }

  // Register zoom-to-100 handler globally so keyboard shortcuts can use it
  $effect(() => {
    registerZoomTo100(handleZoomTo100)
    return () => registerZoomTo100(null)
  })

  // Expose zoom handlers to parent component (only once on mount)
  $effect(() => {
    const onReady = onZoomHandlersReady
    if (onReady) {
      untrack(() =>
        onReady({
          handleZoomChange,
          handleZoomIn,
          handleZoomOut,
          handleZoomToFit,
        }),
      )
    }
  })

  // Momentum scroll/zoom loop using requestAnimationFrame
  function startMomentumScroll() {
    // Already running: the wheel handler has updated the velocities in place,
    // so let the active RAF pick them up next frame. Cancelling and restarting on
    // every wheel event during a continuous gesture would reset the frame-time to
    // 0 each frame, corrupting the frame-rate-independent decay below.
    if (momentumId !== null) {
      return
    }
    // Starting from idle: reset frame-time so the first momentum frame is a clean
    // 1-frame step rather than measuring the gap since the last gesture.
    momentumLastTime = 0

    const momentumLoop = () => {
      const container = containerEl
      if (!container) return

      withPerfMeasure('tl.raf.momentum', () => momentumLoopBody(container))
    }

    const momentumLoopBody = (container: HTMLDivElement) => {
      let hasScrollMomentum = false
      let hasZoomMomentum = false

      // Frame-rate-independent decay: normalise to a 60Hz reference frame so the
      // hand-tuned feel is preserved at 60Hz (frames ≈ 1) but no longer dies
      // twice as fast on 120/144Hz displays. Clamp to avoid a jump on the first
      // frame or after a tab stall.
      const now = performance.now()
      const last = momentumLastTime
      momentumLastTime = now
      const frames =
        last === 0 ? 1 : Math.min(4, Math.max(0, (now - last) / MOMENTUM_REF_FRAME_MS))
      const scrollDecay = Math.pow(SCROLL_FRICTION, frames)

      // Apply velocity to scroll position
      if (Math.abs(velocityX) > SCROLL_MIN_VELOCITY) {
        container.scrollLeft += velocityX * frames
        // Linked panels live outside this native scroller. Notify them inside
        // the same RAF so their ruler/playhead update before this frame paints.
        notifyTimelineLiveScroll(container)
        velocityX *= scrollDecay
        hasScrollMomentum = true
      } else {
        velocityX = 0
      }

      const scrollTarget = verticalScrollTarget
      if (scrollTarget && Math.abs(velocityY) > SCROLL_MIN_VELOCITY) {
        scrollTarget.scrollTop += velocityY * frames
        velocityY *= scrollDecay
        hasScrollMomentum = true
      } else {
        velocityY = 0
      }

      // Apply velocity to zoom using logarithmic scale for symmetric feel
      // This makes zoom in and zoom out feel equally fast
      if (Math.abs(velocityZoom) > ZOOM_MIN_VELOCITY) {
        const timeSinceLastApply = now - lastZoomApplyTime

        // Calculate new velocity after decay
        const newVelocity = velocityZoom * ZOOM_FRICTION
        const isFinalUpdate = Math.abs(newVelocity) <= ZOOM_MIN_VELOCITY

        // Apply zoom to store at throttled rate, or always on final update
        if (timeSinceLastApply >= ZOOM_UPDATE_INTERVAL || isFinalUpdate) {
          const currentZoom = useZoomStore.getState().level
          // Work in log space: add velocity to log(zoom), then exponentiate
          const logZoom = Math.log(currentZoom)
          const newLogZoom = logZoom - velocityZoom * 1.2 // Scale factor for feel
          const newZoomLevel = Math.exp(newLogZoom)
          applyZoomWithCursorAnchor(newZoomLevel)
          lastZoomApplyTime = now
        }

        velocityZoom = newVelocity
        hasZoomMomentum = !isFinalUpdate
      } else {
        velocityZoom = 0
      }

      // Continue loop if still moving
      if (hasScrollMomentum || hasZoomMomentum) {
        momentumId = requestAnimationFrame(momentumLoop)
      } else {
        momentumId = null
      }
    }

    momentumId = requestAnimationFrame(momentumLoop)
  }

  function showZoomInteractionShield() {
    const shield = zoomInteractionShield
    const container = containerEl
    if (!shield || !container) return

    const cached = viewportDims
    const rect = cached ? null : container.getBoundingClientRect()
    const shieldBounds = getTimelineZoomInteractionShieldBounds({
      left: cached?.left ?? rect?.left ?? 0,
      top: cached?.top ?? rect?.top ?? 0,
      width: cached?.width ?? rect?.width ?? container.clientWidth,
      height: cached?.fullHeight ?? rect?.height ?? container.clientHeight,
    })
    shield.style.left = `${shieldBounds.left}px`
    // Keep the ruler interactive while content geometry settles. A ruler press
    // owns transport immediately and must never land on this track-only shield.
    shield.style.top = `${shieldBounds.top}px`
    shield.style.width = `${shieldBounds.width}px`
    shield.style.height = `${shieldBounds.height}px`
    shield.style.display = 'block'
  }

  $effect(() => {
    const hideShieldIfSettled = (isZoomInteracting: boolean) => {
      if (isZoomInteracting) return
      const shield = zoomInteractionShield
      if (shield) shield.style.display = 'none'
    }

    // HMR or a remount can preserve an imperative `display: block` write after
    // the zoom store has already settled. Reconcile the DOM immediately.
    untrack(() => hideShieldIfSettled(useZoomStore.getState().isZoomInteracting))
    return useZoomStore.subscribe((state, previousState) => {
      if (!state.isZoomInteracting && previousState.isZoomInteracting) {
        hideShieldIfSettled(state.isZoomInteracting)
      }
    })
  })

  // Cleanup momentum on unmount
  $effect(() => {
    return () => {
      if (momentumId !== null) {
        cancelAnimationFrame(momentumId)
      }
      if (zoomApplyRaf !== null) {
        cancelAnimationFrame(zoomApplyRaf)
      }
    }
  })

  // Attach non-passive wheel event listener to allow preventDefault
  $effect(() => {
    const container = containerEl
    if (!container) return

    const wheelHandler = (event: WheelEvent) => {
      // Prevent native scroll/zoom behavior for all cases we handle
      event.preventDefault()

      const now = performance.now()
      const timeDelta = now - lastWheelTime
      lastWheelTime = now

      // If a new gesture starts (after pause), reset all velocities
      if (timeDelta > SCROLL_GESTURE_TIMEOUT) {
        velocityX = 0
        velocityY = 0
        velocityZoom = 0
      }

      // Ctrl/Cmd + scroll = discrete zoom in 10% increments (anchored to cursor position)
      if (event.ctrlKey || event.metaKey) {
        velocityX = 0
        velocityY = 0
        velocityZoom = 0
        showZoomInteractionShield()
        // The pointer move that positions a cursor for zoom may have queued a
        // hover preview for this same RAF. Cancel it before scheduling zoom so
        // preview rendering cannot compete with the first scale frame.
        cancelPendingHoverPreview()

        // Capture cursor position for anchor zoom
        const containerLeft = viewportDims?.left ?? container.getBoundingClientRect().left
        zoomCursorX = event.clientX - containerLeft

        const currentZoom = queuedZoomLevel ?? useZoomStore.getState().level
        applyZoomWithCursorAnchor(computeWheelZoomStep(currentZoom, event.deltaY))
        return
      }

      // Alt + scroll = resize track heights in the hovered zone
      if (event.altKey) {
        const sectionEl =
          event.target instanceof Element
            ? (event.target.closest('[data-track-section-scroll]') as HTMLElement | null)
            : null
        const zone = sectionEl?.dataset.trackSectionScroll as 'video' | 'audio' | undefined
        if (zone) {
          const delta = event.deltaY > 0 ? -4 : 4
          const currentTracks = useItemsStore.getState().tracks
          const nextTracks = resizeTracksOfKindByDelta(currentTracks, zone, delta)
          if (nextTracks !== currentTracks) {
            useItemsStore.getState().setTracks(nextTracks)
            useTimelineSettingsStore.getState().markDirty()
          }
        }
        return
      }

      // Reset zoom velocity for scroll operations
      velocityZoom = 0
      const smoothingFactor = 1 - SCROLL_SMOOTHING

      // Shift + scroll = vertical scroll ONLY
      if (event.shiftKey) {
        verticalScrollTarget = getVerticalScrollTarget(event.target)
        velocityX = 0
        const delta = (event.deltaX || event.deltaY) * SCROLL_SENSITIVITY
        velocityY = velocityY * smoothingFactor + delta * SCROLL_SMOOTHING
      } else {
        verticalScrollTarget = null
        // Default scroll = horizontal scroll ONLY
        velocityY = 0
        const delta = (event.deltaY || event.deltaX) * SCROLL_SENSITIVITY
        velocityX = velocityX * smoothingFactor + delta * SCROLL_SMOOTHING
      }

      startMomentumScroll()
    }

    // Add with { passive: false } to allow preventDefault
    container.addEventListener('wheel', wheelHandler, { passive: false })

    return () => {
      container.removeEventListener('wheel', wheelHandler)
    }
  })

  const singleSectionTracks = $derived(videoTracks.length > 0 ? videoTracks : audioTracks)
  const singleSectionKind = $derived(videoTracks.length > 0 ? 'video' : 'audio')
  const singleSectionHeight = $derived(videoTracks.length > 0 ? videoPaneHeight : audioPaneHeight)
  const singleSectionZoneHeight = $derived(
    videoTracks.length > 0 ? videoZoneHeight : audioZoneHeight,
  )
  const singleSectionAnchorTrackId = $derived(
    videoTracks.length > 0 ? topZoneAnchorTrackId : bottomZoneAnchorTrackId,
  )
  const videoSectionHasOverflow = useTrackSectionHasOverflow(
    () => videoTracksScroll,
    () => hasTrackSections,
    () => videoPaneHeight,
    () => videoTracks.length,
    () => videoSectionContentHeight,
  )
  const audioSectionHasOverflow = useTrackSectionHasOverflow(
    () => audioTracksScroll,
    () => hasTrackSections,
    () => audioPaneHeight,
    () => audioTracks.length,
    () => audioSectionContentHeight,
  )
  const singleSectionHasOverflow = useTrackSectionHasOverflow(
    () => allTracksScroll,
    () => hasTrackSections,
    () => singleSectionHeight,
    () => singleSectionTracks.length,
    () => videoSectionContentHeight,
    () => audioSectionContentHeight,
  )
  const anyOverflow = $derived(
    hasTrackSections
      ? videoSectionHasOverflow.current || audioSectionHasOverflow.current
      : singleSectionHasOverflow.current,
  )
</script>

<div
  class="flex flex-1 min-h-0 min-w-0 bg-background/30"
  style:--timeline-video-pane-height="{videoPaneHeight}px"
  style:--timeline-audio-pane-height="{audioPaneHeight}px"
  style:--timeline-video-zone-height="{videoZoneHeight}px"
  style:--timeline-audio-zone-height="{audioZoneHeight}px"
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    {@attach attachContainer}
    data-timeline-scroll-container
    class="timeline-container isolate relative flex flex-1 flex-col overflow-x-auto overflow-y-hidden"
    style:scroll-behavior="auto"
    style:will-change="scroll-position"
    onmousedowncapture={handleTimelineMouseDownCapture}
    onclick={handleContainerClick}
    onmousemove={handleTimelineMouseMove}
    onmouseleave={handleTimelineMouseLeave}
  >
    <div
      bind:this={zoomInteractionShield}
      data-timeline-zoom-interaction-shield
      data-marquee-ignore
      aria-hidden="true"
      class="fixed z-50"
      style="display: none"
    ></div>

    <TimelineMarqueeLayer
      container={containerEl}
      itemIds={itemIds.current}
      {fps}
      duration={actualDuration}
      onSelectionChange={handleMarqueeSelectionChange}
      onMarqueeActiveChange={handleMarqueeActiveChange}
      onMarqueeGestureEnd={finishMarqueePointerGesture}
      onMarqueeGestureCancel={cancelMarqueePointerGesture}
    />

    {#if itemIds.current.length === 0}
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 top-[64px] z-20 flex items-center justify-center px-6"
      >
        <div
          class="rounded-xl border border-dashed border-border/80 bg-background/85 px-5 py-4 text-center shadow-lg backdrop-blur-sm"
        >
          <p class="text-sm font-semibold text-foreground">{t('timeline.emptyTitle')}</p>
          <p class="mt-1 text-xs text-muted-foreground">{t('timeline.emptyDescription')}</p>
        </div>
      </div>
    {/if}

    <TimelineRulerSurface
      duration={actualDuration}
      {containerWidth}
      initialWidth={timelineWidth}
      bind:coordinateSurface={rulerCoordinateSurface}
    />

    <TimelineSettledContentZoomProvider>
      <TimelineTrackSectionsSurface
        bind:tracksContainer
        {fps}
        {actualDuration}
        {containerWidth}
        initialTimelineWidth={timelineWidth}
        {hasTrackSections}
        {videoTracks}
        {audioTracks}
        {singleSectionTracks}
        {singleSectionKind}
        {videoPaneHeight}
        {audioPaneHeight}
        {singleSectionHeight}
        {videoZoneHeight}
        {audioZoneHeight}
        {singleSectionZoneHeight}
        {topZoneAnchorTrackId}
        {bottomZoneAnchorTrackId}
        {singleSectionAnchorTrackId}
        {onSectionDividerMouseDown}
        bind:allTracksScroll
        bind:videoTracksScroll
        bind:audioTracksScroll
      >
        {#if isDragging}<TimelineGuidelines />{/if}
        <TimelineRecordingOverlay />
      </TimelineTrackSectionsSurface>
    </TimelineSettledContentZoomProvider>

    <!-- One overlay owns each complete marker across the ruler and tracks. -->
    <TimelinePreviewScrubber inRuler maxFrame={maxTimelineFrame} zIndex={40} />
    <TimelinePlayhead
      inRuler
      maxFrame={maxTimelineFrame}
      topOffsetPx={IO_LANE_HEIGHT}
      coordinateSurface={rulerCoordinateSurface}
    />
  </div>

  {#if anyOverflow}
    <div class="flex shrink-0 flex-col w-3 bg-background/80">
      <!-- Ruler spacer -->
      <div class="shrink-0" style:height="{TIMELINE_RULER_HEIGHT}px"></div>
      {#if hasTrackSections}
        <TrackSectionScrollbarOverlay
          section="video"
          height={videoPaneHeight}
          scroll={videoTracksScroll}
        />
        <div class="shrink-0" style:height="{TRACK_SECTION_DIVIDER_HEIGHT}px"></div>
        <TrackSectionScrollbarOverlay
          section="audio"
          height={audioPaneHeight}
          scroll={audioTracksScroll}
        />
      {:else}
        <TrackSectionScrollbarOverlay
          section="single"
          height={singleSectionHeight}
          scroll={allTracksScroll}
        />
      {/if}
    </div>
  {/if}
</div>
