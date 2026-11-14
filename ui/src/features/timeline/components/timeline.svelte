<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import Rows2 from 'lucide-svelte/icons/rows-2'
  import Rows3 from 'lucide-svelte/icons/rows-3'
  import Rows4 from 'lucide-svelte/icons/rows-4'
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('Timeline')

  /**
   * Track height presets exposed through the track-size flyout. Their heights
   * live in `TRACK_SIZE_PRESET_HEIGHTS`; picking one is a local view preference,
   * not a project edit.
   */
  const TRACK_SIZE_OPTIONS = [
    { id: 'compact', icon: Rows4, labelKey: 'timeline.trackSize.compact' },
    { id: 'medium', icon: Rows3, labelKey: 'timeline.trackSize.medium' },
    { id: 'large', icon: Rows2, labelKey: 'timeline.trackSize.large' },
  ] as const
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import Check from 'lucide-svelte/icons/check'
  import Minus from 'lucide-svelte/icons/minus'
  import Plus from 'lucide-svelte/icons/plus'
  import Video from 'lucide-svelte/icons/video'
  import AudioLines from 'lucide-svelte/icons/audio-lines'
  import { t } from '$lib/i18n.svelte'
  import { portalTarget } from '$lib/context'
  import { select } from '$lib/store.svelte'
  import TimelineHeader from './timeline-header.svelte'
  import { TimelineContent, type TimelineZoomHandlers } from './timeline-content'
  import TimelineNavigator from './timeline-navigator.svelte'
  import TrackHeader from './track-header.svelte'
  import TransitionDragTooltip from './transition-drag-tooltip.svelte'
  import { FirstTrackRowFrame, TrackRowFrame, TrackSectionDivider } from './track-row-frame'
  import { useTimelineTracks } from '../hooks/use-timeline-tracks.svelte'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useEditorStore } from '@/shared/state/editor'
  import { closeAllGapsOnTrack, setTracks } from '@/features/timeline/stores/timeline-actions'
  import { useSettingsStore } from '@/features/timeline/deps/settings'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
  } from '@/components/ui/dropdown-menu'
  import CompositionBreadcrumbs from './composition-breadcrumbs.svelte'
  import SequenceTabs from './sequence-tabs.svelte'
  import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store'
  import {
    trackDropIndexRef,
    trackDragOffsetRef,
    trackDragJustDroppedRef,
  } from '../hooks/use-track-drag.svelte'
  import {
    createClassicTrack,
    getAdjacentTrackOrder,
    getTrackKind,
  } from '@/features/timeline/utils/classic-tracks'
  import { getEmptyTrackIdsForRemoval } from '@/features/timeline/utils/track-removal'
  import { EDITOR_LAYOUT_CSS_VALUES, getEditorLayout } from '@/config/editor-layout'
  import { useTrackHeightResize } from '../hooks/use-track-height-resize.svelte'
  import { resizeTracksOfKindByDelta } from '@/features/timeline/utils/track-resize'
  import {
    applyTrackSizePreset,
    commitTrackHeights,
  } from '@/features/timeline/stores/actions/track-height-actions'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { computeWheelZoomStep } from '@/features/timeline/constants'
  import {
    clampSectionDividerPosition,
    getBottomAnchoredSectionScrollTop,
    getTrackSectionLayout,
  } from '@/features/timeline/utils/track-resize'
  import { clearMediaDragData } from '@/features/timeline/deps/media-library-resolver'
  import { useNewTrackZonePreviewStore } from '@/features/timeline/stores/new-track-zone-preview-store'
  import { useTrackDropPreviewStore } from '@/features/timeline/stores/track-drop-preview-store'
  import { clearAllTimelineDropPreviewOwners } from '@/features/timeline/utils/drop-preview-owner'
  import {
    isDragEventOverTimelineDropTarget,
    isExternalTimelineDragEvent,
  } from '@/features/timeline/utils/timeline-external-drag'
  import { getDefaultActiveTrackId } from '@/features/timeline/utils/default-active-track'
  import KeyframeGraphPanel from './keyframe-graph-panel.svelte'
  import { createRafCoalescedCallback } from '@/features/timeline/utils/raf-coalesced-callback'
  import { registerGlobalCursorRoots, setGlobalCursorStyle } from '@/shared/ui/global-cursor-roots'
  import type { TimelineTrack } from '@/types/timeline'

  interface TimelineProps {
    duration: number // Total timeline duration in seconds
  }

  /**
   * Complete Timeline Component
   *
   * Combines:
   * - TimelineHeader (controls, zoom, snap)
   * - Track Headers Sidebar (track labels and controls)
   * - TimelineContent (markers, playhead, tracks, items)
   *
   * Follows modular architecture with granular Zustand selectors
   */
  let { duration }: TimelineProps = $props()

  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  const timelineTracks = useTimelineTracks()
  const tracks = $derived(timelineTracks.tracks)
  // Selection state - use granular selectors
  const activeTrackIdState = select(useSelectionStore, (s) => s.activeTrackId)
  const selectedTrackIdsState = select(useSelectionStore, (s) => s.selectedTrackIds)
  const activeTrackId = $derived(activeTrackIdState.current)
  const selectedTrackIds = $derived(selectedTrackIdsState.current)
  const selectedTrackIdsSet = $derived(new Set(selectedTrackIds))

  const visibleTracks = $derived(tracks)
  const canDeleteEmptyTracksState = $derived(
    select(useItemsStore, (s) => {
      let emptyTrackCount = 0

      for (const track of tracks) {
        if ((s.itemsByTrackId[track.id]?.length ?? 0) === 0) {
          emptyTrackCount += 1
        }
      }

      if (emptyTrackCount === 0) return false
      if (emptyTrackCount < tracks.length) return true
      return tracks.length > 1
    }),
  )
  const canDeleteEmptyTracks = $derived(canDeleteEmptyTracksState.current)
  const videoTracks = $derived(visibleTracks.filter((track) => getTrackKind(track) === 'video'))
  const audioTracks = $derived(visibleTracks.filter((track) => getTrackKind(track) === 'audio'))
  const keyframePanelOpen = select(useSelectionStore, (s) => s.editKeyframePanelOpen)
  const hasTrackSections = $derived(videoTracks.length > 0 && audioTracks.length > 0)

  // Elements for syncing scroll between track headers and timeline content
  let rootEl = $state<HTMLDivElement | null>(null)
  let trackHeadersViewport = $state<HTMLDivElement | null>(null)
  let trackHeadersRoot = $state<HTMLDivElement | null>(null)
  let timelineContent = $state<HTMLDivElement | null>(null)
  let allTrackHeadersScroll = $state<HTMLDivElement | null>(null)
  let videoTrackHeadersScroll = $state<HTMLDivElement | null>(null)
  let audioTrackHeadersScroll = $state<HTMLDivElement | null>(null)
  let allTrackContentScroll = $state<HTMLDivElement | null>(null)
  let videoTrackContentScroll = $state<HTMLDivElement | null>(null)
  let audioTrackContentScroll = $state<HTMLDivElement | null>(null)
  let sectionDividerDrag: { startY: number; startDividerPosition: number } | null = null

  const attachAllTrackHeadersScroll = (node: HTMLDivElement) => {
    allTrackHeadersScroll = node
    return () => {
      allTrackHeadersScroll = null
    }
  }
  const attachVideoTrackHeadersScroll = (node: HTMLDivElement) => {
    videoTrackHeadersScroll = node
    return () => {
      videoTrackHeadersScroll = null
    }
  }
  const attachAudioTrackHeadersScroll = (node: HTMLDivElement) => {
    audioTrackHeadersScroll = node
    return () => {
      audioTrackHeadersScroll = null
    }
  }

  // Zoom handlers from TimelineContent
  let zoomHandlers = $state.raw<TimelineZoomHandlers | null>(null)
  let trackRowsViewportHeight = $state(0)
  // A/V divider position is a viewport layout preference, persisted globally in
  // localStorage (null = centered default). Seed the live value once from the
  // saved preference; the drag handler commits the final value back on mouseup.
  let sectionDividerPosition = $state<number | null>(
    useSettingsStore.getState().timelineSectionDividerPosition,
  )

  const trackSizePreset = select(useEditorStore, (s) => s.trackSizePreset)
  const setTimelineTracks = setTracks

  // Drag cursors set on document.body must also reach an editor in a shadow root.
  const portal = portalTarget()
  $effect(() => {
    const root = rootEl
    if (!root) return
    return registerGlobalCursorRoots(
      root.closest<HTMLElement>('.ec-root'),
      portal === document.body ? null : portal,
    )
  })

  // `document.elementsFromPoint` stops at a shadow host, so an editor in a
  // shadow root also asks its own root which drop targets are under the pointer.
  function isDragEventOverTimelineDropTargetInEditor(event: DragEvent): boolean {
    if (isDragEventOverTimelineDropTarget(event)) return true
    const root = rootEl?.getRootNode()
    if (!(root instanceof ShadowRoot)) return false
    if (event.clientX === 0 && event.clientY === 0) {
      const target = event.composedPath()[0]
      return target instanceof Element && !!target.closest('[data-timeline-drop-target="true"]')
    }
    return root
      .elementsFromPoint(event.clientX, event.clientY)
      .some((element) => !!element.closest('[data-timeline-drop-target="true"]'))
  }

  $effect(() => {
    const clearExternalDropPreviews = () => {
      clearAllTimelineDropPreviewOwners()
      useTrackDropPreviewStore.getState().clearGhostPreviews()
      useNewTrackZonePreviewStore.getState().clearGhostPreviews()
    }

    const handleDragEnd = () => {
      clearExternalDropPreviews()
      clearMediaDragData()
    }
    const handleDragOver = (event: DragEvent) => {
      if (!isExternalTimelineDragEvent(event) || isDragEventOverTimelineDropTargetInEditor(event)) {
        return
      }

      clearExternalDropPreviews()
    }
    const handleDrop = () => {
      window.setTimeout(() => {
        clearExternalDropPreviews()
        clearMediaDragData()
      }, 0)
    }
    const handleBlur = () => {
      clearExternalDropPreviews()
      clearMediaDragData()
    }

    document.addEventListener('dragenter', handleDragOver, true)
    document.addEventListener('dragover', handleDragOver, true)
    window.addEventListener('dragend', handleDragEnd, true)
    document.addEventListener('drop', handleDrop, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('dragenter', handleDragOver, true)
      document.removeEventListener('dragover', handleDragOver, true)
      window.removeEventListener('dragend', handleDragEnd, true)
      document.removeEventListener('drop', handleDrop, true)
      window.removeEventListener('blur', handleBlur)
    }
  })

  // State for drop indicator (updated via RAF from drag hook)
  let dropIndicatorIndex = $state(-1)

  // Granular selector: only update when track dragging state actually changes
  const isTrackDraggingState = select(
    useSelectionStore,
    (s) =>
      (s.dragState?.isDragging &&
        s.dragState.draggedTrackIds &&
        s.dragState.draggedTrackIds.length > 0) ??
      false,
  )
  const isTrackDragging = $derived(isTrackDraggingState.current)

  const trackSectionLayout = $derived(
    getTrackSectionLayout({
      viewportHeight: trackRowsViewportHeight,
      tracks: visibleTracks,
      sectionDividerPosition,
      trackTitleBarHeight: editorLayout.timelineClipLabelRowHeight,
    }),
  )
  const clampedSectionDividerPosition = $derived(trackSectionLayout.clampedSectionDividerPosition)
  const videoPaneHeight = $derived(trackSectionLayout.videoPaneHeight)
  const audioPaneHeight = $derived(trackSectionLayout.audioPaneHeight)
  const trackHeightResize = useTrackHeightResize()
  const videoDisplayHeight = $derived(videoTracks.reduce((sum, track) => sum + track.height, 0))
  const audioDisplayHeight = $derived(audioTracks.reduce((sum, track) => sum + track.height, 0))
  const videoZoneHeight = $derived(Math.max(24, videoPaneHeight - videoDisplayHeight))
  const audioZoneHeight = $derived(Math.max(24, audioPaneHeight - audioDisplayHeight))
  function getTrackStackOffset(sectionTracks: TimelineTrack[], dropIndex: number, leadingOffset = 0) {
    return (
      leadingOffset +
      sectionTracks
        .slice(0, Math.max(0, Math.min(dropIndex, sectionTracks.length)))
        .reduce((sum, track) => sum + track.height, 0)
    )
  }

  $effect(() => {
    const element = trackHeadersViewport
    if (!element) return

    const updateHeight = () => {
      trackRowsViewportHeight = element.clientHeight
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  })

  // Wheel handling in track headers:
  //   Alt+scroll  = resize track heights in the hovered zone
  //   Shift+scroll = vertical scroll of the hovered zone
  //   Ctrl/Cmd+scroll = zoom timeline in/out
  $effect(() => {
    const el = trackHeadersViewport
    if (!el) return

    const handler = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const z = zoomHandlers
        if (!z) return
        z.handleZoomChange(computeWheelZoomStep(useZoomStore.getState().level, event.deltaY))
        return
      }

      const sectionEl =
        event.target instanceof Element
          ? (event.target.closest('[data-track-section-scroll]') as HTMLElement | null)
          : null
      const zone = sectionEl?.dataset.trackSectionScroll as 'video' | 'audio' | undefined

      if (event.altKey) {
        event.preventDefault()
        if (!zone) return
        const delta = event.deltaY > 0 ? -4 : 4
        const currentTracks = useItemsStore.getState().tracks
        const nextTracks = resizeTracksOfKindByDelta(currentTracks, zone, delta)
        if (nextTracks !== currentTracks) {
          commitTrackHeights(nextTracks)
        }
        return
      }

      if (event.shiftKey) {
        event.preventDefault()
        const contentScroll = hasTrackSections
          ? zone === 'audio'
            ? audioTrackContentScroll
            : videoTrackContentScroll
          : allTrackContentScroll
        if (!contentScroll) return
        contentScroll.scrollTop += event.deltaY || event.deltaX
      }
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  })

  function handleSectionDividerMouseDown(event: MouseEvent) {
    if (!hasTrackSections) return

    event.preventDefault()
    event.stopPropagation()
    sectionDividerDrag = {
      startY: event.clientY,
      startDividerPosition: clampedSectionDividerPosition,
    }
    setGlobalCursorStyle('userSelect', 'none')
    setGlobalCursorStyle('cursor', 'row-resize')

    // Gesture-scoped snapshot of the layout inputs, as FreeCut's callback closes over them.
    const viewportHeight = trackRowsViewportHeight
    const dragTracks = visibleTracks
    const trackTitleBarHeight = editorLayout.timelineClipLabelRowHeight
    const dragVideoDisplayHeight = videoDisplayHeight
    const dragAudioDisplayHeight = audioDisplayHeight

    let latestPosition = clampedSectionDividerPosition
    const dividerPreview = createRafCoalescedCallback((position: number) => {
      const previewLayout = getTrackSectionLayout({
        viewportHeight,
        tracks: dragTracks,
        sectionDividerPosition: position,
        trackTitleBarHeight,
      })
      const videoZoneHeight = Math.max(24, previewLayout.videoPaneHeight - dragVideoDisplayHeight)
      const audioZoneHeight = Math.max(24, previewLayout.audioPaneHeight - dragAudioDisplayHeight)
      const roots = [trackHeadersRoot, timelineContent?.parentElement ?? null]
      for (const root of roots) {
        if (!root) continue
        root.style.setProperty('--timeline-video-pane-height', `${previewLayout.videoPaneHeight}px`)
        root.style.setProperty('--timeline-audio-pane-height', `${previewLayout.audioPaneHeight}px`)
        root.style.setProperty('--timeline-video-zone-height', `${videoZoneHeight}px`)
        root.style.setProperty('--timeline-audio-zone-height', `${audioZoneHeight}px`)
      }

      // Video tracks grow upward from the divider. Keep both synchronized
      // scroll surfaces bottom-anchored during the RAF preview so the rows
      // move with MMB instead of snapping into place on mouse release.
      const videoScrollTop = getBottomAnchoredSectionScrollTop(
        previewLayout.videoPaneHeight,
        dragVideoDisplayHeight,
        videoZoneHeight,
      )
      if (videoTrackContentScroll) {
        videoTrackContentScroll.scrollTop = videoScrollTop
      }
      if (videoTrackHeadersScroll) {
        videoTrackHeadersScroll.scrollTop = videoScrollTop
      }
    })
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dragState = sectionDividerDrag
      if (!dragState) return

      const deltaY = moveEvent.clientY - dragState.startY
      latestPosition = clampSectionDividerPosition({
        viewportHeight,
        tracks: dragTracks,
        requestedDividerPosition: dragState.startDividerPosition + deltaY,
        trackTitleBarHeight,
      })
      // Preview outside the component tree so the full timeline is not updated
      // for every mouse sample. Both panes inherit these values from one root.
      dividerPreview.queue(latestPosition)
    }

    const handleMouseUp = () => {
      // Apply the last pointer sample before the committed update catches up.
      dividerPreview.flush()
      sectionDividerDrag = null
      setGlobalCursorStyle('userSelect', '')
      setGlobalCursorStyle('cursor', '')
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      sectionDividerPosition = latestPosition
      // Persist to localStorage so the split survives a refresh (one write
      // per gesture, on release — not on every mousemove frame).
      useSettingsStore.getState().setSetting('timelineSectionDividerPosition', latestPosition)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleTimelineAreaMouseDown(event: MouseEvent) {
    if (event.button !== 1) return
    if (!hasTrackSections) return
    // Intentional: middle-click anywhere in the timeline area drags the A/V
    // section divider — headers, ruler, clip rows, everywhere. coderabbitai
    // flagged this as "hijacking clips/gizmos" in PR #202 review and we
    // narrowed it to divider-only; that was wrong — MMB is reserved for this
    // gesture across the whole timeline. Do not re-narrow.
    handleSectionDividerMouseDown(event)
  }

  // Set the default edit target on mount.
  const tracksLength = $derived(tracks.length)
  const defaultActiveTrackId = $derived(getDefaultActiveTrackId(tracks))
  $effect(() => {
    if (tracksLength > 0 && !activeTrackId && defaultActiveTrackId) {
      const trackId = defaultActiveTrackId
      untrack(() => useSelectionStore.getState().setActiveTrack(trackId))
    }
  })

  $effect(() => {
    const syncPairs = [
      { source: allTrackContentScroll, target: allTrackHeadersScroll },
      { source: videoTrackContentScroll, target: videoTrackHeadersScroll },
      { source: audioTrackContentScroll, target: audioTrackHeadersScroll },
    ].filter((pair): pair is { source: HTMLDivElement; target: HTMLDivElement } => {
      return pair.source !== null && pair.target !== null
    })
    void [audioTracks.length, hasTrackSections, tracksLength, videoTracks.length]

    return untrack(() => {
      const cleanups = syncPairs.map(({ source, target }) => {
        const handleScroll = () => {
          if (target.scrollTop !== source.scrollTop) {
            target.scrollTop = source.scrollTop
          }
        }

        handleScroll()
        source.addEventListener('scroll', handleScroll, { passive: true })
        return () => source.removeEventListener('scroll', handleScroll)
      })

      return () => {
        for (const cleanup of cleanups) {
          cleanup()
        }
      }
    })
  })

  $effect(() => {
    const content = hasTrackSections
      ? videoTrackContentScroll
      : videoTracks.length > 0
        ? allTrackContentScroll
        : null
    const header = hasTrackSections
      ? videoTrackHeadersScroll
      : videoTracks.length > 0
        ? allTrackHeadersScroll
        : null
    void [videoPaneHeight, videoDisplayHeight]

    const anchorToDivider = (element: HTMLDivElement | null) => {
      if (!element) {
        return
      }

      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    }

    untrack(() => {
      anchorToDivider(content)
      anchorToDivider(header)
    })
  })

  // Update drop indicator from shared ref (only during drag)
  // Only runs RAF loop when track dragging is active to avoid unnecessary updates
  $effect(() => {
    if (!isTrackDragging) {
      dropIndicatorIndex = -1
      return
    }

    let rafId: number
    const updateDropIndicator = () => {
      const newIndex = trackDropIndexRef.current
      if (dropIndicatorIndex !== newIndex) dropIndicatorIndex = newIndex
      rafId = requestAnimationFrame(updateDropIndicator)
    }

    rafId = requestAnimationFrame(updateDropIndicator)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  })

  // Drag visuals: move all dragged track headers together with their clip rows via
  // direct DOM manipulation. Headers and content rows both carry data-track-id, so the
  // dragged track's clips ghost-follow the header in lockstep.
  // This handles groups (header + children move as one) and multi-select drag.
  $effect(() => {
    if (!isTrackDragging) return

    return untrack(() => {
      const dragState = useSelectionStore.getState().dragState
      if (!dragState?.draggedTrackIds?.length) return

      const draggedIds = new Set(dragState.draggedTrackIds)
      const container = trackHeadersRoot
      if (!container) return

      // Content clip rows live under the track-sections surface, scoped here so we don't
      // also match the header rows (both use data-track-id). The row set is stable for
      // the duration of a track drag, so query it once instead of every frame.
      const headerRows = Array.from(container.querySelectorAll<HTMLElement>('[data-track-id]'))
      const contentRows = Array.from(
        (container.getRootNode() as Document | ShadowRoot)
          .getElementById('timeline-track-sections')
          ?.querySelectorAll<HTMLElement>('[data-track-id]') ?? [],
      )

      let rafId: number
      const updateDragVisuals = () => {
        const offset = trackDragOffsetRef.current
        for (const el of headerRows) {
          const trackId = el.getAttribute('data-track-id')
          if (trackId && draggedIds.has(trackId)) {
            el.style.transform = `translateY(${offset}px) scale(1.02)`
            el.style.zIndex = '100'
            el.style.opacity = '0.5'
            el.style.transition = 'none'
            el.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'
          }
        }
        // Clip rows ghost-follow the header. No horizontal scale here — it would shift the
        // clips sideways; just translate + dim so the clips track the drag.
        for (const el of contentRows) {
          const trackId = el.getAttribute('data-track-id')
          if (trackId && draggedIds.has(trackId)) {
            el.style.transform = `translateY(${offset}px)`
            el.style.zIndex = '50'
            el.style.opacity = '0.5'
            el.style.transition = 'none'
          }
        }
        rafId = requestAnimationFrame(updateDragVisuals)
      }

      rafId = requestAnimationFrame(updateDragVisuals)
      return () => {
        cancelAnimationFrame(rafId)
        // Reset styles on all track headers
        for (const el of headerRows) {
          el.style.transform = ''
          el.style.zIndex = ''
          el.style.opacity = ''
          el.style.transition = ''
          el.style.boxShadow = ''
        }
        // Reset styles on the clip rows
        for (const el of contentRows) {
          el.style.transform = ''
          el.style.zIndex = ''
          el.style.opacity = ''
          el.style.transition = ''
        }
      }
    })
  })

  // Keyboard shortcut: Escape exits the active composition.
  // In/out shortcuts are registered by useTimelineShortcuts so they remain
  // available when the compact Color timeline replaces this component.
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Another focused panel (e.g. Source Monitor) already handled this key.
      if (e.defaultPrevented) return

      // Ignore if typing in an input, textarea, or contenteditable
      const target = (e.composedPath()[0] ?? e.target) as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const key = e.key.toLowerCase()

      // Escape - exit composition if inside one
      if (key === 'escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const navStore = useCompositionNavigationStore.getState()
        if (navStore.activeCompositionId !== null) {
          e.preventDefault()
          navStore.exitComposition()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  function syncTrackSelectionAfterRemoval(removedTrackIds: string[], fallbackTrackId: string | null) {
    const removedTrackIdsSet = new Set(removedTrackIds)
    const selectionState = useSelectionStore.getState()
    const remainingSelectedTrackIds = selectionState.selectedTrackIds.filter(
      (trackId) => !removedTrackIdsSet.has(trackId),
    )

    if (remainingSelectedTrackIds.length > 0) {
      selectionState.selectTracks(remainingSelectedTrackIds)
      return
    }

    if (selectionState.activeTrackId && !removedTrackIdsSet.has(selectionState.activeTrackId)) {
      return
    }

    selectionState.setActiveTrack(fallbackTrackId)
  }

  function addVideoTrackToTop() {
    const newTrack = createClassicTrack({ tracks, kind: 'video', order: 0 })

    timelineTracks.addTrack(newTrack)

    setTimeout(() => {
      useSelectionStore.getState().setActiveTrack(newTrack.id)
    }, 0)
  }

  function appendAudioTrackToSection() {
    const audioAnchorTrack =
      audioTracks[audioTracks.length - 1] ??
      videoTracks[videoTracks.length - 1] ??
      tracks[tracks.length - 1] ??
      null

    const newTrack = createClassicTrack({
      tracks,
      kind: 'audio',
      order: audioAnchorTrack ? getAdjacentTrackOrder(tracks, audioAnchorTrack, 'below') : 0,
    })

    setTimelineTracks([...tracks, newTrack])

    setTimeout(() => {
      useSelectionStore.getState().setActiveTrack(newTrack.id)
    }, 0)
  }

  // Trigger reflects the persisted preset (saved as a local editor setting).
  const ActiveTrackSizeIcon = $derived(
    TRACK_SIZE_OPTIONS.find((option) => option.id === trackSizePreset.current)?.icon ?? Rows3,
  )

  /**
   * Apply a track-size preset: save the choice locally and re-derive every
   * track's height from it, dropping any per-track overrides. Not a project
   * edit — no undo entry, no dirty flag.
   */
  function handleSelectTrackSize(preset: (typeof TRACK_SIZE_OPTIONS)[number]) {
    applyTrackSizePreset(preset.id)
  }

  function handleDeleteTrack(trackId: string) {
    if (tracks.length <= 1) {
      logger.warn('Cannot remove all tracks')
      return
    }

    timelineTracks.removeTracks([trackId])

    const remainingTracks = tracks.filter((track) => track.id !== trackId)
    syncTrackSelectionAfterRemoval([trackId], remainingTracks[0]?.id ?? null)
  }

  function handleDeleteEmptyTracks(contextTrackId: string) {
    const emptyTrackIds = getEmptyTrackIdsForRemoval(
      tracks,
      useItemsStore.getState().itemsByTrackId,
      contextTrackId,
    )
    if (emptyTrackIds.length === 0) return

    const removedTrackIdsSet = new Set(emptyTrackIds)
    timelineTracks.removeTracks(emptyTrackIds)

    const remainingTracks = tracks.filter((track) => !removedTrackIdsSet.has(track.id))
    syncTrackSelectionAfterRemoval(emptyTrackIds, remainingTracks[0]?.id ?? null)
  }

  /**
   * Handle removing selected tracks
   * Removes all selected tracks or the active track if none selected.
   * Keeps at least one track in the timeline.
   */
  function handleRemoveTracks() {
    const tracksToRemove =
      selectedTrackIds.length > 0 ? [...selectedTrackIds] : activeTrackId ? [activeTrackId] : []

    if (tracksToRemove.length === 0) return

    // Don't allow removing all tracks
    const tracksToRemoveSet = new Set(tracksToRemove)
    if (tracksToRemoveSet.size >= tracks.length) {
      logger.warn('Cannot remove all tracks')
      return
    }

    timelineTracks.removeTracks(tracksToRemove)

    const remainingTrack = tracks.find((t) => !tracksToRemoveSet.has(t.id))
    syncTrackSelectionAfterRemoval(tracksToRemove, remainingTrack?.id ?? null)
  }

  function handleTrackSelect(e: MouseEvent, track: TimelineTrack) {
    if (trackDragJustDroppedRef.current) return
    const selection = useSelectionStore.getState()
    if (e.shiftKey && activeTrackId) {
      const startIdx = visibleTracks.findIndex((t) => t.id === activeTrackId)
      const endIdx = visibleTracks.findIndex((t) => t.id === track.id)
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx)
        const hi = Math.max(startIdx, endIdx)
        const rangeIds = visibleTracks.slice(lo, hi + 1).map((t) => t.id)
        selection.selectTracks(rangeIds)
      }
    } else if (e.metaKey || e.ctrlKey) {
      selection.toggleTrackSelection(track.id)
    } else {
      selection.setActiveTrack(track.id)
    }
  }

  const videoDropIndicatorIndex = $derived(
    isTrackDragging && dropIndicatorIndex >= 0 && dropIndicatorIndex <= videoTracks.length
      ? dropIndicatorIndex
      : -1,
  )
  const audioDropIndicatorIndex = $derived(
    isTrackDragging &&
      dropIndicatorIndex >= videoTracks.length &&
      dropIndicatorIndex <= visibleTracks.length
      ? dropIndicatorIndex - videoTracks.length
      : -1,
  )
  const singleSectionKind = $derived(videoTracks.length > 0 ? 'video' : 'audio')
  const singleSectionTracks = $derived(videoTracks.length > 0 ? videoTracks : audioTracks)
  const singleSectionHeight = $derived(videoTracks.length > 0 ? videoPaneHeight : audioPaneHeight)
  const singleSectionZoneHeight = $derived(
    videoTracks.length > 0 ? videoZoneHeight : audioZoneHeight,
  )
  const singleDropIndicatorIndex = $derived(
    !hasTrackSections &&
      isTrackDragging &&
      dropIndicatorIndex >= 0 &&
      dropIndicatorIndex <= visibleTracks.length
      ? dropIndicatorIndex
      : -1,
  )

  const removeTracksTitle = $derived(
    tracks.length === 0
      ? t('timeline.noTracksToRemove')
      : !activeTrackId && selectedTrackIds.length === 0
        ? t('timeline.selectTrackToRemove')
        : selectedTrackIds.length > 0
          ? t('timeline.removeSelectedTracks', { count: selectedTrackIds.length })
          : t('timeline.removeActiveTrack'),
  )
</script>

{#snippet trackHeadersSection(
  sectionTracks: TimelineTrack[],
  options: {
    section: 'video' | 'audio'
    height: number
    zoneHeight: number
    attachScroll: (node: HTMLDivElement) => () => void
    dropIndicatorLocalIndex: number
    firstTrackFrame: 'with-top-divider' | 'regular'
  },
)}
  <div
    class="relative min-h-0 overflow-hidden"
    style:height="var(--timeline-{options.section}-pane-height, {options.height}px)"
    data-track-section-scroll={options.section}
  >
    <div {@attach options.attachScroll} class="h-full overflow-hidden">
      <div class="relative min-h-full">
        {#if options.section === 'video'}
          <div
            aria-hidden="true"
            data-track-header-new-zone="video"
            style:height="var(--timeline-video-zone-height, {options.zoneHeight}px)"
          ></div>
        {/if}

        {#each sectionTracks as track, index (track.id)}
          {@const RowFrame =
            options.firstTrackFrame === 'with-top-divider' && index === 0
              ? FirstTrackRowFrame
              : TrackRowFrame}
          <RowFrame
            onResizeMouseDown={(event) => trackHeightResize.handleTrackResizeStart(event, track.id)}
            onResizeDoubleClick={(event) => trackHeightResize.handleTrackResizeReset(event, track.id)}
            resizeHandleLabel={`Resize ${track.name} height`}
            resizeHandlePosition={getTrackKind(track) === 'video' ? 'top' : 'bottom'}
          >
            <TrackHeader
              {track}
              isActive={activeTrackId === track.id}
              isSelected={selectedTrackIdsSet.has(track.id)}
              canDeleteTrack={tracks.length > 1}
              {canDeleteEmptyTracks}
              onToggleLock={() => timelineTracks.toggleTrackLock(track.id)}
              onToggleSyncLock={() => timelineTracks.toggleTrackSyncLock(track.id)}
              onToggleDisabled={() => timelineTracks.toggleTrackDisabled(track.id)}
              onToggleSolo={() => timelineTracks.toggleTrackSolo(track.id)}
              onCloseGaps={() => closeAllGapsOnTrack(track.id)}
              onAddVideoTrack={addVideoTrackToTop}
              onAddAudioTrack={appendAudioTrackToSection}
              onDeleteTrack={() => handleDeleteTrack(track.id)}
              onDeleteEmptyTracks={() => handleDeleteEmptyTracks(track.id)}
              onSelect={(e) => handleTrackSelect(e, track)}
            />
          </RowFrame>
        {/each}

        {#if options.section === 'audio'}
          <div
            aria-hidden="true"
            data-track-header-new-zone="audio"
            style:height="var(--timeline-audio-zone-height, {options.zoneHeight}px)"
          ></div>
        {/if}

        {#if options.dropIndicatorLocalIndex >= 0}
          <div
            class="absolute left-0 right-0 h-0.5 pointer-events-none z-50 shadow-lg bg-primary"
            style:top="{getTrackStackOffset(
              sectionTracks,
              options.dropIndicatorLocalIndex,
              options.section === 'video' ? options.zoneHeight : 0,
            )}px"
          ></div>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

<div
  bind:this={rootEl}
  class="timeline-bg h-full border-t border-border flex flex-col overflow-hidden"
  role="region"
  aria-label={t('timeline.region')}
>
  <!-- Timeline Header -->
  <TimelineHeader
    onZoomChange={zoomHandlers?.handleZoomChange}
    onZoomIn={zoomHandlers?.handleZoomIn}
    onZoomOut={zoomHandlers?.handleZoomOut}
    onZoomToFit={zoomHandlers?.handleZoomToFit}
  />

  <!-- Standalone-timeline (sequence) tabs — Main + top-level sequences -->
  <SequenceTabs />

  <!-- Composition Breadcrumbs - shown when inside a sub-composition -->
  <CompositionBreadcrumbs />

  <!-- Timeline Content -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 flex overflow-hidden min-h-0" onmousedown={handleTimelineAreaMouseDown}>
    <!-- Track Headers Sidebar -->
    <div
      class="border-r border-border panel-bg flex-shrink-0 flex flex-col overflow-x-hidden"
      style:width={EDITOR_LAYOUT_CSS_VALUES.timelineSidebarWidth}
    >
      <!-- Tracks label with controls -->
      <div
        class="flex items-center justify-between px-3 border-b border-border bg-secondary/20 flex-shrink-0"
        style:height={EDITOR_LAYOUT_CSS_VALUES.timelineTracksHeaderHeight}
      >
        <!-- Track size flyout -->
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="h-6 w-6"
                title={t('timeline.trackSize.label')}
              >
                <ActiveTrackSizeIcon class="w-3 h-3" />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="min-w-[10rem]">
            {#each TRACK_SIZE_OPTIONS as option (option.id)}
              {@const OptionIcon = option.icon}
              <DropdownMenuItem onSelect={() => handleSelectTrackSize(option)}>
                <OptionIcon class="w-4 h-4" />
                <span class="flex-1">{t(option.labelKey)}</span>
                {#if trackSizePreset.current === option.id}<Check class="w-4 h-4" />{/if}
              </DropdownMenuItem>
            {/each}
          </DropdownMenuContent>
        </DropdownMenu>
        <div class="flex items-center gap-1">
          <!-- Add track flyout -->
          <DropdownMenu>
            <DropdownMenuTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6"
                  title={t('timeline.addTrack.label')}
                >
                  <Plus class="w-3 h-3" />
                </Button>
              {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="min-w-[10rem]">
              <DropdownMenuItem onSelect={() => addVideoTrackToTop()}>
                <Video class="w-4 h-4" />
                <span class="flex-1">{t('timeline.addTrack.video')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => appendAudioTrackToSection()}>
                <AudioLines class="w-4 h-4" />
                <span class="flex-1">{t('timeline.addTrack.audio')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <!-- Remove track button -->
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onclick={handleRemoveTracks}
            disabled={tracks.length === 0 || (!activeTrackId && selectedTrackIds.length === 0)}
            title={removeTracksTitle}
          >
            <Minus class="w-3 h-3" />
          </Button>
        </div>
      </div>

      <!-- Track labels - synced scroll (no scrollbar) -->
      <div bind:this={trackHeadersViewport} class="flex-1 overflow-hidden relative">
        <div
          bind:this={trackHeadersRoot}
          class="flex h-full min-h-0 flex-col"
          style:--timeline-video-pane-height="{videoPaneHeight}px"
          style:--timeline-audio-pane-height="{audioPaneHeight}px"
          style:--timeline-video-zone-height="{videoZoneHeight}px"
          style:--timeline-audio-zone-height="{audioZoneHeight}px"
        >
          {#if hasTrackSections}
            {@render trackHeadersSection(videoTracks, {
              section: 'video',
              height: videoPaneHeight,
              zoneHeight: videoZoneHeight,
              attachScroll: attachVideoTrackHeadersScroll,
              dropIndicatorLocalIndex: videoDropIndicatorIndex,
              firstTrackFrame: 'with-top-divider',
            })}
            <TrackSectionDivider onMouseDown={handleSectionDividerMouseDown} />
            {@render trackHeadersSection(audioTracks, {
              section: 'audio',
              height: audioPaneHeight,
              zoneHeight: audioZoneHeight,
              attachScroll: attachAudioTrackHeadersScroll,
              dropIndicatorLocalIndex: audioDropIndicatorIndex,
              firstTrackFrame: 'regular',
            })}
          {:else}
            {@render trackHeadersSection(singleSectionTracks, {
              section: singleSectionKind,
              height: singleSectionHeight,
              zoneHeight: singleSectionZoneHeight,
              attachScroll: attachAllTrackHeadersScroll,
              dropIndicatorLocalIndex: singleDropIndicatorIndex,
              firstTrackFrame: 'with-top-divider',
            })}
          {/if}
        </div>
      </div>
    </div>

    <!-- Timeline Canvas -->
    <TimelineContent
      {duration}
      tracks={visibleTracks}
      bind:scroll={timelineContent}
      bind:allTracksScroll={allTrackContentScroll}
      bind:videoTracksScroll={videoTrackContentScroll}
      bind:audioTracksScroll={audioTrackContentScroll}
      {videoPaneHeight}
      {audioPaneHeight}
      onSectionDividerMouseDown={hasTrackSections ? handleSectionDividerMouseDown : undefined}
      onZoomHandlersReady={(handlers) => (zoomHandlers = handlers)}
    />
  </div>

  <div class="flex flex-shrink-0 overflow-hidden">
    <div
      class="border-r border-border panel-bg flex-shrink-0"
      style:width={EDITOR_LAYOUT_CSS_VALUES.timelineSidebarWidth}
    ></div>
    <div class="flex-1 min-w-0">
      <TimelineNavigator actualDuration={duration} scrollContainer={timelineContent} />
    </div>
  </div>
  <KeyframeGraphPanel
    isOpen={keyframePanelOpen.current}
    placement="bottom"
    surface="edit"
    propertyColumnWidth={editorLayout.timelineSidebarWidth - 1}
    timelineScrollContainer={timelineContent}
    onClose={() => useSelectionStore.getState().setEditKeyframePanelOpen(false)}
  />
  <TransitionDragTooltip />
</div>
