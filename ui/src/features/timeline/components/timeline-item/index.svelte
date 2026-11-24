<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import { select, shallow } from '$lib/store.svelte'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { addEffects, updateItem } from '@/features/timeline/stores/timeline-actions'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useEditPreviewShifts } from './use-edit-preview-shifts.svelte'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useEditorStore } from '@/shared/state/editor'
  import { useTimelineDrag } from '../../hooks/use-timeline-drag.svelte'
  import { useTimelineTrim } from '../../hooks/use-timeline-trim.svelte'
  import { useTrackPush } from '../../hooks/use-track-push.svelte'
  import { isRateStretchableItem, useRateStretch } from '../../hooks/use-rate-stretch.svelte'
  import { useTimelineSlipSlide } from '../../hooks/use-timeline-slip-slide.svelte'
  import { ClipContent } from './clip-content'
  import { ClipIndicators } from './clip-indicators'
  import TrimHandles from './trim-handles.svelte'
  import StretchHandles from './stretch-handles.svelte'
  import { ZoomGatedJoinIndicators } from './join-indicators'
  import SegmentStatusOverlays from './segment-status-overlays.svelte'
  import { getTimelineItemGestureMode } from './drag-visual-mode'
  import { useDragVisualState } from './use-drag-visual-state.svelte'
  import { useTimelineItemActions } from './use-timeline-item-actions.svelte'
  import { useTimelineItemDropHandlers } from './use-timeline-item-drop-handlers.svelte'
  import ItemContextMenu from './item-context-menu.svelte'
  import { useSmartTrimHover } from './use-smart-trim-hover.svelte'
  import { useContextMenuState } from './use-context-menu-state.svelte'
  import { useRollHoverStore } from '@/features/timeline/stores/roll-hover-store'
  import { useTimelineItemBounds } from './use-timeline-item-bounds.svelte'
  import { useFadeEditors } from './use-fade-editors.svelte'
  import { useFadeMath } from './use-fade-math.svelte'
  import { getClipCursorClass } from './clip-cursor'
  import { useActiveGlobalCursor } from './use-active-global-cursor.svelte'
  import { useClipNeighbors } from './use-clip-neighbors.svelte'
  import { useToolOperationOverlay } from './use-tool-operation-overlay.svelte'
  import { useLinkedSyncPreview } from './use-linked-sync-preview.svelte'
  import { useClipReadoutLabels } from './use-clip-readout-labels.svelte'
  import {
    useTimelineItemPointerHandlers,
    type TimelineItemPointerHint,
  } from './use-timeline-item-pointer-handlers.svelte'
  import { resolveTrimVisualState } from './timeline-item-view-model'
  import ClipFloatingLayer from './clip-floating-layer.svelte'
  import { useEffectDropTarget } from './use-effect-drop-target.svelte'
  import { useTransitionDropPreview } from './use-transition-drop-preview.svelte'
  import TransitionDropZones from './transition-drop-zones.svelte'
  import { buildTimelineItemContextMenuProps } from './build-context-menu-props'
  import {
    AudioFadeHandleLayer,
    FadeEnvelopeOverlay,
    VideoFadeHandleLayer,
  } from './fade-envelope-overlay'
  import {
    resolveCompactClipInteraction,
    shouldUseCompactClipShell,
    useAudioVolumeEditLabel,
  } from './use-compact-shell.svelte'
  import { EMPTY_LINKED_ITEMS, useItemMetadata } from './use-item-metadata.svelte'
  import TimelineItemShell from './timeline-item-shell.svelte'
  import DetailOnlyLayers from './detail-only-layers.svelte'
  import { getFramePositionStyle, getTrackPushZoneStyle } from './timeline-item-geometry'

  interface TimelineItemProps {
    item: TimelineItemType
    timelineDuration?: number
    trackLocked?: boolean
    trackHidden?: boolean
    isCompactWidth: boolean
    isDetailEligible: boolean
    onHoverChange?: (itemId: string, hovered: boolean) => void
  }

  /**
   * Timeline Item Component
   *
   * Renders an individual item on the timeline with full interaction support:
   * - Positioned based on start frame (from)
   * - Width based on duration in frames
   * - Visual styling based on item type
   * - Selection state
   * - Click to select
   * - Drag to move (horizontal and vertical)
   * - Trim handles (start/end) for media trimming
   * - Grid snapping support
   */
  let {
    item,
    timelineDuration = 30,
    trackLocked = false,
    trackHidden = false,
    isCompactWidth,
    isDetailEligible,
    onHoverChange,
  }: TimelineItemProps = $props()

  // Granular selector: only re-render when THIS item's selection state changes
  const isSelected = $derived(
    select(useSelectionStore, (s) => s.selectedItemIdSet.has(item.id)),
  )
  const keyframesExpanded = $derived(
    select(useSelectionStore, (s) => s.expandedKeyframeLanes.has(item.id)),
  )

  const metadata = useItemMetadata(() => item)

  const activeTool = select(useSelectionStore, (s) => s.activeTool)

  // Read through the store so handlers see the current tool without recreating callbacks
  const activeToolRef = {
    get current() {
      return activeTool.current
    },
  }

  // When an adjacent item enters roll mode, this item's edge should glow too
  const rollHoverEdge = $derived(
    select(useRollHoverStore, (s) => (s.neighborItemId === item.id ? s.neighborEdge : null)),
  )
  const effectDropTarget = useEffectDropTarget(() => item.id)

  const contextMenuState = useContextMenuState(() => item)

  // Track blocked drag attempt tooltip (shown on mousedown in rate-stretch mode)
  let pointerHint = $state.raw<TimelineItemPointerHint | null>(null)

  // Hide drag blocked tooltip on mouseup
  $effect(() => {
    if (!pointerHint) return
    const handleMouseUp = () => {
      pointerHint = null
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  })

  let transform = $state<HTMLDivElement | null>(null)
  let ghost = $state<HTMLDivElement | null>(null)

  // Drag-and-drop functionality (local state for anchor item) - disabled if track is locked
  const drag = useTimelineDrag(
    () => item,
    () => timelineDuration,
    () => trackLocked,
    () => transform,
  )

  // Trim functionality - disabled if track is locked
  const trim = useTimelineTrim(
    () => item,
    () => timelineDuration,
    () => trackLocked,
  )

  // Rate stretch functionality - disabled if track is locked
  const stretch = useRateStretch(
    () => item,
    () => timelineDuration,
    () => trackLocked,
  )

  // Slip/Slide functionality - disabled if track is locked
  const slipSlide = useTimelineSlipSlide(
    () => item,
    () => timelineDuration,
    () => trackLocked,
  )

  // Track push functionality - move clip + downstream items to close/open gaps
  const trackPush = useTrackPush(
    () => item,
    () => timelineDuration,
    () => trackLocked,
  )

  useActiveGlobalCursor(() => ({
    isTrimming: trim.isTrimming,
    trimHandle: trim.trimHandle,
    isRollingEdit: trim.isRollingEdit,
    isRippleEdit: trim.isRippleEdit,
    isStretching: stretch.isStretching,
    isSlipSlideActive: slipSlide.isSlipSlideActive,
    slipSlideMode: slipSlide.slipSlideMode,
    isTrackPushActive: trackPush.isTrackPushActive,
  }))

  const gestureMode = $derived(
    getTimelineItemGestureMode({
      isTrimming: trim.isTrimming,
      isRollingEdit: trim.isRollingEdit,
      isRippleEdit: trim.isRippleEdit,
      isStretching: stretch.isStretching,
      isSlipSlideActive: slipSlide.isSlipSlideActive,
      slipSlideMode: slipSlide.slipSlideMode,
    }),
  )

  const dragVisual = useDragVisualState(() => ({
    item,
    gestureMode,
    isDragging: drag.isDragging,
    transform,
    ghost,
  }))

  const smartTrim = useSmartTrimHover(() => ({
    item,
    trackLocked,
    activeTool: activeTool.current,
    activeToolRef,
    isAnyDragActiveRef: dragVisual.isAnyDragActiveRef,
  }))

  // Get FPS for frame-to-time conversion
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const updateTimelineItem = updateItem
  // O(1) via index instead of O(n) getLinkedItems scan.
  const linkedItemsForSync = $derived(
    select(
      useItemsStore,
      (s) => {
        const linkedItems = s.linkedItemsByItemId[item.id]
        if (!linkedItems || linkedItems.length <= 1) return EMPTY_LINKED_ITEMS
        return linkedItems.filter((linked) => linked.id !== item.id)
      },
      shallow,
    ),
  )

  const editPreviewShifts = useEditPreviewShifts(() => ({
    item,
    linkedItemsForSync: linkedItemsForSync.current,
    isDragging: drag.isDragging,
    isPartOfDrag: dragVisual.isPartOfDrag,
    gestureMode,
  }))

  // Get visual feedback for rate stretch
  const stretchFeedback = $derived(stretch.isStretching ? stretch.getVisualFeedback() : null)

  // Check if this clip supports rate stretch (video/audio/composition/GIF)
  const isRateStretchItem = $derived(isRateStretchableItem(editPreviewShifts.previewBaseItem))

  // Current speed for badge display
  const currentSpeed = $derived(editPreviewShifts.previewBaseItem.speed || 1)

  const transitionDropPreview = useTransitionDropPreview(() => ({
    itemId: item.id,
    previewBaseItem: editPreviewShifts.previewBaseItem,
  }))

  const bounds = useTimelineItemBounds(() => ({
    previewBaseItem: editPreviewShifts.previewBaseItem,
    fps: fps.current,
    isTrimming: trim.isTrimming,
    trimHandle: trim.trimHandle,
    trimDelta: trim.trimDelta,
    isStretching: stretch.isStretching,
    stretchFeedback,
    isSlipSlideActive: slipSlide.isSlipSlideActive,
    slipEditDelta: editPreviewShifts.slipEditDelta,
    slideEditOffset: editPreviewShifts.slideEditOffset,
    slideNeighborSide: editPreviewShifts.slideNeighborSide,
    slideNeighborDelta: editPreviewShifts.slideNeighborDelta,
    slideLeftNeighborForSlidItem: editPreviewShifts.slideLeftNeighborForSlidItem,
    slideRightNeighborForSlidItem: editPreviewShifts.slideRightNeighborForSlidItem,
    rollingEditDelta: editPreviewShifts.rollingEditDelta,
    rollingEditHandle: editPreviewShifts.rollingEditHandle,
    rippleEditOffset: editPreviewShifts.rippleEditOffset,
    rippleEdgeDelta: editPreviewShifts.rippleEdgeDelta,
    trackPushOffset: editPreviewShifts.trackPushOffset,
  }))
  const toolOperationOverlay = useToolOperationOverlay(() => ({
    item,
    fps: fps.current,
    visualLeft: bounds.visualLeft,
    visualWidth: bounds.visualWidth,
    isTrimming: trim.isTrimming,
    trimHandle: trim.trimHandle,
    trimConstrained: trim.trimConstrained,
    isRollingEdit: trim.isRollingEdit,
    isRippleEdit: trim.isRippleEdit,
    isStretching: stretch.isStretching,
    stretchHandle: stretch.stretchHandle,
    stretchConstrained: stretch.stretchConstrained,
    isSlipSlideActive: slipSlide.isSlipSlideActive,
    slipSlideMode: slipSlide.slipSlideMode,
    slipSlideConstraintEdge: slipSlide.slipSlideConstraintEdge,
    slipSlideConstrained: slipSlide.slipSlideConstrained,
    slideLeftNeighborForSlidItem: editPreviewShifts.slideLeftNeighborForSlidItem,
    slideRightNeighborForSlidItem: editPreviewShifts.slideRightNeighborForSlidItem,
    slideRange: editPreviewShifts.slideRange,
    isLinkedSlideCompanion: editPreviewShifts.isLinkedSlideCompanion,
    isLinkedSlipCompanion: editPreviewShifts.isLinkedSlipCompanion,
    contentPreviewItem: bounds.contentPreviewItem,
    previewBaseItem: editPreviewShifts.previewBaseItem,
  }))

  // Active edge state for halo rendering (trim, roll, slip, slide, stretch),
  // plus handle cursor classes and ripple tones for the trim overlay.
  const trimVisual = $derived(
    resolveTrimVisualState({
      isTrimming: trim.isTrimming,
      trimHandle: trim.trimHandle,
      trimConstrained: trim.trimConstrained,
      isRollingEdit: trim.isRollingEdit,
      rollingEditHandle: editPreviewShifts.rollingEditHandle,
      rollingEditConstrained: editPreviewShifts.rollingEditConstrained,
      isSlipSlideActive: slipSlide.isSlipSlideActive,
      slipSlideConstrained: slipSlide.slipSlideConstrained,
      slipSlideConstraintEdge: slipSlide.slipSlideConstraintEdge,
      isLinkedSlipCompanion: editPreviewShifts.isLinkedSlipCompanion,
      isLinkedSlideCompanion: editPreviewShifts.isLinkedSlideCompanion,
      isStretching: stretch.isStretching,
      stretchHandle: stretch.stretchHandle,
      stretchConstrained: stretch.stretchConstrained,
      smartTrimIntent: smartTrim.smartTrimIntent,
      isRippleEdit: trim.isRippleEdit,
    }),
  )

  const pointerHandlers = useTimelineItemPointerHandlers(() => ({
    item,
    trackLocked,
    activeTool: activeTool.current,
    activeToolRef,
    smartTrimIntentRef: smartTrim.smartTrimIntentRef,
    smartBodyIntent: smartTrim.smartBodyIntent,
    dragWasActiveRef: dragVisual.dragWasActiveRef,
    isTrimming: trim.isTrimming,
    isStretching: stretch.isStretching,
    isSlipSlideActive: slipSlide.isSlipSlideActive,
    hoveredEdge: smartTrim.hoveredEdge,
    handleDragStart: drag.handleDragStart,
    handleSlipSlideStart: slipSlide.handleSlipSlideStart,
    handleStretchStart: stretch.handleStretchStart,
    handleTrimStart: trim.handleTrimStart,
    setPointerHint: (hint) => {
      pointerHint = hint
    },
  }))

  // Cursor class based on state
  const cursorClass = $derived(
    getClipCursorClass({
      trackLocked,
      activeTool: activeTool.current,
      smartTrimIntent: smartTrim.smartTrimIntent,
      smartBodyIntent: smartTrim.smartBodyIntent,
      hoveredEdge: smartTrim.hoveredEdge,
      itemType: item.type,
      isBeingDragged: dragVisual.isBeingDragged,
    }),
  )

  // Reactive neighbor detection: recompute join indicators when adjacent items
  // change (covers deletion, moves to another track, and position shifts).
  // Uses itemsByTrackId for O(trackItems) instead of O(allItems) lookup.
  const neighbors = useClipNeighbors(() => item)

  const actions = useTimelineItemActions(() => ({
    item,
    isBroken: metadata.isBroken,
    leftNeighbor: neighbors.leftNeighbor,
    rightNeighbor: neighbors.rightNeighbor,
    segmentOverlays: metadata.segmentOverlays,
  }))

  const dropHandlers = useTimelineItemDropHandlers(() => ({
    item,
    trackLocked,
    addEffects,
  }))

  const fadeEditors = useFadeEditors(() => ({
    item,
    fps: fps.current,
    activeTool: activeTool.current,
    trackLocked,
    isAnyDragActiveRef: dragVisual.isAnyDragActiveRef,
    transform,
    updateTimelineItem,
  }))
  const compactInteraction = $derived(
    resolveCompactClipInteraction({
      isCompactWidth,
      isBeingDragged: dragVisual.isBeingDragged,
      isPartOfDrag: dragVisual.isPartOfDrag,
      isTrimming: trim.isTrimming,
      isStretching: stretch.isStretching,
      isSlipSlideActive: slipSlide.isSlipSlideActive,
      isTrackPushActive: trackPush.isTrackPushActive,
      isEffectDropTarget: effectDropTarget.isEffectDropTarget,
      videoFadeEdit: fadeEditors.videoFadeEdit,
      audioFadeEdit: fadeEditors.audioFadeEdit,
      audioFadeCurveEdit: fadeEditors.audioFadeCurveEdit,
      audioVolumeEdit: fadeEditors.audioVolumeEdit,
      transitionDropGhost: transitionDropPreview.transitionDropGhost,
      draggedTransition: transitionDropPreview.draggedTransition,
      pointerHint,
      hoveredEdge: smartTrim.hoveredEdge,
      smartTrimIntent: smartTrim.smartTrimIntent,
      smartBodyIntent: smartTrim.smartBodyIntent,
      rollHoverEdge: rollHoverEdge.current,
      activeEdges: trimVisual.activeEdges,
    }),
  )
  const clipFadeDurationFrames = $derived(Math.max(1, Math.round(bounds.visualWidthFrames)))
  const fadeMath = useFadeMath(() => ({
    item,
    fps: fps.current,
    isVisualFadeItem: fadeEditors.isVisualFadeItem,
    isSelected: isSelected.current,
    audioVolumeEditActive: fadeEditors.audioVolumeEdit !== null,
    skipFadeComputation: compactInteraction.skipFadeComputation,
    clipFadeDurationFrames,
    displayedVideoFadeIn: fadeEditors.displayedVideoFadeIn,
    displayedVideoFadeOut: fadeEditors.displayedVideoFadeOut,
    displayedAudioFadeIn: fadeEditors.displayedAudioFadeIn,
    displayedAudioFadeOut: fadeEditors.displayedAudioFadeOut,
    displayedAudioFadeInCurve: fadeEditors.displayedAudioFadeInCurve,
    displayedAudioFadeOutCurve: fadeEditors.displayedAudioFadeOutCurve,
    displayedAudioFadeInCurveX: fadeEditors.displayedAudioFadeInCurveX,
    displayedAudioFadeOutCurveX: fadeEditors.displayedAudioFadeOutCurveX,
    displayedAudioVolumeDb: fadeEditors.displayedAudioVolumeDb,
  }))
  const audioVolumeEditLabel = useAudioVolumeEditLabel(() => ({
    skipFadeComputation: compactInteraction.skipFadeComputation,
    audioVolumeEdit: fadeEditors.audioVolumeEdit,
    audioVolumePreviewRef: fadeEditors.audioVolumePreviewRef,
  }))
  const linkedSyncPreview = useLinkedSyncPreview(() => ({
    contentPreviewItem: bounds.contentPreviewItem,
    videoFadeEdit: fadeEditors.videoFadeEdit,
    linkedItemsForSync: linkedItemsForSync.current,
    fps: fps.current,
    linkedSelectionEnabled: metadata.linkedSelectionEnabled,
    linkedEditPreviewActive: editPreviewShifts.linkedEditPreviewUpdate !== null,
    isDragging: drag.isDragging,
    isPartOfDrag: dragVisual.isPartOfDrag,
    isTrimming: trim.isTrimming,
    isStretching: stretch.isStretching,
    isSlipSlideActive: slipSlide.isSlipSlideActive,
    trimHandle: trim.trimHandle,
    trimDelta: trim.trimDelta,
    rollingEditDelta: editPreviewShifts.rollingEditDelta,
    rollingEditHandle: editPreviewShifts.rollingEditHandle,
    rippleEditOffset: editPreviewShifts.rippleEditOffset,
    rippleEdgeDelta: editPreviewShifts.rippleEdgeDelta,
    slipEditDelta: editPreviewShifts.slipEditDelta,
    slideEditOffset: editPreviewShifts.slideEditOffset,
    slideFromOffset: bounds.slideFromOffset,
    slideNeighborSide: editPreviewShifts.slideNeighborSide,
    slideNeighborDelta: editPreviewShifts.slideNeighborDelta,
    moveDragPreviewFromDelta: editPreviewShifts.moveDragPreviewFromDelta,
    linkedSyncPreviewUpdatesById: editPreviewShifts.linkedSyncPreviewUpdatesById,
  }))
  const isCompactClipShell = $derived(
    shouldUseCompactClipShell({
      item,
      isBroken: metadata.isBroken,
      hasKeyframes: metadata.hasKeyframes,
      currentSpeed,
      linkedSyncOffsetFrames: linkedSyncPreview.linkedSyncOffsetFrames,
      activeTool: activeTool.current,
      isCompactWidth,
      hasActiveClipInteraction: compactInteraction.hasActiveClipInteraction,
    }),
  )
  const readoutLabels = useClipReadoutLabels(() => ({
    fps: fps.current,
    isTrimming: trim.isTrimming,
    trimHandle: trim.trimHandle,
    trimDelta: trim.trimDelta,
    visualWidthFrames: bounds.visualWidthFrames,
    isDragging: drag.isDragging,
    dragOffsetX: drag.dragOffset.x,
  }))

  const contextMenuProps = $derived(
    buildTimelineItemContextMenuProps({
      item,
      trackLocked,
      isBroken: metadata.isBroken,
      isSelected: isSelected.current,
      hasSpeakableText: actions.hasSpeakableText,
      hasGeneratedCaptions: metadata.hasGeneratedCaptions,
      keyframedProperties: metadata.keyframedProperties,
      closerEdge: contextMenuState.closerEdge,
      hasJoinableLeft: neighbors.hasJoinableLeft,
      hasJoinableRight: neighbors.hasJoinableRight,
      reverseMenuShowsUnreverse: metadata.reverseMenuShowsUnreverse,
      isRemovingFillers: actions.isRemovingFillers,
      isCompositionItem: actions.isCompositionItem,
      isSceneDetectionActive: actions.isSceneDetectionActive,
      caption: metadata.caption,
      getCanJoinSelected: actions.getCanJoinSelected,
      getCanLinkSelected: actions.getCanLinkSelected,
      getCanUnlinkSelected: actions.getCanUnlinkSelected,
      handleJoinSelected: actions.handleJoinSelected,
      handleJoinLeft: actions.handleJoinLeft,
      handleJoinRight: actions.handleJoinRight,
      handleLinkSelected: actions.handleLinkSelected,
      handleUnlinkSelected: actions.handleUnlinkSelected,
      handleClearAllKeyframes: actions.handleClearAllKeyframes,
      handleClearPropertyKeyframes: actions.handleClearPropertyKeyframes,
      handleBentoLayout: actions.handleBentoLayout,
      handleReverseSelected: actions.handleReverseSelected,
      handleFreezeFrame: actions.handleFreezeFrame,
      handleGenerateAudioFromText: actions.handleGenerateAudioFromText,
      handleRemoveSilence: actions.handleRemoveSilence,
      handleRemoveFillers: actions.handleRemoveFillers,
      handleCreatePreComp: actions.handleCreatePreComp,
      handleEnterComposition: actions.handleEnterComposition,
      handleDissolveComposition: actions.handleDissolveComposition,
      handleDetectScenes: actions.handleDetectScenes,
      handleRippleDelete: actions.handleRippleDelete,
      handleDelete: actions.handleDelete,
    }),
  )

  function handleKeyframesToggle() {
    useSelectionStore.getState().toggleKeyframeLanes(item.id)
  }

  function handleMotionOpen() {
    useSelectionStore.getState().selectItems([item.id])
    useEditorStore.getState().setRightSidebarOpen(true)
    useEditorStore.getState().setClipInspectorTab('motion')
  }
</script>

{#if !editPreviewShifts.isHiddenByLinkedEditPreview}
  <ItemContextMenu {...contextMenuProps} {item}>
    <TimelineItemShell
      bind:transform
      itemId={item.id}
      itemType={item.type}
      fps={fps.current}
      visualLeftFrame={bounds.visualLeftFrame}
      visualWidthFrames={bounds.visualWidthFrames}
      isSelected={isSelected.current}
      isCompactShell={isCompactClipShell}
      isBeingDragged={dragVisual.isBeingDragged}
      isStretching={stretch.isStretching}
      isAltDrag={dragVisual.isAltDrag}
      isDragging={drag.isDragging}
      dragOffset={drag.dragOffset}
      shouldDimForDrag={dragVisual.shouldDimForDrag}
      {trackHidden}
      {trackLocked}
      itemColorClasses={metadata.itemColorClasses}
      {cursorClass}
      audioVolumeEdit={fadeEditors.audioVolumeEdit}
      audioVolumePreviewRef={fadeEditors.audioVolumePreviewRef}
      audioVolumeLineYPercent={fadeMath.audioVolumeLineYPercent}
      audioVisualizationScale={fadeMath.audioVisualizationScale}
      isEffectDropTarget={effectDropTarget.isEffectDropTarget}
      multiEffectDropTargetCount={effectDropTarget.multiEffectDropTargetCount}
      {onHoverChange}
      onClick={pointerHandlers.handleClick}
      onDoubleClick={pointerHandlers.handleDoubleClick}
      onMouseDown={pointerHandlers.handleMouseDown}
      onMouseMove={smartTrim.handleMouseMove}
      onMouseLeave={smartTrim.handleMouseLeave}
      onContextMenu={contextMenuState.handleContextMenu}
      onDragEnter={dropHandlers.handleEffectDragEnter}
      onDragOver={dropHandlers.handleEffectDragOver}
      onDragLeave={dropHandlers.handleEffectDragLeave}
      onDrop={dropHandlers.handleEffectDrop}
    >
      <div class="absolute inset-px rounded-[3px] overflow-hidden">
        <DetailOnlyLayers isCompactShell={isCompactClipShell}>
          <SegmentStatusOverlays overlays={metadata.segmentOverlays} />

          <FadeEnvelopeOverlay
            itemType={item.type}
            isVisualFadeItem={fadeEditors.isVisualFadeItem}
            videoControlsRef={fadeEditors.videoControlsRef}
            audioControlsRef={fadeEditors.audioControlsRef}
            volumeLineRef={fadeEditors.volumeLineRef}
            videoFadeInRatio={fadeMath.videoFadeInRatio}
            videoFadeOutRatio={fadeMath.videoFadeOutRatio}
            videoFadeInPath={fadeMath.videoFadeInPath}
            videoFadeOutPath={fadeMath.videoFadeOutPath}
            audioFadeInRatio={fadeMath.audioFadeInRatio}
            audioFadeOutRatio={fadeMath.audioFadeOutRatio}
            audioFadeInCurvePath={fadeMath.audioFadeInCurvePath}
            audioFadeOutCurvePath={fadeMath.audioFadeOutCurvePath}
            audioVolumeLineYPercent={fadeMath.audioVolumeLineYPercent}
            audioVolumeLineStroke={fadeMath.audioVolumeLineStroke}
          />
        </DetailOnlyLayers>

        <ClipContent
          item={linkedSyncPreview.contentVisualPreviewItem}
          clipLeftFrames={bounds.visualLeftFrame}
          clipWidthFrames={bounds.visualWidthFrames}
          fps={fps.current}
          {isCompactWidth}
          isLinked={metadata.isLinked}
          preferImmediateRendering={bounds.preferImmediateContentRendering}
          audioWaveformScale={fadeMath.audioVisualizationScale}
          linkedSyncOffsetFrames={linkedSyncPreview.linkedSyncOffsetFrames}
          {isDetailEligible}
        />

        <!-- Status indicators -->
        <DetailOnlyLayers isCompactShell={isCompactClipShell}>
          <ClipIndicators
            hasKeyframes={metadata.hasKeyframes}
            keyframesExpanded={keyframesExpanded.current}
            hasMotion={metadata.hasMotion}
            {currentSpeed}
            isReversed={item.isReversed === true}
            reverseConformStatus={item.reverseConformStatus}
            isStretching={stretch.isStretching}
            {stretchFeedback}
            isBroken={metadata.isBroken}
            hasMediaId={!!item.mediaId}
            isMask={item.type === 'shape' ? (item.isMask ?? false) : false}
            isShape={item.type === 'shape'}
            onKeyframesToggle={handleKeyframesToggle}
            onMotionOpen={handleMotionOpen}
          />
        </DetailOnlyLayers>
      </div>

      <!-- Fade, trim and rate-stretch affordances -->
      <DetailOnlyLayers isCompactShell={isCompactClipShell}>
        <VideoFadeHandleLayer
          isVisualFadeItem={fadeEditors.isVisualFadeItem}
          {trackLocked}
          activeTool={activeTool.current}
          lineYPercent={fadeMath.videoFadeLineYPercent}
          fadeInRatio={fadeMath.videoFadeInRatio}
          fadeOutRatio={fadeMath.videoFadeOutRatio}
          isSelected={isSelected.current}
          videoFadeEdit={fadeEditors.videoFadeEdit}
          fadeInLabel={fadeMath.videoFadeInHoverLabel}
          fadeOutLabel={fadeMath.videoFadeOutHoverLabel}
          onFadeHandleMouseDown={fadeEditors.handleVideoFadeHandleMouseDown}
          onFadeHandleDoubleClick={fadeEditors.handleVideoFadeHandleDoubleClick}
        />

        <AudioFadeHandleLayer
          itemType={item.type}
          {trackLocked}
          activeTool={activeTool.current}
          lineYPercent={fadeMath.audioVolumeLineYPercent}
          fadeInRatio={fadeMath.audioFadeInRatio}
          fadeOutRatio={fadeMath.audioFadeOutRatio}
          isSelected={isSelected.current}
          audioFadeEdit={fadeEditors.audioFadeEdit}
          audioFadeCurveEdit={fadeEditors.audioFadeCurveEdit}
          audioVolumeEdit={fadeEditors.audioVolumeEdit}
          fadeInLabel={fadeMath.audioFadeInHoverLabel}
          fadeOutLabel={fadeMath.audioFadeOutHoverLabel}
          fadeInCurvePoint={fadeMath.audioFadeInCurvePoint}
          fadeOutCurvePoint={fadeMath.audioFadeOutCurvePoint}
          volumeEditLabel={audioVolumeEditLabel.current}
          volumeEditLabelRef={fadeEditors.audioVolumeEditLabelRef}
          onFadeHandleMouseDown={fadeEditors.handleAudioFadeHandleMouseDown}
          onFadeHandleDoubleClick={fadeEditors.handleAudioFadeHandleDoubleClick}
          onFadeCurveDotMouseDown={fadeEditors.handleAudioFadeCurveDotMouseDown}
          onFadeCurveDotDoubleClick={fadeEditors.handleAudioFadeCurveDotDoubleClick}
          onVolumeMouseDown={fadeEditors.handleAudioVolumeMouseDown}
          onVolumeDoubleClick={fadeEditors.handleAudioVolumeDoubleClick}
        />

        <!-- Trim handles -->
        <TrimHandles
          {trackLocked}
          isAnyDragActive={dragVisual.isAnyDragActiveRef.current}
          isTrimming={trim.isTrimming}
          trimHandle={trim.trimHandle}
          activeTool={activeTool.current}
          hoveredEdge={smartTrim.hoveredEdge}
          smartTrimIntent={smartTrim.smartTrimIntent}
          rollHoverEdge={rollHoverEdge.current}
          activeEdges={trimVisual.activeEdges}
          startCursorClass={trimVisual.startCursorClass}
          endCursorClass={trimVisual.endCursorClass}
          startTone={trimVisual.startTone}
          endTone={trimVisual.endTone}
          hasJoinableLeft={neighbors.hasJoinableLeft}
          hasJoinableRight={neighbors.hasJoinableRight}
          onTrimStart={pointerHandlers.handleSmartTrimStart}
          onJoinLeft={actions.handleJoinLeft}
          onJoinRight={actions.handleJoinRight}
        />

        <!-- Rate stretch handles -->
        <StretchHandles
          {trackLocked}
          isAnyDragActive={dragVisual.isAnyDragActiveRef.current}
          isStretching={stretch.isStretching}
          stretchHandle={stretch.stretchHandle}
          stretchConstrained={stretch.stretchConstrained}
          {isRateStretchItem}
          onStretchStart={stretch.handleStretchStart}
        />
      </DetailOnlyLayers>

      <!-- The zoom threshold is gated at the track boundary so crossing it only
           updates the indicator leaves, not every full TimelineItem. -->
      <ZoomGatedJoinIndicators
        hasJoinableLeft={neighbors.hasJoinableLeft}
        hasJoinableRight={neighbors.hasJoinableRight}
        {trackLocked}
        dragAffectsJoin={dragVisual.dragAffectsJoin}
        hoveredEdge={smartTrim.hoveredEdge}
        isTrimming={trim.isTrimming}
        isStretching={stretch.isStretching}
        isBeingDragged={dragVisual.isBeingDragged}
      />

      <TransitionDropZones
        itemType={item.type}
        {trackLocked}
        isCompactShell={isCompactClipShell}
        isTransitionDragActive={transitionDropPreview.draggedTransition !== null}
        hitWidth={transitionDropPreview.transitionDropHitWidth}
        onCutDragOver={dropHandlers.handleTransitionCutDragOver}
        onCutDragLeave={dropHandlers.handleTransitionCutDragLeave}
        onCutDrop={dropHandlers.handleTransitionCutDrop}
      />
    </TimelineItemShell>
  </ItemContextMenu>

  <ClipFloatingLayer
    {transform}
    bind:ghost
    showFollowerDragGhost={dragVisual.isAltDrag}
    visualLeftFrame={bounds.visualLeftFrame}
    visualWidthFrames={bounds.visualWidthFrames}
    dragOffset={drag.dragOffset}
    trimInfoLabel={readoutLabels.trimInfoLabel}
    moveInfoLabel={readoutLabels.moveInfoLabel}
    trackPushEnabled={neighbors.hasGapBefore && !trackLocked && activeTool.current === 'trim-edit'}
    isTrackPushActive={trackPush.isTrackPushActive}
    trackPushClipLeftStyle={getFramePositionStyle(bounds.visualLeftFrame)}
    trackPushZoneStyle={getTrackPushZoneStyle(neighbors.gapBeforeFrames)}
    onTrackPushStart={trackPush.handleTrackPushStart}
    toolOperationOverlay={toolOperationOverlay.current}
    activeEdges={trimVisual.activeEdges}
    transitionDropGhost={transitionDropPreview.transitionDropGhost}
    left={bounds.left}
    width={bounds.width}
    {pointerHint}
    itemMediaId={item.mediaId}
    hasGeneratedCaptions={metadata.hasGeneratedCaptions}
    caption={metadata.caption}
    onGenerateCaption={actions.handleCaptionsFromDialog}
  />
{/if}
