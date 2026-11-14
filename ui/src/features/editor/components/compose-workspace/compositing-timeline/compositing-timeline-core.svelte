<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'
  import {
    createDefaultControllerItem,
    createDefaultGradientItem,
    createDefaultShapeItem,
    createDefaultSolidColorItem,
    createTextTemplateItem,
  } from '@/features/editor/deps/timeline-motion'
  import { LAYER_COLUMN_WIDTH } from '../motion-timeline-primitives'
  import { MOTION_IO_LANE_HEIGHT } from '../motion-io-lane'

  const TIMELINE_CONTENT_LEFT = LAYER_COLUMN_WIDTH + 1
  // Tick labels on top, the in/out render-range lane along the bottom.
  const RULER_HEIGHT = 28 + MOTION_IO_LANE_HEIGHT
  type GeneratedLayerKind = 'text' | 'solid' | 'gradient' | 'shape' | 'controller'
  type GeneratedLayerPlacement = Parameters<typeof createDefaultSolidColorItem>[0]

  function createGeneratedLayerItem(
    kind: GeneratedLayerKind,
    placement: GeneratedLayerPlacement,
  ): TimelineItem {
    switch (kind) {
      case 'text':
        return createTextTemplateItem({ placement, text: 'Text layer', label: 'Text layer' })
      case 'solid':
        return createDefaultSolidColorItem(placement)
      case 'gradient':
        return createDefaultGradientItem(placement)
      case 'shape':
        return createDefaultShapeItem({ ...placement, shapeType: 'rectangle' })
      case 'controller':
        return createDefaultControllerItem(placement)
    }
  }
  const EMPTY_LAYER_IDS: string[] = []
</script>

