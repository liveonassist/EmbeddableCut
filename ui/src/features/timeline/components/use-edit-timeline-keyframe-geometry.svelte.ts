// SPDX-License-Identifier: MIT

/**
 * Edit-timeline geometry for the docked keyframe editor.
 *
 * Perf-critical: live wheel zoom must NOT update the editor tree — the
 * settle-then-commit geometry from useSettledTimelineGeometry is what the
 * keyframe graph panel's render-isolation test pins, so only settled content
 * zoom and settled scroll reach the returned geometry.
 */

import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import { notifyTimelineLiveScroll } from '@/shared/timeline/live-scroll-sync'
import { getContentBoundedEdgeScrollLeft } from '@/features/timeline/utils/timeline-layout'
import type { TimelineItem } from '@/types/timeline'
import { select } from '$lib/store.svelte'
import { useSettledTimelineGeometry } from './use-settled-timeline-scroll-left.svelte'
import type { KeyframeEditorSurface } from './keyframe-graph-panel-model'

interface EditTimelineKeyframeGeometryParams {
  timelineScrollContainer: HTMLDivElement | null | undefined
  surface: KeyframeEditorSurface
  isOpen: boolean
  maxItemEndFrame: number
  selectedItemForEditor: TimelineItem | null
}

export function useEditTimelineKeyframeGeometry(params: () => EditTimelineKeyframeGeometryParams) {
  const timelineScrollContainer = $derived(params().timelineScrollContainer)
  const surface = $derived(params().surface)
  const isOpen = $derived(params().isOpen)
  const maxItemEndFrame = $derived(params().maxItemEndFrame)
  const selectedItemForEditor = $derived(params().selectedItemForEditor)
  const editTimelineViewportWidth = select(useTimelineViewportStore, (state) => state.viewportWidth)
  // The expensive editor tree follows settled geometry. Live wheel zoom is
  // applied by the dopesheet root's compositor axis transform instead.
  const editTimelineContentPixelsPerSecond = select(
    useZoomStore,
    (state) => state.contentPixelsPerSecond,
  )
  const editTimelineFps = select(useTimelineSettingsStore, (state) => state.fps)
  const editTimelineGeometry = useSettledTimelineGeometry(
    () => timelineScrollContainer,
    () => surface === 'edit' && isOpen,
    () => editTimelineContentPixelsPerSecond.current,
  )
  const editTimelineScrollLeft = $derived(editTimelineGeometry.scrollLeft)
  const editTimelinePixelsPerSecond = $derived(editTimelineGeometry.pixelsPerSecond)
  const editTimelineFrameViewport = $derived.by(() => {
    const viewportWidth = editTimelineViewportWidth.current
    const fps = editTimelineFps.current
    if (
      surface !== 'edit' ||
      !selectedItemForEditor ||
      viewportWidth <= 0 ||
      editTimelinePixelsPerSecond <= 0
    ) {
      return undefined
    }
    const startGlobalFrame = (editTimelineScrollLeft / editTimelinePixelsPerSecond) * fps
    const endGlobalFrame =
      ((editTimelineScrollLeft + viewportWidth) / editTimelinePixelsPerSecond) * fps
    return {
      startFrame: startGlobalFrame - selectedItemForEditor.from,
      endFrame: endGlobalFrame - selectedItemForEditor.from,
    }
  })
  const editTimelineGlobalFrameToPixels = (globalFrame: number) => {
    const container = timelineScrollContainer
    // The main timeline content moves natively with scrollLeft on every frame,
    // while the general viewport store is intentionally throttled for heavy
    // culling subscribers. Playheads are lightweight, so read the live DOM
    // axis here to keep the upper and lower lines in the same scroll frame.
    const pixelsPerSecond = container
      ? useZoomStore.getState().pixelsPerSecond
      : editTimelinePixelsPerSecond
    const scrollLeft = container?.scrollLeft ?? useTimelineViewportStore.getState().scrollLeft
    // Match TimelinePlayhead's whole-pixel frame position exactly. Keeping
    // the lower line sub-pixel while the main line rounds makes an otherwise
    // synchronized playhead look faintly doubled at some zoom levels.
    return Math.round((globalFrame / editTimelineFps.current) * pixelsPerSecond) - scrollLeft
  }
  const getEditTimelineLivePixelsPerSecond = () => useZoomStore.getState().pixelsPerSecond
  const handleEditTimelineEdgeScroll = (deltaPixels: number) => {
    if (surface !== 'edit') return 0
    const container = timelineScrollContainer
    if (!container) return 0

    const previousScrollLeft = container.scrollLeft
    const pixelsPerSecond = useZoomStore.getState().pixelsPerSecond
    const viewportWidth = useTimelineViewportStore.getState().viewportWidth
    const contentDuration = Math.max(maxItemEndFrame / editTimelineFps.current, 10)
    container.scrollLeft = getContentBoundedEdgeScrollLeft({
      contentWidth: contentDuration * pixelsPerSecond,
      viewportWidth,
      scrollLeft: previousScrollLeft,
      deltaPixels,
    })
    const nextScrollLeft = container.scrollLeft
    const appliedPixels = nextScrollLeft - previousScrollLeft
    if (appliedPixels !== 0) {
      // Native scroll may arrive after the next paint. Broadcast the applied
      // DOM position so both playheads consume this scrollLeft immediately.
      notifyTimelineLiveScroll(container)
      const timelineViewport = useTimelineViewportStore.getState()
      timelineViewport.setViewportImmediate({
        scrollLeft: nextScrollLeft,
        scrollTop: timelineViewport.scrollTop,
        viewportWidth: timelineViewport.viewportWidth,
        viewportHeight: timelineViewport.viewportHeight,
      })
    }
    return appliedPixels
  }

  return {
    get editTimelineViewportWidth() {
      return editTimelineViewportWidth.current
    },
    get editTimelineFps() {
      return editTimelineFps.current
    },
    get editTimelineScrollLeft() {
      return editTimelineScrollLeft
    },
    get editTimelinePixelsPerSecond() {
      return editTimelinePixelsPerSecond
    },
    get editTimelineFrameViewport() {
      return editTimelineFrameViewport
    },
    editTimelineGlobalFrameToPixels,
    getEditTimelineLivePixelsPerSecond,
    handleEditTimelineEdgeScroll,
  }
}