<script lang="ts">
  import { flushSync, untrack } from 'svelte'
  import type { TFunction } from 'i18next'
  import { toast } from 'svelte-sonner'
  import Blend from 'lucide-svelte/icons/blend'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import CopyPlus from 'lucide-svelte/icons/copy-plus'
  import Crop from 'lucide-svelte/icons/crop'
  import Crosshair from 'lucide-svelte/icons/crosshair'
  import Group from 'lucide-svelte/icons/group'
  import Maximize2 from 'lucide-svelte/icons/maximize-2'
  import Plus from 'lucide-svelte/icons/plus'
  import Spline from 'lucide-svelte/icons/spline'
  import Square from 'lucide-svelte/icons/square'
  import Type from 'lucide-svelte/icons/type'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { createLogger } from '@/shared/logging/logger'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useClipboardStore } from '@/shared/state/clipboard'
  import type { DirectLinkableProperty } from '@/types/keyframe'
  import type { TimelineTrack } from '@/types/timeline'
  import {
    addItemOnNewTrack,
    addItemsOnNewTracks,
    captureSnapshot,
    PropertyLinkPickWhipOverlay,
    getAnimatablePropertiesForItem,
    KEYFRAME_EDGE_INSET,
    moveItems,
    openComposition,
    resolveDroppedMediaEntriesFromPayload,
    setPropertyExpression,
    removePropertyExpression,
    setTracks,
    updateItem,
    useCompositionNavigationStore,
    useCompositionsStore,
    useItemsStore,
    useKeyframesStore,
    useKeyframeSelectionStore,
    useTimelineCommandStore,
    useTimelineSettingsStore,
    usePropertyLinkPickWhip,
    wouldCreateCompositionCycle,
  } from '@/features/editor/deps/timeline-motion'
  import {
    clearSpanDragVisuals,
    clearSpanTrimVisuals,
    createMotionSpanDragCommands,
    createMotionSpanTrimCommands,
    type SpanDragState,
    type SpanTrimState,
  } from '../motion-span-interactions'
  import { createMotionRowReorderCommands, type RowReorderDragState } from '../motion-row-reorder'
  import {
    advanceMotionScrubPan,
    createMotionTimeViewportController,
    formatFrameTime,
    normalizeMotionTimeViewport,
    resolveMotionFrameFromClientX,
    resolveMotionScrubFramePaint,
    resolveMotionScrubRelease,
    resolveMotionScrubReleaseBounds,
    type MotionTimeViewport,
  } from '../motion-time-viewport-controller'
  import {
    collectMotionViewportPreviewElements,
    collectMotionViewportPreviewGrids,
    collectMotionViewportPreviewNavigator,
    collectMotionViewportPreviewPlayhead,
    collectMotionViewportPreviewRulerLabels,
    paintMotionViewportGrids,
    paintMotionViewportNavigator,
    paintMotionViewportPlayhead,
    paintMotionViewportRulerLabels,
    paintMotionViewportTargets,
  } from '../motion-time-viewport-preview'
  import { createMotionLayerClipboardCommands } from '../motion-layer-clipboard'
  import { createMotionLayerSelectionCommands } from '../motion-layer-selection'
  import {
    applyMotionSelectionFrameUpdates,
    createMotionSelectionRetimeCommands,
    restoreMotionSelectionRetimeVisuals,
    type MotionSelectionRetimeDragState,
  } from '../motion-selection-retime'
  import {
    LAYER_MODE_COLUMN_WIDTH,
    LAYER_PARENT_COLUMN_WIDTH,
    LAYER_ROW_HEIGHT,
    LAYER_TIMING_COLUMN_WIDTH,
    RULER_DIVISIONS,
    type InlineCurveState,
    type MotionMiddlePanState,
    type MotionViewportPreviewState,
    type RenameTarget,
  } from '../motion-timeline-primitives'
  import { useMaskEditorStore } from '@/features/editor/deps/preview'
  import { getLinkedAudioCompanion } from '@/shared/utils/linked-media'
  import { trimCompositionToActiveRegion, useMarkersStore } from '@/features/editor/deps/timeline-store'
  import {
    clearMediaDragData,
    getMediaDragData,
    useMediaLibraryStore,
  } from '@/features/editor/deps/media-library-contract'
  import { useComposeUiStore } from '../compose-ui-store'
  import NewCompositionDialog from '../new-composition-dialog.svelte'
  import TransformParentPickWhipOverlay from '../transform-parent-pick-whip-overlay.svelte'
  import { useTransformParentPickWhip } from '../use-transform-parent-pick-whip.svelte'
  import {
    buildMotionSelectionDragState,
    buildMotionSelectionRetimeUpdates,
    getMotionSelectionTimeRange,
  } from '../motion-keyframe-selection'
  import { MotionIoLane } from '../motion-io-lane'
  import { MotionActiveRegionOverlay, MotionCompEndRulerDim } from '../motion-region-overlay'
  import {
    buildMotionGroupRowModel,
    buildMotionLayerRowModel,
    buildMotionRows,
    type LayerEntry,
    type MotionRow,
  } from '../motion-layer-row-model'
  import MotionLayerLane from '../motion-layer-lane.svelte'
  import {
    buildCompositionDropLayer,
    buildDroppedMediaLayers,
    buildTemplateDropLayer,
    resolveCompositionDropId,
    resolveMotionDropFrame,
    resolveMotionDropPayload,
  } from '../motion-layer-drop'
  import MotionLayerPropertyRows from '../motion-layer-property-rows.svelte'
  import { MotionDopesheetLanes } from '../motion-dopesheet-content'
  import {
    MotionLayerModeCell,
    MotionLayerNameCell,
    MotionLayerParentCell,
    MotionLayerTimingCell,
  } from '../motion-layer-row-cells'
  import { MotionGroupLaneCell, MotionGroupNameCell } from '../motion-group-row-cells'
  import type { CompositingTimelineItemsSnapshot } from '../motion-timeline-items-snapshot'
  import MotionPlayheadOverlay from './motion-playhead-overlay.svelte'
  import MotionSelectionRetimeRange from './motion-selection-retime-range.svelte'
  import MotionCompactNavigator from './motion-compact-navigator.svelte'
  import MotionRowContextMenu from './motion-row-context-menu.svelte'

  const logger = createLogger('MotionTimeline')

  type DivPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLDivElement }
  type SectionDragEvent = DragEvent & { currentTarget: EventTarget & HTMLElement }

  interface CompositingTimelineCoreProps {
    class?: string
    defaults?: { width: number; height: number; fps: number }
    itemsSnapshot: CompositingTimelineItemsSnapshot
  }

  /**
   * Dedicated layer/property timeline for the Motion workspace.
   *
   * This surface intentionally does not render or import the classic Timeline.
   * It shares domain stores, playback, undoable actions, and the dope-sheet's
   * row and inline curve primitives with the rest of the application.
   */
  let { class: className, defaults, itemsSnapshot }: CompositingTimelineCoreProps = $props()

  // The row cells take i18next's TFunction; this one re-renders on language change.
  const tf = ((key: string, options?: Record<string, unknown>) => t(key, options)) as TFunction

  let createDialogOpen = $state(false)
  let dropActive = $state(false)
  let propertyFilter = $state<'all' | 'keyframed'>('all')
  let inlineCurve = $state.raw<InlineCurveState | null>(null)
  let renameTarget = $state.raw<RenameTarget | null>(null)
  let renameDraft = $state('')
  const spanDragRef: { current: SpanDragState | null } = { current: null }
  const spanDragAnimationFrameRef: { current: number | null } = { current: null }
  const spanDragVisualsRef: { current: HTMLElement[] } = { current: [] }
  const spanTrimRef: { current: SpanTrimState | null } = { current: null }
  const spanTrimAnimationFrameRef: { current: number | null } = { current: null }
  const selectionAnchorIdRef: { current: string | null } = { current: null }
  let motionViewportPreviewRoot = $state<HTMLDivElement | null>(null)
  let motionViewportPreview: MotionViewportPreviewState | null = null
  let motionTimeNavigator = $state<HTMLDivElement | null>(null)
  let motionScrollArea = $state<HTMLDivElement | null>(null)
  let motionRuler = $state<HTMLDivElement | null>(null)
  let motionSelectionRetimeRange = $state<HTMLDivElement | null>(null)
  const selectionRetimeDragRef: { current: MotionSelectionRetimeDragState | null } = {
    current: null,
  }
  const pendingSelectionRetimeFrameRef: { current: number | null } = { current: null }
  const selectionRetimeAnimationFrameRef: { current: number | null } = { current: null }
  let rowReorderDrag = $state.raw<RowReorderDragState | null>(null)
  const rowReorderDragRef: { current: RowReorderDragState | null } = { current: null }
  const pendingRowReorderClientYRef: { current: number | null } = { current: null }
  const rowReorderAnimationFrameRef: { current: number | null } = { current: null }
  const propertyLink = usePropertyLinkPickWhip()
  function handleSetPropertyExpression(
    itemId: string,
    property: DirectLinkableProperty,
    source: string,
    enabled: boolean,
  ) {
    setPropertyExpression(itemId, {
      type: 'expression',
      targetProperty: property,
      source,
      enabled,
    })
  }
  function handleRemovePropertyExpression(itemId: string, property: DirectLinkableProperty) {
    removePropertyExpression(itemId, property)
  }
  let timeViewport = $state.raw<MotionTimeViewport>({ startFrame: 0, endFrame: 1 })
  // Kept in step with `timeViewport`, and ahead of it while a commit flushes.
  const timeViewportRef: { current: MotionTimeViewport } = { current: timeViewport }
  function setTimeViewport(next: MotionTimeViewport) {
    timeViewportRef.current = next
    timeViewport = next
  }

  $effect(() => () => {
    if (spanDragAnimationFrameRef.current !== null) {
      cancelAnimationFrame(spanDragAnimationFrameRef.current)
    }
    if (spanTrimAnimationFrameRef.current !== null) {
      cancelAnimationFrame(spanTrimAnimationFrameRef.current)
    }
    clearSpanDragVisuals(spanDragVisualsRef.current)
    if (spanTrimRef.current) clearSpanTrimVisuals(spanTrimRef.current)
  })
  // Wheel navigation state lives in its own controller: queued viewport
  // previews, the settle timer and the gesture's locked pan axis. Its getters
  // read the current values, so it is created once: a re-created controller
  // would orphan an in-flight settle timer.
  const viewportController = createMotionTimeViewportController({
    layerColumnWidth: LAYER_COLUMN_WIDTH,
    getDurationInFrames: () => durationInFrames,
    getTimeViewport: () => timeViewportRef.current,
    preparePreview: () => prepareMotionTimeViewportPreview(),
    previewViewport: (viewport) => previewMotionTimeViewport(viewport),
    commitViewport: (viewport, roundToFrames) => commitMotionTimeViewport(viewport, roundToFrames),
    getScrollArea: () => motionScrollArea,
  })
  let motionScrollbarWidth = $state(0)
  let allPathVertexItemIds = $state.raw<Set<string>>(new Set())
  let middlePan: MotionMiddlePanState | null = null
  let latestScrubFrame: number | null = null
  let scrubAnimationFrame: number | null = null
  let scrubAnimationTime: number | null = null
  let playheadScrubPointerId: number | null = null
  let playheadScrubClientX: number | null = null
  let playheadScrubSurface: HTMLDivElement | null = null
  let playheadScrubViewport: MotionTimeViewport | null = null
  let viewportCompositionId: string | null = null
  const activeCompositionIdState = select(useCompositionNavigationStore, (state) => state.activeCompositionId)
  const activeCompositionId = $derived(activeCompositionIdState.current)
  const compositionsState = select(useCompositionsStore, (state) => state.compositions)
  const compositions = $derived(compositionsState.current)
  const compositionByIdState = select(useCompositionsStore, (state) => state.compositionById)
  const compositionById = $derived(compositionByIdState.current)
  const composition = $derived(
    activeCompositionId ? (compositionById[activeCompositionId] ?? null) : null,
  )
  const items = $derived(itemsSnapshot.items)
  const tracks = $derived(itemsSnapshot.tracks)
  const itemById = $derived(itemsSnapshot.itemById)
  const keyframesByItemIdState = select(useKeyframesStore, (state) => state.keyframesByItemId)
  const keyframesByItemId = $derived(keyframesByItemIdState.current)
  const { setScrubFrame, setPreviewFrame, pause } = usePlaybackStore.getState()
  const selectedItemIdsState = select(useSelectionStore, (state) => state.selectedItemIds)
  const selectedItemIds = $derived(selectedItemIdsState.current)
  const selectItems = (itemIds: string[]) => useSelectionStore.getState().selectItems(itemIds)
  const selectedMotionKeyframes = select(useKeyframeSelectionStore, (state) => state.selectedKeyframes)
  const maskEditingItemIdState = select(useMaskEditorStore, (state) =>
    state.isEditing ? state.editingItemId : null,
  )
  const maskEditingItemId = $derived(maskEditingItemIdState.current)
  const selectedPathVertexIndicesState = select(useMaskEditorStore, (state) => state.selectedVertexIndices)
  const selectedPathVertexIndices = $derived(selectedPathVertexIndicesState.current)
  const expandedLayerIdsByComposition = select(useComposeUiStore, (state) => state.expandedLayerIdsByComposition)
  const expandedLayerIds = $derived(
    activeCompositionId
      ? (expandedLayerIdsByComposition.current[activeCompositionId] ?? EMPTY_LAYER_IDS)
      : EMPTY_LAYER_IDS,
  )
  const { toggleLayerExpanded, setAllLayersExpanded, pruneCompositionLayers } = useComposeUiStore.getState()
  const mediaItems = select(useMediaLibraryStore, (state) => state.mediaItems)
  const canPasteLayersState = select(useClipboardStore, (state) => (state.itemsClipboard?.items.length ?? 0) > 0)
  const canPasteLayers = $derived(canPasteLayersState.current)

  const isComposite = $derived(composition?.editorKind === 'composite-2d')
  // The axis covers the comp *and* anything hanging past it; the comp's own end is
  // tracked separately so the overhang can be marked as outside the comp (and is
  // not what Zoom To Fit fits).
  const compositionEndFrame = $derived(composition ? Math.max(1, composition.durationInFrames) : null)
  // A full-comp range stays visible/editable after a trim, but cannot be trimmed again.
  const markerInPoint = select(useMarkersStore, (state) => state.inPoint)
  const markerOutPoint = select(useMarkersStore, (state) => state.outPoint)
  const canTrimToActiveRegion = $derived.by(() => {
    const inPoint = markerInPoint.current
    const outPoint = markerOutPoint.current
    return (
      isComposite &&
      inPoint !== null &&
      outPoint !== null &&
      outPoint > inPoint &&
      !(inPoint === 0 && compositionEndFrame !== null && outPoint === compositionEndFrame)
    )
  })
  const durationInFrames = $derived(
    Math.max(1, compositionEndFrame ?? 1, ...items.map((item) => item.from + item.durationInFrames)),
  )
  const fps = $derived(composition?.fps ?? 30)
  const transformParentCanvas = $derived({
    width: composition?.width ?? 1920,
    height: composition?.height ?? 1080,
    fps,
  })
  const transformParent = useTransformParentPickWhip(() => transformParentCanvas)
  // The first render already shows the whole composition; the effect below
  // refits on every later composition switch.
  viewportCompositionId = untrack(() => activeCompositionId)
  setTimeViewport({ startFrame: 0, endFrame: untrack(() => durationInFrames) })
  // Fit the entire composition before paint whenever Motion opens or switches
  // compositions. Subsequent duration changes only clamp the user's viewport,
  // so manual zoom/pan remains stable while editing.
  $effect.pre(() => {
    const compositionId = activeCompositionId
    const total = durationInFrames
    if (viewportCompositionId !== compositionId) {
      viewportCompositionId = compositionId
      setTimeViewport({ startFrame: 0, endFrame: total })
      return
    }
    const current = timeViewportRef.current
    const normalized = normalizeMotionTimeViewport(current, total)
    if (normalized.startFrame !== current.startFrame || normalized.endFrame !== current.endFrame) {
      setTimeViewport(normalized)
    }
  })
  function updateTimeViewport(viewport: MotionTimeViewport, roundToFrames = true) {
    const normalized = normalizeMotionTimeViewport(viewport, durationInFrames, roundToFrames)
    const current = timeViewport
    if (current.startFrame === normalized.startFrame && current.endFrame === normalized.endFrame) {
      timeViewportRef.current = normalized
      return
    }
    setTimeViewport(normalized)
  }
  function clearMotionTimeViewportPreview() {
    const preview = motionViewportPreview
    if (!preview) return
    for (const grid of preview.grids) {
      grid.element.dataset.motionGridFrames = grid.framesAttribute
      grid.element.style.cssText = grid.cssText
    }
    for (const target of preview.elements) {
      target.element.style.left = target.left
      target.element.style.width = target.width
      target.element.style.willChange = target.willChange
    }
    if (preview.playhead) {
      preview.playhead.element.style.transform = preview.playhead.transform
      preview.playhead.element.hidden = preview.playhead.hidden
    }
    for (const label of preview.rulerLabels) label.element.textContent = label.text
    if (preview.navigator) {
      preview.navigator.element.dataset.startFrame = preview.navigator.startFrame
      preview.navigator.element.dataset.endFrame = preview.navigator.endFrame
      preview.navigator.thumb.style.left = preview.navigator.thumbLeft
      preview.navigator.thumb.style.width = preview.navigator.thumbWidth
    }
    motionViewportPreview = null
  }
  function discardMotionTimeViewportPreview() {
    const preview = motionViewportPreview
    if (!preview) return
    for (const grid of preview.grids) grid.element.style.willChange = grid.willChange
    for (const target of preview.elements) {
      target.element.style.willChange = target.willChange
    }
    motionViewportPreview = null
  }
  function prepareMotionTimeViewportPreview() {
    clearMotionTimeViewportPreview()
    const root = motionViewportPreviewRoot
    if (!root) return

    const baseViewport = timeViewportRef.current
    const baseRange = Math.max(1, baseViewport.endFrame - baseViewport.startFrame)
    const grids = collectMotionViewportPreviewGrids(root)
    const elements = collectMotionViewportPreviewElements({ root, baseViewport, baseRange })
    const playhead = collectMotionViewportPreviewPlayhead(
      root.querySelector<HTMLElement>('[data-testid="motion-playhead"]'),
    )
    const rulerLabels = collectMotionViewportPreviewRulerLabels(root)
    const navigator = collectMotionViewportPreviewNavigator(motionTimeNavigator)
    motionViewportPreview = {
      baseViewport,
      elements,
      grids,
      playhead,
      rulerLabels,
      navigator,
    }
  }
  function previewMotionTimeViewport(viewport: MotionTimeViewport | null, scrubPlayheadProgress?: number) {
    if (!viewport) {
      clearMotionTimeViewportPreview()
      return
    }

    if (!motionViewportPreview) prepareMotionTimeViewportPreview()
    const preview = motionViewportPreview as MotionViewportPreviewState | null
    if (!preview) return
    const nextRange = Math.max(1, viewport.endFrame - viewport.startFrame)

    paintMotionViewportGrids(preview.grids, viewport, nextRange)
    paintMotionViewportTargets(preview.elements, viewport, nextRange)
    if (preview.playhead) {
      const playback = usePlaybackStore.getState()
      paintMotionViewportPlayhead(preview.playhead, {
        frame: playback.previewFrame ?? playback.currentFrame,
        viewport,
        nextRange,
        scrubProgress: scrubPlayheadProgress,
      })
    }
    paintMotionViewportRulerLabels(preview.rulerLabels, viewport, nextRange, fps)
    if (preview.navigator) {
      paintMotionViewportNavigator(preview.navigator, viewport, durationInFrames)
    }
  }
  function commitMotionTimeViewport(viewport: MotionTimeViewport, roundToFrames = true) {
    // Wheel preview is imperative and RAF-local. Settle synchronously so a
    // following discrete mouse notch cannot be overwritten by an older
    // deferred viewport render.
    flushSync(() => updateTimeViewport(viewport, roundToFrames))
    discardMotionTimeViewportPreview()
  }
  function fitMotionTimeViewport() {
    viewportController.cancel()
    // Fit the active region when one is marked, else the comp itself — never the
    // content overhang past the comp end, which does not render. Read in/out at
    // click time.
    const { inPoint, outPoint } = useMarkersStore.getState()
    const fittedViewport =
      inPoint !== null && outPoint !== null && outPoint > inPoint
        ? { startFrame: inPoint, endFrame: outPoint }
        : { startFrame: 0, endFrame: compositionEndFrame ?? durationInFrames }
    previewMotionTimeViewport(fittedViewport)
    commitMotionTimeViewport(fittedViewport)
  }
  function trimAndFitMotionTimeViewport() {
    if (!trimCompositionToActiveRegion()) return
    // Trimming rebases I/O to 0..newDuration. Reuse the same fit path as the
    // toolbar control so preview, navigator handoff and settled geometry stay
    // identical without reacting to unrelated duration changes.
    fitMotionTimeViewport()
  }
  $effect(() => () => clearMotionTimeViewportPreview())
  $effect(() => () => viewportController.cancel())
  $effect.pre(() => {
    const scrollArea = motionScrollArea
    if (!scrollArea) return
    const updateScrollbarWidth = () => {
      const nextWidth = Math.max(0, scrollArea.offsetWidth - scrollArea.clientWidth)
      if (motionScrollbarWidth !== nextWidth) motionScrollbarWidth = nextWidth
    }
    updateScrollbarWidth()
    const observer = new ResizeObserver(updateScrollbarWidth)
    observer.observe(scrollArea)
    return () => observer.disconnect()
  })
  const visibleFrameRange = $derived(Math.max(1, timeViewport.endFrame - timeViewport.startFrame))
  const frameToMotionPercent = (frame: number) =>
    ((frame - timeViewport.startFrame) / visibleFrameRange) * 100
  const compositeCompositions = $derived(
    compositions.filter((candidate) => candidate.editorKind === 'composite-2d'),
  )
  const dialogDefaults = $derived(
    defaults ?? {
      width: composition?.width ?? 1920,
      height: composition?.height ?? 1080,
      fps,
    },
  )
  const selectedItemIdSet = $derived(new Set(selectedItemIds))
  const expandedLayerIdSet = $derived(new Set(expandedLayerIds))
  const activeInlineCurve = $derived(inlineCurve?.compositionId === activeCompositionId ? inlineCurve : null)
  const motionSelectionDragState = $derived(
    buildMotionSelectionDragState(selectedMotionKeyframes.current, keyframesByItemId, itemById),
  )
  const motionSelectionTimeRange = $derived(
    motionSelectionDragState ? getMotionSelectionTimeRange(motionSelectionDragState, itemById) : null,
  )
  const trackById = $derived(new Map(tracks.map((track) => [track.id, track])))
  const hiddenLinkedAudioItemIds = $derived.by(() => {
    const hidden = new Set<string>()
    for (const item of items) {
      const companion = getLinkedAudioCompanion(items, item)
      if (companion) hidden.add(companion.id)
    }
    return hidden
  })
  function expandMotionLayerItemIds(itemIds: readonly string[]): string[] {
    const expanded = new Set(itemIds)
    for (const itemId of itemIds) {
      const item = items.find((candidate) => candidate.id === itemId)
      if (!item) continue
      const companion = getLinkedAudioCompanion(items, item)
      if (companion) expanded.add(companion.id)
    }
    return [...expanded]
  }
  const layerEntries: LayerEntry[] = $derived(
    items
      .filter((item) => item.type !== 'subtitle' && !hiddenLinkedAudioItemIds.has(item.id))
      .map((item) => ({ item, track: trackById.get(item.trackId) }))
      .sort(
        (a, b) =>
          (a.track?.order ?? Number.MAX_SAFE_INTEGER) - (b.track?.order ?? Number.MAX_SAFE_INTEGER) ||
          a.item.from - b.item.from ||
          a.item.id.localeCompare(b.item.id),
      ),
  )
  const activeCurveItem = $derived(
    activeInlineCurve ? (items.find((item) => item.id === activeInlineCurve.itemId) ?? null) : null,
  )
  const activeCurveTrack = $derived(activeCurveItem ? trackById.get(activeCurveItem.trackId) : undefined)
  const activeCurveParentGroup = $derived(
    activeCurveTrack?.parentTrackId ? trackById.get(activeCurveTrack.parentTrackId) : undefined,
  )
  const isActiveCurveLocked = $derived(
    activeCurveTrack?.locked === true || activeCurveParentGroup?.locked === true,
  )
  const activeCurveProperties = $derived(
    activeCurveItem ? getAnimatablePropertiesForItem(activeCurveItem) : [],
  )
  const canGroupSelectedLayers = $derived(
    new Set(
      layerEntries
        .filter((entry) => selectedItemIdSet.has(entry.item.id))
        .map((entry) => entry.track?.id)
        .filter((trackId): trackId is string => Boolean(trackId)),
    ).size >= 2,
  )

  // Retiming commands over the drag's refs: the refs keep an in-flight gesture
  // (and its preview frame) alive while the commands are rebuilt with new inputs.
  const selectionRetime = $derived(
    createMotionSelectionRetimeCommands({
      state: {
        dragRef: selectionRetimeDragRef,
        pendingFrameRef: pendingSelectionRetimeFrameRef,
        animationFrameRef: selectionRetimeAnimationFrameRef,
      },
      deps: {
        durationInFrames,
        visibleFrameRange,
        selection: motionSelectionDragState,
        selectionTimeRange: motionSelectionTimeRange,
        itemById,
        getRuler: () => motionRuler,
        getScrollArea: () => motionScrollArea,
        getRangeElement: () => motionSelectionRetimeRange,
        getTimeViewport: () => timeViewportRef.current,
      },
    }),
  )

  function nudgeSelectionRetime(edge: 'start' | 'end', deltaFrames: number) {
    if (!motionSelectionDragState || !motionSelectionTimeRange || deltaFrames === 0) return
    const snapshot = captureSnapshot()
    const currentEdgeFrame =
      edge === 'start' ? motionSelectionTimeRange.startFrame : motionSelectionTimeRange.endFrame
    applyMotionSelectionFrameUpdates(
      buildMotionSelectionRetimeUpdates(
        motionSelectionDragState,
        itemById,
        edge,
        currentEdgeFrame + deltaFrames,
        durationInFrames,
      ),
    )
    useTimelineCommandStore.getState().addUndoEntry({ type: 'MOVE_KEYFRAME_GRAPH', payload: {} }, snapshot)
    useTimelineSettingsStore.getState().markDirty()
  }

  $effect(() => () => {
    if (selectionRetimeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(selectionRetimeAnimationFrameRef.current)
    }
    const drag = selectionRetimeDragRef.current
    if (drag) restoreMotionSelectionRetimeVisuals(drag, true)
    pendingSelectionRetimeFrameRef.current = null
    selectionRetimeDragRef.current = null
  })
  const motionRows: MotionRow[] = $derived(buildMotionRows(layerEntries, tracks))
  const visibleLayerIds = $derived(
    motionRows.flatMap((row) => (row.kind === 'layer' ? [row.item.id] : [])),
  )

  $effect(() => {
    if (!activeCompositionId) return
    pruneCompositionLayers(
      activeCompositionId,
      layerEntries.map((entry) => entry.item.id),
    )
  })

  $effect(() => {
    const curve = activeInlineCurve
    if (!curve) return
    const itemStillExists = layerEntries.some((entry) => entry.item.id === curve.itemId)
    if (!itemStillExists || !expandedLayerIdSet.has(curve.itemId)) {
      inlineCurve = null
    }
  })

  function updateLayerTrack(trackId: string, updates: Partial<TimelineTrack>) {
    const targetTrackIds = new Set([trackId])
    const item = items.find((candidate) => candidate.trackId === trackId)
    if (item) {
      const companion = getLinkedAudioCompanion(items, item)
      if (companion) targetTrackIds.add(companion.trackId)
    }
    setTracks(tracks.map((track) => (targetTrackIds.has(track.id) ? { ...track, ...updates } : track)))
  }

  // Shift-clicking any row's lock icon applies that row's next state to every
  // row — layers and layer groups alike — so "lock everything except this one"
  // is two clicks. Groups are included so a header can't read unlocked while its
  // children are locked; a locked group disables its children's buttons, so the
  // group row is the way back out.
  function setAllTracksLocked(locked: boolean) {
    setTracks(tracks.map((track) => (track.locked === locked ? track : { ...track, locked })))
  }

  // Selection and grouping are commands over the current selection and row
  // order; the anchor ref survives rebuilds so Shift ranges keep their origin.
  const layerSelection = $derived(
    createMotionLayerSelectionCommands({
      state: { anchorIdRef: selectionAnchorIdRef },
      deps: {
        selectedItemIds,
        selectedItemIdSet,
        visibleLayerIds,
        layerEntries,
        tracks,
        layerRowHeight: LAYER_ROW_HEIGHT,
        selectItems,
        formatGroupName: (groupNumber) => t('editor.compose.groupName', { count: groupNumber }),
      },
    }),
  )

  function beginRename(target: RenameTarget, name: string) {
    renameTarget = target
    renameDraft = name
  }

  function commitRename() {
    const target = renameTarget
    if (!target) return
    const name = renameDraft.trim()
    if (name) {
      if (target.kind === 'layer') {
        updateItem(target.id, { label: name })
        const item = items.find((candidate) => candidate.id === target.id)
        if (item) updateLayerTrack(item.trackId, { name })
      } else {
        updateLayerTrack(target.id, { name })
      }
    }
    renameTarget = null
    renameDraft = ''
  }

  const setRenameDraft = (value: string) => {
    renameDraft = value
  }
  const setRenameTarget = (target: RenameTarget | null) => {
    renameTarget = target
  }

  // Layer clipboard commands. Rebuilt when the data they read changes; the
  // clipboard itself lives in its own store and is read at call time.
  const layerClipboard = $derived(
    createMotionLayerClipboardCommands({
      items,
      tracks,
      trackById,
      compositionById,
      activeCompositionId,
      layerRowHeight: LAYER_ROW_HEIGHT,
      selectItems,
      expandLayerItemIds: expandMotionLayerItemIds,
    }),
  )

  // Span dragging is a command object over the component's drag refs, rebuilt
  // when its inputs change; the refs keep an in-flight drag (and its preview
  // frame) alive across rebuilds.
  const spanDrag = $derived(
    createMotionSpanDragCommands({
      state: {
        dragRef: spanDragRef,
        visualsRef: spanDragVisualsRef,
        animationFrameRef: spanDragAnimationFrameRef,
      },
      deps: {
        items,
        durationInFrames,
        visibleFrameRange,
        pause,
        selectLayer: layerSelection.selectLayer,
        selectItems,
        moveItems,
        expandLayerItemIds: expandMotionLayerItemIds,
        getScrollArea: () => motionScrollArea,
      },
    }),
  )
  const spanTrim = $derived(
    createMotionSpanTrimCommands({
      state: { trimRef: spanTrimRef, animationFrameRef: spanTrimAnimationFrameRef },
      deps: { durationInFrames, visibleFrameRange, pause, selectItems },
    }),
  )
  const rowReorder = createMotionRowReorderCommands({
    state: {
      dragRef: rowReorderDragRef,
      animationFrameRef: rowReorderAnimationFrameRef,
      pendingClientYRef: pendingRowReorderClientYRef,
    },
    deps: {
      setDrag: (drag) => {
        rowReorderDrag = drag
      },
    },
  })
  const isRowReordering = $derived(rowReorderDrag !== null)
  $effect(() => {
    if (!isRowReordering) return
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    return () => {
      document.body.style.cursor = previousCursor
    }
  })

  $effect(() => () => rowReorder.dispose())

  function addGeneratedLayer(kind: GeneratedLayerKind) {
    if (!composition || composition.editorKind !== 'composite-2d') return
    const trackId = crypto.randomUUID()
    const order = tracks.reduce((max, track) => Math.max(max, track.order), -1) + 1
    const placement = {
      trackId,
      from: 0,
      durationInFrames,
      canvasWidth: composition.width,
      canvasHeight: composition.height,
      fps,
    }
    const item = createGeneratedLayerItem(kind, placement)
    const track: TimelineTrack = {
      id: trackId,
      name: item.label || 'Layer',
      kind: 'video',
      height: LAYER_ROW_HEIGHT,
      locked: false,
      syncLock: true,
      visible: true,
      muted: false,
      solo: false,
      order,
      items: [],
    }
    addItemOnNewTrack(item, [...tracks, track])
    selectItems([item.id])
  }

  function insertCompositionLayer(compositionId: string, from: number): boolean {
    if (!activeCompositionId || !composition || composition.editorKind !== 'composite-2d') {
      return false
    }
    const latestItems = useItemsStore.getState().items
    const latestTracks = useItemsStore.getState().tracks
    const child = compositionById[compositionId]
    if (!child || child.id === activeCompositionId) return false
    const effectiveCompositionById = {
      ...compositionById,
      [activeCompositionId]: { ...composition, items: latestItems, tracks: latestTracks },
    }
    if (
      wouldCreateCompositionCycle({
        parentCompositionId: activeCompositionId,
        insertedCompositionId: child.id,
        compositionById: effectiveCompositionById,
      })
    ) {
      toast.error(t('editor.compose.compositionCycle'))
      return false
    }

    const layer = buildCompositionDropLayer({
      composition: child,
      tracks: latestTracks,
      from,
      durationInFrames,
    })
    if (!layer) return false
    addItemOnNewTrack(layer.item, [...latestTracks, layer.track])
    selectItems([layer.item.id])
    return true
  }

  async function handleDrop(event: SectionDragEvent) {
    event.preventDefault()
    dropActive = false
    if (!composition || composition.editorKind !== 'composite-2d') return

    const payload = resolveMotionDropPayload(
      event.dataTransfer?.getData('application/json') ?? '',
      getMediaDragData(),
    )
    clearMediaDragData()
    if (!payload) return

    const dropFrame = resolveMotionDropFrame({
      currentFrame: usePlaybackStore.getState().currentFrame,
      compositionEndFrame,
      durationInFrames,
    })
    const droppedCompositionId = resolveCompositionDropId(payload)
    if (droppedCompositionId) {
      insertCompositionLayer(droppedCompositionId, dropFrame)
      return
    }

    const latestTracks = useItemsStore.getState().tracks
    const nextOrder = latestTracks.reduce((max, track) => Math.max(max, track.order), -1) + 1
    const canvas = {
      width: composition.width,
      height: composition.height,
      fps,
    }
    const templateLayer = buildTemplateDropLayer({
      payload,
      nextOrder,
      dropFrame,
      durationInFrames,
      canvas,
    })
    if (templateLayer) {
      addItemOnNewTrack(templateLayer.item, [...latestTracks, templateLayer.track])
      selectItems([templateLayer.item.id])
      return
    }

    const entries = resolveDroppedMediaEntriesFromPayload(payload, mediaItems.current, logger)
    if (entries.length === 0) {
      toast.error(t('editor.compose.unsupportedDrop'))
      return
    }

    const layers = await buildDroppedMediaLayers({
      entries,
      nextOrder,
      dropFrame,
      durationInFrames,
      canvas,
    })
    if (layers.length === 0) {
      toast.error(t('editor.compose.mediaDropFailed'))
      return
    }

    addItemsOnNewTracks(
      layers.map((entry) => entry.item),
      [...latestTracks, ...layers.map((entry) => entry.track)],
    )
    selectItems(layers.map((entry) => entry.item.id))
  }

  function handleDragOver(event: SectionDragEvent) {
    const hasLayerPayload =
      getMediaDragData() !== null ||
      Array.from(event.dataTransfer?.types ?? []).includes('application/json')
    if (!hasLayerPayload) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    dropActive = true
  }

  function handleDragLeave(event: SectionDragEvent) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    dropActive = false
  }

  function frameFromClientX(clientX: number, surface: HTMLDivElement, viewport: MotionTimeViewport) {
    return resolveMotionFrameFromClientX({
      clientX,
      bounds: surface.getBoundingClientRect(),
      viewport,
      maxFrame: compositionEndFrame ?? durationInFrames,
    })
  }

  function runPlayheadScrubLoop(timestamp: number) {
    scrubAnimationFrame = null
    const pointerId = playheadScrubPointerId
    const clientX = playheadScrubClientX
    const surface = playheadScrubSurface
    const activeViewport = playheadScrubViewport
    if (pointerId === null || clientX === null || !surface || !activeViewport) return
    let viewport: MotionTimeViewport = activeViewport

    const rect = surface.getBoundingClientRect()
    const pan = advanceMotionScrubPan({
      viewport,
      clientX,
      bounds: rect,
      compositionEndFrame,
      durationInFrames,
      previousTimestamp: scrubAnimationTime,
      timestamp,
    })
    scrubAnimationTime = pan.clock
    viewport = pan.viewport
    if (pan.panning) playheadScrubViewport = pan.viewport

    const paint = resolveMotionScrubFramePaint({
      frame: frameFromClientX(clientX, surface, viewport),
      latestFrame: latestScrubFrame,
      viewport,
      committedViewport: timeViewportRef.current,
      clientX,
      bounds: rect,
    })
    if (paint.frame !== null) {
      latestScrubFrame = paint.frame
      setPreviewFrame(paint.frame)
    }
    // Keep the drag visual locked to the pointer. The preview frame remains
    // integer-quantized, which otherwise produces a visible sawtooth while
    // the viewport itself advances by fractional frames.
    if (paint.viewport) previewMotionTimeViewport(paint.viewport, paint.progress)

    if (pan.panning) {
      scrubAnimationFrame = requestAnimationFrame(runPlayheadScrubLoop)
    }
  }

  $effect(() => {
    const navigationRoot = motionViewportPreviewRoot
    if (!navigationRoot) return
    return viewportController.attach(navigationRoot)
  })

  $effect(() => {
    const scrollArea = motionScrollArea
    if (!scrollArea) return

    const finishMiddlePan = () => {
      if (!middlePan) return
      middlePan = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    const beginMiddlePan = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (middlePan) return
      middlePan = {
        startClientY: event.clientY,
        startScrollTop: scrollArea.scrollTop,
      }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }

    const moveMiddlePan = (event: MouseEvent | PointerEvent) => {
      const pan = middlePan
      if (!pan) return
      event.preventDefault()
      event.stopPropagation()
      scrollArea.scrollTop = pan.startScrollTop + (event.clientY - pan.startClientY)
    }

    const preventMiddleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
    }

    scrollArea.addEventListener('pointerdown', beginMiddlePan, { capture: true })
    scrollArea.addEventListener('mousedown', beginMiddlePan, { capture: true })
    scrollArea.addEventListener('auxclick', preventMiddleAuxClick, { capture: true })
    window.addEventListener('pointermove', moveMiddlePan, { capture: true })
    window.addEventListener('mousemove', moveMiddlePan, { capture: true })
    window.addEventListener('pointerup', finishMiddlePan, { capture: true })
    window.addEventListener('pointercancel', finishMiddlePan, { capture: true })
    window.addEventListener('mouseup', finishMiddlePan, { capture: true })
    return () => {
      finishMiddlePan()
      scrollArea.removeEventListener('pointerdown', beginMiddlePan, { capture: true })
      scrollArea.removeEventListener('mousedown', beginMiddlePan, { capture: true })
      scrollArea.removeEventListener('auxclick', preventMiddleAuxClick, { capture: true })
      window.removeEventListener('pointermove', moveMiddlePan, { capture: true })
      window.removeEventListener('mousemove', moveMiddlePan, { capture: true })
      window.removeEventListener('pointerup', finishMiddlePan, { capture: true })
      window.removeEventListener('pointercancel', finishMiddlePan, { capture: true })
      window.removeEventListener('mouseup', finishMiddlePan, { capture: true })
    }
  })

  function beginPlayheadScrub(event: DivPointerEvent) {
    if (event.button !== 0) return
    playheadScrubPointerId = event.pointerId
    playheadScrubClientX = event.clientX
    playheadScrubSurface = event.currentTarget
    playheadScrubViewport = timeViewportRef.current
    scrubAnimationTime = null
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pause()
    const frame = frameFromClientX(event.clientX, event.currentTarget, timeViewportRef.current)
    if (frame !== null) {
      latestScrubFrame = frame
      setPreviewFrame(frame)
    }
    if (scrubAnimationFrame === null) {
      scrubAnimationFrame = requestAnimationFrame(runPlayheadScrubLoop)
    }
  }

  function movePlayheadScrub(event: DivPointerEvent) {
    if (playheadScrubPointerId !== event.pointerId) return
    playheadScrubClientX = event.clientX
    if (scrubAnimationFrame !== null) return
    scrubAnimationFrame = requestAnimationFrame(runPlayheadScrubLoop)
  }

  function endPlayheadScrub(event: DivPointerEvent) {
    if (playheadScrubPointerId !== event.pointerId) return
    playheadScrubPointerId = null
    if (scrubAnimationFrame !== null) {
      cancelAnimationFrame(scrubAnimationFrame)
      scrubAnimationFrame = null
    }
    const surface = playheadScrubSurface
    const committedViewport = timeViewportRef.current
    const release = resolveMotionScrubRelease({
      clientX: event.clientX,
      bounds: resolveMotionScrubReleaseBounds({
        cancelled: event.type === 'pointercancel',
        surface,
      }),
      viewport: playheadScrubViewport ?? committedViewport,
      committedViewport,
      compositionEndFrame,
      durationInFrames,
      latestFrame: latestScrubFrame,
    })
    latestScrubFrame = null
    scrubAnimationTime = null
    playheadScrubClientX = null
    playheadScrubSurface = null
    playheadScrubViewport = null
    if (release.frame !== null) setScrubFrame(release.frame)
    setPreviewFrame(null)
    if (release.viewport) commitMotionTimeViewport(release.viewport)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }

  $effect(() => () => {
    if (scrubAnimationFrame !== null) {
      cancelAnimationFrame(scrubAnimationFrame)
    }
    scrubAnimationTime = null
    playheadScrubClientX = null
    playheadScrubSurface = null
    playheadScrubViewport = null
    setPreviewFrame(null)
  })

  // The property rows take React's Dispatch<SetStateAction>: a value or an updater.
  function setAllPathVertexItemIds(next: Set<string> | ((previous: Set<string>) => Set<string>)) {
    allPathVertexItemIds = typeof next === 'function' ? next(allPathVertexItemIds) : next
  }
  function setInlineCurve(
    next: InlineCurveState | null | ((previous: InlineCurveState | null) => InlineCurveState | null),
  ) {
    inlineCurve = typeof next === 'function' ? next(inlineCurve) : next
  }
</script>

{#snippet groupRow(row: Extract<MotionRow, { kind: 'group' }>)}
  {@const { groupSelected, groupFrom, groupEnd, groupItemIds, groupTrackIds, isDragging } =
    buildMotionGroupRowModel({ row, tracks, selectedItemIdSet, rowReorderDrag })}
  <div
    data-motion-row-track-id={row.track.id}
    data-motion-parent-track-id=""
    class={cn('relative border-b border-border/70', isDragging && 'z-30 opacity-85 shadow-lg')}
  >
    <MotionRowContextMenu
      canPaste={canPasteLayers}
      onOpen={() => layerSelection.prepareGroupContextMenu(groupItemIds)}
      onRename={() => beginRename({ kind: 'group', id: row.track.id }, row.track.name)}
      onUngroup={() => layerSelection.ungroupTracks(row.track.id)}
      onDuplicate={() => layerClipboard.duplicate(groupItemIds, row.track)}
      onCopy={() => layerClipboard.copy(groupItemIds)}
      onPaste={() => layerClipboard.paste(row.track.id)}
      onDelete={() => layerClipboard.delete(groupItemIds, [row.track.id, ...groupTrackIds])}
      deleteLabel={t('editor.compose.deleteLayerGroupAndContents')}
    >
      {#snippet children({ props })}
        <div
          {...props}
          class={cn('flex bg-panel-header/65 transition-colors', groupSelected && 'bg-accent/70')}
          style:height="{LAYER_ROW_HEIGHT}px"
          data-testid="motion-group-{row.track.id}"
        >
          <MotionGroupNameCell
            track={row.track}
            layerCount={row.items.length}
            {groupItemIds}
            {renameTarget}
            {renameDraft}
            t={tf}
            {rowReorder}
            {updateLayerTrack}
            {setAllTracksLocked}
            selectGroupItems={selectItems}
            ungroup={layerSelection.ungroupTracks}
            {beginRename}
            {commitRename}
            {setRenameDraft}
            {setRenameTarget}
          />
          <MotionGroupLaneCell
            track={row.track}
            {groupItemIds}
            {groupFrom}
            {groupEnd}
            {activeInlineCurve}
            {frameToMotionPercent}
            {visibleFrameRange}
            {spanDrag}
            {beginPlayheadScrub}
            {movePlayheadScrub}
            {endPlayheadScrub}
          />
        </div>
      {/snippet}
    </MotionRowContextMenu>
  </div>
{/snippet}

{#if !isComposite || !composition || !activeCompositionId}
  <section
    class={cn(
      'flex min-h-0 flex-1 flex-col border-t border-border bg-timeline-bg transition-shadow',
      dropActive && 'ring-1 ring-inset ring-primary/60',
      className,
    )}
    data-testid="compositing-timeline-empty"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <div
      class="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel-header px-3 text-xs font-semibold text-muted-foreground"
    >
      <Spline class="h-3.5 w-3.5 text-primary" />
      <span class="min-w-0 flex-1">{t('editor.compose.layerTimeline')}</span>
      <button
        type="button"
        onclick={() => (createDialogOpen = true)}
        class="flex h-6 items-center gap-1 rounded bg-primary/10 px-2 text-[10px] text-primary hover:bg-primary/20"
      >
        <Plus class="h-3 w-3" />
        {t('editor.compose.newComposition')}
      </button>
    </div>
    <div
      class="flex min-h-0 flex-1 items-center justify-center bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:10%_100%]"
    >
      <div class="max-w-sm text-center">
        <p class="text-xs font-medium text-foreground">
          {t('editor.compose.chooseTitle')}
        </p>
        <p class="mt-1 text-[10px] leading-4 text-muted-foreground">
          {t('editor.compose.chooseDescription')}
        </p>
      </div>
    </div>
  </section>
  <NewCompositionDialog
    open={createDialogOpen}
    onOpenChange={(open) => (createDialogOpen = open)}
    defaults={dialogDefaults}
  />
{:else}
  {@const compositionId = activeCompositionId}
  {@const activeComposition = composition}
  <section
    class={cn(
      'flex min-h-0 flex-1 overflow-hidden border-t border-border transition-shadow',
      dropActive && 'ring-1 ring-inset ring-primary/60',
      className,
    )}
    data-testid="compositing-timeline"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-timeline-bg">
      <div class="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-panel-header px-2">
        <Select
          value={activeComposition.id}
          onValueChange={(value) => {
            const next = compositionById[value]
            if (next) openComposition(next.id, next.name)
          }}
        >
          <SelectTrigger
            aria-label={t('editor.compose.compositionPicker')}
            class="h-6 min-w-0 max-w-52 gap-1.5 bg-background px-2 text-[10px] font-semibold text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {#each compositeCompositions as candidate (candidate.id)}
              <SelectItem value={candidate.id} class="text-[10px]">
                {candidate.name}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
        <button
          type="button"
          onclick={() => (createDialogOpen = true)}
          class="flex h-6 shrink-0 items-center gap-1 rounded border border-border/70 bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('editor.compose.newComposition')}
          aria-label={t('editor.compose.newComposition')}
        >
          <CopyPlus class="h-3 w-3" />
          {t('editor.compose.newCompositionShort')}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="flex h-6 shrink-0 items-center gap-1 rounded border border-border/70 bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('editor.compose.addItem')}
              >
                <Plus class="h-3 w-3" />
                {t('editor.compose.addItem')}
                <ChevronDown class="h-2.5 w-2.5" />
              </button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="min-w-36">
            <DropdownMenuItem onSelect={() => addGeneratedLayer('text')}>
              <Type class="mr-2 h-3.5 w-3.5" />
              {t('editor.compose.textLayer')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addGeneratedLayer('solid')}>
              <Square class="mr-2 h-3.5 w-3.5 fill-current" />
              {t('editor.compose.solidColorLayer')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addGeneratedLayer('gradient')}>
              <Blend class="mr-2 h-3.5 w-3.5" />
              {t('editor.compose.gradientLayer')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addGeneratedLayer('shape')}>
              <Square class="mr-2 h-3.5 w-3.5" />
              {t('editor.compose.shapeLayer')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addGeneratedLayer('controller')}>
              <Crosshair class="mr-2 h-3.5 w-3.5" />
              {t('editor.compose.controllerLayer', { defaultValue: 'Null Object' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onclick={layerSelection.createGroupFromSelection}
          disabled={!canGroupSelectedLayers}
          class="flex h-6 shrink-0 items-center gap-1 rounded border border-border/70 bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label={t('editor.compose.groupSelected')}
          {...{ 'aria-description': t('editor.compose.layerGroupDescription') }}
          title={t('editor.compose.layerGroupDescription')}
        >
          <Group class="h-3 w-3" />
          {t('editor.compose.group')}
        </button>
        <span class="flex-1" aria-hidden="true"></span>
        <span class="text-[10px] tabular-nums text-muted-foreground" data-testid="motion-composition-duration"
          >{compositionEndFrame ?? durationInFrames}f · {fps}fps</span
        >
        <button
          type="button"
          onclick={trimAndFitMotionTimeViewport}
          disabled={!canTrimToActiveRegion}
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label={t('editor.compose.trimToActiveRegion')}
          data-tooltip={t('editor.compose.trimToActiveRegionTooltip')}
        >
          <Crop class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onclick={fitMotionTimeViewport}
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('timeline.header.zoomToFit')}
          data-tooltip={t('timeline.header.zoomToFitTooltip')}
        >
          <Maximize2 class="h-3.5 w-3.5" />
        </button>
      </div>

      <div bind:this={motionViewportPreviewRoot} class="relative min-h-0 flex-1">
        <div class="pointer-events-none absolute inset-0 z-30 overflow-visible" data-testid="motion-playhead-overlay">
          <div
            data-motion-viewport-surface
            class="absolute inset-y-0 right-0 overflow-visible"
            style:left="{TIMELINE_CONTENT_LEFT + KEYFRAME_EDGE_INSET}px"
            style:right="{KEYFRAME_EDGE_INSET + motionScrollbarWidth}px"
          >
            <!-- Region shading covers the layer rows only — the ruler carries its
                 own comp bar — and paints before the playhead so the playhead
                 stays legible over a dimmed region. -->
            <div class="absolute inset-x-0 bottom-0" style:top="{RULER_HEIGHT}px">
              <MotionActiveRegionOverlay viewport={timeViewport} {compositionEndFrame} />
            </div>
            <MotionPlayheadOverlay {timeViewport} />
          </div>
        </div>
        <div
          bind:this={motionScrollArea}
          data-testid="motion-layer-scroll-area"
          class="h-full overflow-x-hidden overflow-y-auto [content-visibility:auto]"
        >
          <div class="relative min-h-full w-full min-w-0">
            <div class="sticky top-0 z-20 flex border-b border-border bg-panel-header">
              <div
                class="flex shrink-0 border-r border-border text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                style:width="{LAYER_COLUMN_WIDTH}px"
                style:height="{RULER_HEIGHT}px"
              >
                <div class="flex min-w-0 flex-1 items-center justify-between gap-2 px-3">
                  <span>{t('editor.compose.layers')}</span>
                  <Select
                    value={propertyFilter}
                    onValueChange={(value) => (propertyFilter = value as 'all' | 'keyframed')}
                  >
                    <SelectTrigger
                      aria-label="Property filter"
                      class="h-5 w-28 gap-1 bg-background px-2 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" class="text-[10px]">All properties</SelectItem>
                      <SelectItem value="keyframed" class="text-[10px]">Animated properties</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div
                  data-testid="motion-parent-header"
                  class="flex shrink-0 items-center border-l border-border px-2"
                  style:width="{LAYER_PARENT_COLUMN_WIDTH}px"
                >
                  {t('editor.compose.parentColumn', { defaultValue: 'Parent' })}
                </div>
                <div
                  data-testid="motion-timing-header"
                  class="flex shrink-0 items-center justify-around border-l border-border px-2"
                  style:width="{LAYER_TIMING_COLUMN_WIDTH}px"
                >
                  <span>{t('editor.compose.inColumn')}</span>
                  <span>{t('editor.compose.outColumn')}</span>
                </div>
                <div
                  class="flex shrink-0 items-center border-l border-border px-2"
                  style:width="{LAYER_MODE_COLUMN_WIDTH}px"
                >
                  {t('editor.compose.blendMode')}
                </div>
              </div>
              <div
                data-testid="motion-ruler-viewport"
                data-motion-viewport-surface
                class="relative min-w-0 flex-1 touch-none cursor-ew-resize overflow-x-clip overflow-y-visible"
                style:height="{RULER_HEIGHT}px"
              >
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  bind:this={motionRuler}
                  data-motion-viewport-surface
                  data-motion-ruler-surface
                  class="absolute inset-0"
                  onpointerdown={beginPlayheadScrub}
                  onpointermove={movePlayheadScrub}
                  onpointerup={endPlayheadScrub}
                  onpointercancel={endPlayheadScrub}
                >
                  {#each { length: RULER_DIVISIONS + 1 } as _, index (index)}
                    {@const frame = Math.round(
                      timeViewport.startFrame + (index / RULER_DIVISIONS) * visibleFrameRange,
                    )}
                    <div
                      class="absolute inset-y-0 border-l border-border/70"
                      style:left="{(index / RULER_DIVISIONS) * 100}%"
                    >
                      <span data-motion-ruler-label-index={index} class="ml-1 text-[9px] tabular-nums text-muted-foreground"
                        >{formatFrameTime(frame, fps)}</span
                      >
                    </div>
                  {/each}
                  <MotionSelectionRetimeRange
                    range={motionSelectionTimeRange}
                    viewport={timeViewport}
                    {durationInFrames}
                    frameToPercent={frameToMotionPercent}
                    onBegin={(event, edge) => selectionRetime.begin(event, edge)}
                    onMove={(event) => selectionRetime.move(event)}
                    onEnd={(event) => selectionRetime.end(event)}
                    onCancel={(event) => selectionRetime.cancel(event)}
                    onNudge={nudgeSelectionRetime}
                    bind:rangeElement={motionSelectionRetimeRange}
                  />
                </div>
                {#if compositionEndFrame !== null}
                  <MotionCompEndRulerDim viewport={timeViewport} {compositionEndFrame} />
                {/if}
                <!-- Sibling of the scrub surface, not a child: the lane's own
                     background stays pointer-transparent so a click in the lane
                     still scrubs, while the strip and handles take their hits. -->
                <MotionIoLane viewport={timeViewport} maxFrame={compositionEndFrame ?? durationInFrames} {fps} />
              </div>
            </div>

            {#if motionRows.length === 0}
              <div class="flex h-32 items-center justify-center text-xs text-muted-foreground">
                <Plus class="mr-2 h-3.5 w-3.5" />
                {t('editor.compose.emptyLayers')}
              </div>
            {:else}
              {#each motionRows as row, index (row.kind === 'group' ? row.track.id : row.item.id)}
                {#if row.kind === 'group'}
                  {@render groupRow(row)}
                {:else}
                  {@const { item, track, depth } = row}
                  {@const model = buildMotionLayerRowModel({
                    item,
                    track,
                    layerEntries,
                    itemKeyframes: keyframesByItemId[item.id],
                    trackById,
                    expandedLayerIdSet,
                    selectedItemIdSet,
                    allPathVertexItemIds,
                    maskEditingItemId,
                    selectedPathVertexIndices,
                    activeInlineCurve,
                    propertyFilter,
                    rowReorderDrag,
                    t: tf,
                  })}
                  <div
                    data-testid="motion-layer-row-{item.id}"
                    data-motion-layer-item-id={item.id}
                    data-motion-row-track-id={track?.id}
                    data-motion-parent-track-id={track?.parentTrackId ?? ''}
                    class={cn(
                      'relative border-b border-border/70',
                      model.isDragging && 'z-30 opacity-85 shadow-lg',
                      'data-[transform-parent-link-hover=true]:bg-orange-500/10 data-[transform-parent-link-hover=true]:ring-1 data-[transform-parent-link-hover=true]:ring-inset data-[transform-parent-link-hover=true]:ring-orange-400/70',
                      'data-[transform-parent-link-rejected=true]:bg-red-500/10 data-[transform-parent-link-rejected=true]:ring-1 data-[transform-parent-link-rejected=true]:ring-inset data-[transform-parent-link-rejected=true]:ring-red-400/70',
                    )}
                  >
                    <MotionRowContextMenu
                      canGroup={canGroupSelectedLayers}
                      canPaste={canPasteLayers}
                      onOpen={() => layerSelection.prepareLayerContextMenu(item.id)}
                      onRename={() => beginRename({ kind: 'layer', id: item.id }, item.label || item.type)}
                      onGroup={layerSelection.createGroupFromSelection}
                      onDuplicate={() => layerClipboard.duplicate([item.id])}
                      onCopy={() => layerClipboard.copy([item.id])}
                      onPaste={() => layerClipboard.paste(track?.parentTrackId)}
                      onDelete={() => layerClipboard.delete([item.id], track ? [track.id] : [])}
                    >
                      {#snippet children({ props })}
                        <div
                          {...props}
                          class={cn('flex transition-colors', model.selected ? 'bg-accent/70' : 'hover:bg-accent/35')}
                          style:height="{LAYER_ROW_HEIGHT}px"
                        >
                          <div class="flex shrink-0 border-r border-border" style:width="{LAYER_COLUMN_WIDTH}px">
                            <MotionLayerNameCell
                              {item}
                              {index}
                              {depth}
                              {track}
                              LayerTypeIcon={model.LayerTypeIcon}
                              activeCompositionId={compositionId}
                              {layerEntries}
                              expanded={model.expanded}
                              hasVisibleChildProperties={model.hasVisibleChildProperties}
                              isLayerLocked={model.isLayerLocked}
                              isParentLayerGroupLocked={model.isParentLayerGroupLocked}
                              nullObjectNonRenderingLabel={model.nullObjectNonRenderingLabel}
                              {renameTarget}
                              {renameDraft}
                              t={tf}
                              {rowReorder}
                              {layerSelection}
                              {updateLayerTrack}
                              {setAllTracksLocked}
                              {toggleLayerExpanded}
                              {setAllLayersExpanded}
                              {beginRename}
                              {commitRename}
                              {setRenameDraft}
                              {setRenameTarget}
                            />
                            <MotionLayerParentCell
                              {item}
                              parentItemId={model.parentItemId}
                              parentCandidates={model.parentCandidates}
                              isLayerLocked={model.isLayerLocked}
                              {itemById}
                              {keyframesByItemId}
                              canvas={transformParentCanvas}
                              t={tf}
                              beginTransformParentDrag={transformParent.begin}
                            />
                            <MotionLayerTimingCell
                              {item}
                              isLayerLocked={model.isLayerLocked}
                              {durationInFrames}
                              t={tf}
                              {updateItem}
                            />
                            <MotionLayerModeCell {item} isLayerLocked={model.isLayerLocked} t={tf} {updateItem} />
                          </div>
                          <MotionLayerLane
                            {item}
                            isLayerLocked={model.isLayerLocked}
                            selected={model.selected}
                            {selectedItemIds}
                            {activeInlineCurve}
                            hasProceduralMotion={model.hasProceduralMotion}
                            {durationInFrames}
                            {frameToMotionPercent}
                            {visibleFrameRange}
                            t={tf}
                            {spanDrag}
                            {spanTrim}
                            {beginPlayheadScrub}
                            {movePlayheadScrub}
                            {endPlayheadScrub}
                          />
                        </div>
                      {/snippet}
                    </MotionRowContextMenu>

                    <MotionLayerPropertyRows
                      {item}
                      expanded={model.expanded}
                      isLayerLocked={model.isLayerLocked}
                      isPathShape={model.isPathShape}
                      showAllPathVertices={model.showAllPathVertices}
                      {maskEditingItemId}
                      {selectedPathVertexIndices}
                      {setAllPathVertexItemIds}
                      textMotionBands={model.textMotionBands}
                      {timeViewport}
                      {itemById}
                      itemKeyframes={keyframesByItemId[item.id]}
                      properties={model.properties}
                      {durationInFrames}
                      {fps}
                      canvas={activeComposition}
                      {propertyFilter}
                      {activeInlineCurve}
                      activeCompositionId={compositionId}
                      {selectItems}
                      {setInlineCurve}
                      {pause}
                      {setScrubFrame}
                      {updateTimeViewport}
                      beginPropertyLinkDrag={propertyLink.begin}
                      handleRemovePropertyLink={propertyLink.remove}
                      {handleSetPropertyExpression}
                      {handleRemovePropertyExpression}
                    />
                  </div>
                {/if}
              {/each}
            {/if}
          </div>
        </div>
        {#if activeInlineCurve && activeCurveItem}
          {@const curveItem = activeCurveItem}
          <div
            data-testid="motion-graph-pane"
            class="absolute bottom-0 right-0 z-25 overflow-hidden border-l border-border bg-background"
            style:left="{TIMELINE_CONTENT_LEFT}px"
            style:top="{RULER_HEIGHT}px"
          >
            <MotionDopesheetLanes
              item={curveItem}
              {itemById}
              itemKeyframes={keyframesByItemId[curveItem.id]}
              disabled={isActiveCurveLocked}
              properties={activeCurveProperties}
              compositionDurationInFrames={durationInFrames}
              {fps}
              canvas={activeComposition}
              {propertyFilter}
              {timeViewport}
              inlineCurveProperty={activeInlineCurve.property}
              paneMode="graph"
              onSelectItem={(itemId: string) => selectItems([itemId])}
              onInlineCurveChange={(property: InlineCurveState['property'] | null) => {
                inlineCurve = property ? { compositionId, itemId: curveItem.id, property } : null
              }}
              onScrub={(frame: number) => {
                pause()
                setScrubFrame(frame)
              }}
              onTimeViewportChange={updateTimeViewport}
              onPropertyLinkPointerDown={propertyLink.begin}
              onRemovePropertyLink={propertyLink.remove}
              onSetPropertyExpression={handleSetPropertyExpression}
              onRemovePropertyExpression={handleRemovePropertyExpression}
            />
          </div>
        {/if}
      </div>
      <div class="flex h-5 shrink-0 bg-background/80">
        <div class="shrink-0 border-r border-t border-border" style:width="{LAYER_COLUMN_WIDTH}px"></div>
        <div
          bind:this={motionTimeNavigator}
          class="relative min-w-0 flex-1"
          data-testid="motion-time-navigator"
          data-start-frame={timeViewport.startFrame}
          data-end-frame={timeViewport.endFrame}
        >
          <MotionCompactNavigator
            viewport={timeViewport}
            contentFrameMax={durationInFrames}
            minVisibleFrames={Math.min(10, durationInFrames)}
            onViewportChange={commitMotionTimeViewport}
            onViewportPreviewStart={viewportController.prepareNavigatorPreview}
            onViewportPreview={previewMotionTimeViewport}
          />
          <div class="pointer-events-none absolute inset-x-2 bottom-1 top-[5px] overflow-hidden rounded-sm">
            <div
              data-testid="motion-navigator-frame-axis-overlay"
              class="absolute inset-y-0 overflow-hidden"
              style:left="{KEYFRAME_EDGE_INSET}px"
              style:right="{KEYFRAME_EDGE_INSET}px"
            >
              <MotionActiveRegionOverlay
                viewport={{ startFrame: 0, endFrame: durationInFrames }}
                {compositionEndFrame}
                testId="motion-navigator-active-region-overlay"
                compositionEndTestId="motion-navigator-comp-end-dim"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
  {#if propertyLink.drag}
    <PropertyLinkPickWhipOverlay drag={propertyLink.drag} />
  {/if}
  {#if transformParent.drag}
    <TransformParentPickWhipOverlay drag={transformParent.drag} />
  {/if}
  <NewCompositionDialog
    open={createDialogOpen}
    onOpenChange={(open) => (createDialogOpen = open)}
    defaults={dialogDefaults}
  />
{/if}
