<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { AnimatableProperty, DirectPropertyLink } from '@/types/keyframe'
  import type { CompoundPropertyInputConfig } from './compound-property-inputs'
  import type { DopesheetEditorProps } from './dopesheet-editor-props'

  // Stable empty fallbacks so timeline cells don't see fresh `[]` refs.
  const EMPTY_PROPERTY_GROUP_IDS: readonly string[] = []
  const EMPTY_HIDDEN_PROPERTIES: readonly AnimatableProperty[] = []
  const EMPTY_COMPOUND_ROWS: Partial<Record<AnimatableProperty, CompoundPropertyInputConfig>> = {}
  const EMPTY_COMPOUND_SECONDARIES: Partial<Record<AnimatableProperty, AnimatableProperty>> = {}
  const EMPTY_DIMENSION_SEPARATION: NonNullable<
    DopesheetEditorProps['dimensionSeparationByProperty']
  > = {}
  const EMPTY_SELECTION = new Set<string>()
  const EMPTY_SNAP_FRAMES: readonly number[] = []
  const EMPTY_PROPERTY_VALUES: Partial<Record<AnimatableProperty, number>> = {}
  const EMPTY_LINKS: readonly DirectPropertyLink[] = []
  const EMPTY_LINK_LABELS: NonNullable<DopesheetEditorProps['linkedTransformSourceLabels']> = {}
  const EMPTY_EXPRESSIONS: NonNullable<DopesheetEditorProps['propertyExpressions']> = []
  const EMPTY_INTERPOLATION_OPTIONS: NonNullable<DopesheetEditorProps['interpolationOptions']> = []
  const EMPTY_BLOCKED_RANGES: NonNullable<DopesheetEditorProps['transitionBlockedRanges']> = []
  const EMPTY_TEXT_MOTION_BANDS: NonNullable<DopesheetEditorProps['textMotionBands']> = []
  const EMPTY_PROPERTY_LABELS: NonNullable<DopesheetEditorProps['propertyLabels']> = {}
  const EMPTY_AXIS_CONSTRAINTS: NonNullable<DopesheetEditorProps['axisConstraintByProperty']> = {}

</script>

<script lang="ts">
  import type { Keyframe } from '@/types/keyframe'
  /**
   * Dopesheet Editor - timeline-style keyframe editor.
   * Shows keyframes across properties as draggable diamonds on a frame grid.
   */
  import type { TFunction } from 'i18next'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { useAutoKeyframeStore } from '@/features/keyframes/stores/auto-keyframe-store'
  import { stateRef, resolveSetState, type Ref, type SetState } from '../ref-state.svelte'

  import { useGraphViewState } from './use-graph-view-state.svelte'
  import { useHeaderFrameInputs } from './use-header-frame-inputs.svelte'
  import { usePropertyFilters } from './use-property-filters.svelte'
  import { useRulerScrub } from './use-ruler-scrub.svelte'
  import { useDopesheetMarquee } from './use-dopesheet-marquee.svelte'
  import { useDopesheetViewport } from './use-dopesheet-viewport.svelte'
  import { useDopesheetPropertyDerivations } from './use-dopesheet-property-derivations.svelte'
  import { useDopesheetNavigation } from './use-dopesheet-navigation.svelte'
  import { useDopesheetSheetMetrics } from './use-dopesheet-sheet-metrics.svelte'
  import { useDopesheetCoordinates } from './use-dopesheet-coordinates.svelte'
  import { useDopesheetSelectionMeta } from './use-dopesheet-selection-meta.svelte'
  import { useDopesheetGraphDisplay } from './use-dopesheet-graph-display.svelte'
  import { useDopesheetSheetStructure } from './use-dopesheet-sheet-structure.svelte'
  import { useDopesheetExpressionDock } from './use-dopesheet-expression-dock.svelte'
  import { useDopesheetFrameTargets } from './use-dopesheet-frame-targets.svelte'
  import { useDopesheetRowProps } from './use-dopesheet-row-props.svelte'
  import { useDopesheetTimingStrip } from './use-dopesheet-timing-strip.svelte'
  import {
    useDopesheetPointerDispatch,
    useLinkedTimelineWheelForwarding,
  } from './use-dopesheet-pointer-dispatch.svelte'
  import { useSelectionFrameActions } from './use-selection-frame-actions.svelte'
  import { usePropertyValueEditing } from './use-property-value-editing.svelte'
  import { useDopesheetRowActions } from './use-dopesheet-row-actions.svelte'
  import { useElementSize } from './use-element-size.svelte'
  import { useKeyframeDrag } from './use-keyframe-drag.svelte'
  import { useSheetPreviewDom } from './sheet-preview-dom'
  import { useLivePixelGeometrySync } from './use-live-pixel-geometry-sync.svelte'
  import { useDopesheetHotkeys } from './use-dopesheet-hotkeys.svelte'
  import { usePropertyExpressionEditor } from './use-property-expression-editor.svelte'
  import {
    DopesheetClassicPresentation,
    DopesheetEditorPresentation,
    DopesheetLanesPresentation,
  } from './dopesheet-presentation'
  import {
    affectedFrameRangeOverlayElement,
    graphPaneElement,
    playheadOverlayElement,
    rulerHeaderElement,
    sheetBodyElement,
    skimPlayheadOverlayElement,
    splitPlayheadOverlayElement,
  } from './dopesheet-pane-elements.svelte'
  import {
    buildDopesheetHeaderFrameInputs,
    hasDopesheetAffectedFrameRangeOverlay,
    type DopesheetPaneElementsState,
  } from './dopesheet-pane-elements'
  import {
    navigatorElement,
    timingStripElement,
    toolbarElement,
  } from './dopesheet-workspace-chrome.svelte'
  import type { DopesheetWorkspaceChromeState } from './dopesheet-workspace-chrome'
  import DopesheetSheetRows from './dopesheet-sheet-rows.svelte'
  import DopesheetPropertyColumn from './dopesheet-property-column.svelte'
  import DopesheetExpressionDockElement from './dopesheet-expression-dock-element.svelte'
  import type {
    DopesheetPropertyColumnProps,
    UseDopesheetSheetRowsOptions,
  } from './use-dopesheet-sheet-rows'
  import { computeKeyframeFrameBounds, formatDopesheetPropertyValue } from './dopesheet-helpers'
  import {
    EMPTY_AUTO_KEY_ENABLED_BY_PROPERTY,
    PROPERTY_COLUMN_WIDTH,
    SPACIOUS_PROPERTY_COLUMN_WIDTH,
  } from './dopesheet-constants'
  import type { DragState } from './dopesheet-types'

  let {
    frameViewport,
    onFrameViewportChange,
    clampViewportToContent = true,
    viewportInteractionEnabled = true,
    itemId,
    keyframesByProperty,
    selectedProperty = null,
    selectedKeyframeIds = EMPTY_SELECTION,
    currentFrame = 0,
    playheadFrame,
    playheadClampToItemBounds = true,
    globalFrame = null,
    itemFrom = 0,
    totalFrames = 300,
    affectedFrameRange,
    trimmedKeyframeCount = 0,
    onTrimAnimation,
    fps = 30,
    width = 600,
    height = 260,
    onKeyframeMove,
    onKeyframesMove,
    onBezierHandleMove,
    onSegmentEasingChange,
    onSelectionChange,
    additionalSnapFrames = EMPTY_SNAP_FRAMES,
    onSelectionFrameDelta,
    onPropertyChange,
    onCurveVisibilityChange,
    onActivePropertyChange,
    onScrub,
    onSkim,
    globalFrameToPixels,
    timelineScrollContainer,
    timelinePanBaseScrollLeft,
    timelinePanBasePixelsPerSecond,
    linkedTimelineViewportWidth,
    getTimelineLivePixelsPerSecond,
    onRulerEdgeScroll,
    scrubClampToItemBounds = true,
    scrubFrameBounds,
    onScrubStart,
    onScrubEnd,
    onDragStart,
    onDragEnd,
    onDragCancel,
    onAddKeyframe,
    onDuplicateKeyframes,
    propertyValues = EMPTY_PROPERTY_VALUES,
    hiddenPropertyRows = EMPTY_HIDDEN_PROPERTIES,
    compoundPropertyRows = EMPTY_COMPOUND_ROWS,
    compoundSecondaryProperties = EMPTY_COMPOUND_SECONDARIES,
    dimensionSeparationByProperty = EMPTY_DIMENSION_SEPARATION,
    onPropertyValueCommit,
    onPropertyValuePreview,
    propertyLinks,
    propertyLinkSourceLabels,
    onPropertyLinkPointerDown,
    onRemovePropertyLink,
    linkedTransformExpressions = EMPTY_LINKS,
    linkedTransformSourceLabels = EMPTY_LINK_LABELS,
    onLinkedTransformPointerDown,
    onRemoveLinkedTransform,
    propertyExpressions = EMPTY_EXPRESSIONS,
    preExpressionPropertyValues = EMPTY_PROPERTY_VALUES,
    resolveExpressionReference,
    onSetPropertyExpression,
    onRemovePropertyExpression,
    onExpressionDockHeightChange,
    onLaneContentHeightChange,
    initialExpandedGroups,
    onExpandedGroupsChange,
    onResetPropertiesToDefault,
    onRemoveKeyframes,
    onCopyKeyframes,
    onCutKeyframes,
    onPasteKeyframes,
    hasKeyframeClipboard = false,
    isKeyframeClipboardCut = false,
    selectedInterpolation,
    interpolationOptions = EMPTY_INTERPOLATION_OPTIONS,
    onInterpolationChange,
    interpolationDisabled = false,
    onNavigateToKeyframe,
    transitionBlockedRanges = EMPTY_BLOCKED_RANGES,
    proceduralPreview,
    motionModifiers,
    textMotionBands = EMPTY_TEXT_MOTION_BANDS,
    onTextMotionDurationDragStart,
    onTextMotionDurationCommit,
    onTextMotionDurationCancel,
    onTextMotionOffsetDragStart,
    onTextMotionOffsetCommit,
    onTextMotionOffsetCancel,
    onTextMotionBandClick,
    hasProceduralMotion = false,
    canBakeMotion = false,
    onBakeMotion,
    disabled = false,
    visualizationMode = 'dopesheet',
    graphMode = 'value',
    onGraphModeChange,
    speedGraphContent,
    spacious = false,
    inlinePropertyGroupIds = EMPTY_PROPERTY_GROUP_IDS,
    propertyLabels = EMPTY_PROPERTY_LABELS,
    axisConstraintByProperty = EMPTY_AXIS_CONSTRAINTS,
    presentation = 'editor',
    propertyColumnWidth,
    timelineGridDivisions,
    singleCurveMode = false,
    selectedCurveVisibleExternally = false,
    propertyFilter,
    proceduralFrameOffset = 0,
    proceduralDurationInFrames,
    initialVisibleGroupIds,
    showPlayhead = true,
    shortcutsEnabled = false,
    addKeyframeShortcutEnabled = false,
    shortcuts,
    class: className,
  }: DopesheetEditorProps = $props()

  const translate = t as TFunction
  const resolvedProceduralDurationInFrames = $derived(proceduralDurationInFrames ?? totalFrames)
  const resolvedPropertyLinks = $derived(propertyLinks ?? linkedTransformExpressions)
  const resolvedPropertyLinkSourceLabels = $derived(
    propertyLinkSourceLabels ?? linkedTransformSourceLabels,
  )
  const beginPropertyLink = $derived(onPropertyLinkPointerDown ?? onLinkedTransformPointerDown)
  const removePropertyLink = $derived(onRemovePropertyLink ?? onRemoveLinkedTransform)
  // `split` shows both panes at once. Derive per-pane visibility so the many
  // mode branches below read intent ("is the graph showing?") rather than an
  // exact mode, and the exclusive `dopesheet`/`graph` modes stay unchanged.
  const showSheetPane = $derived(visualizationMode !== 'graph')
  const showGraphPane = $derived(visualizationMode !== 'dopesheet')
  const isSplitView = $derived(visualizationMode === 'split')
  // Wider property column + value inputs when there is room (Animate workspace).
  const columnWidth = $derived(
    propertyColumnWidth ?? (spacious ? SPACIOUS_PROPERTY_COLUMN_WIDTH : PROPERTY_COLUMN_WIDTH),
  )
  const timelineRef = stateRef<HTMLDivElement | null>(null)
  const scrollAreaRef = stateRef<HTMLDivElement | null>(null)
  const graphPaneRef = stateRef<HTMLDivElement | null>(null)
  // Reads through to the latest committed selection, as React's render-time ref write did.
  const committedKeyframeSelectionRef: Ref<Set<string>> = {
    get current() {
      return selectedKeyframeIds
    },
    set current(_selection: Set<string>) {},
  }
  // The linked timeline's scroll surface in the `{ current }` shape the sheet hooks read.
  const timelineScrollContainerBox: Ref<HTMLElement | null> = {
    get current() {
      return timelineScrollContainer ?? null
    },
    set current(_element: HTMLElement | null) {},
  }
  const timelineScrollContainerRef = $derived(
    timelineScrollContainer === undefined ? undefined : timelineScrollContainerBox,
  )
  const snapEnabled = true
  const pickWhipRootRef = stateRef<HTMLDivElement | null>(null)
  const syncLivePixelGeometryRef: Ref<() => void> = { current: () => {} }
  const expression = usePropertyExpressionEditor(() => ({
    onExpressionDockHeightChange,
    pickWhipRootRef,
  }))
  const autoKeyEnabledSelection = $derived(
    select(
      useAutoKeyframeStore,
      (state) => state.enabledByItem[itemId] ?? EMPTY_AUTO_KEY_ENABLED_BY_PROPERTY,
    ),
  )
  const autoKeyEnabledByProperty = $derived(autoKeyEnabledSelection.current)
  const toggleAutoKeyframeEnabled = (id: string, property: AnimatableProperty) =>
    useAutoKeyframeStore.getState().toggleAutoKeyframeEnabled(id, property)
  let sheetPreviewFrames = $state.raw<Record<string, number> | null>(null)
  let sheetPreviewDuplicateKeyframeIds = $state.raw<string[] | null>(null)
  const setSheetPreviewFrames: SetState<Record<string, number> | null> = (next) => {
    sheetPreviewFrames = resolveSetState(next, sheetPreviewFrames)
  }
  const setSheetPreviewDuplicateKeyframeIds: SetState<string[] | null> = (next) => {
    sheetPreviewDuplicateKeyframeIds = resolveSetState(next, sheetPreviewDuplicateKeyframeIds)
  }

  const keyframeFrameBounds = $derived(computeKeyframeFrameBounds(keyframesByProperty))

  const viewportState = useDopesheetViewport(() => ({
    itemId,
    totalFrames,
    keyframeFrameBounds,
    frameViewport,
    onFrameViewportChange,
    clampToContent: clampViewportToContent,
  }))
  const viewport = $derived(viewportState.viewport)

  const timelineSize = useElementSize(
    () => timelineRef.current,
    () => ({ deps: [visualizationMode] }),
  )
  const sheetScrollSize = useElementSize(
    () => scrollAreaRef.current,
    () => ({ enabled: showSheetPane, deps: [visualizationMode] }),
  )

  const derivations = useDopesheetPropertyDerivations(() => ({
    keyframesByProperty,
    hiddenPropertyRows,
    inlinePropertyGroupIds,
    motionModifiers,
    proceduralDurationInFrames: resolvedProceduralDurationInFrames,
    proceduralFrameOffset,
  }))
  const graphView = useGraphViewState(() => ({
    itemId,
    availableProperties: derivations.availableProperties,
    graphableProperties: derivations.graphableProperties,
    selectedProperty,
    onPropertyChange,
    onActivePropertyChange,
  }))

  const filters = usePropertyFilters(() => ({
    allPropertyGroups: derivations.allPropertyGroups,
    availableProperties: derivations.availableProperties,
    initialVisibleGroupIds,
  }))
  const structure = useDopesheetSheetStructure(() => ({
    availableProperties: derivations.availableProperties,
    hiddenPropertyRowSet: derivations.hiddenPropertyRowSet,
    propertyGroupIdByProperty: derivations.propertyGroupIdByProperty,
    keyframedPropertyIds: derivations.keyframedPropertyIds,
    proceduralBandByProperty: derivations.proceduralBandByProperty,
    visibleGroups: filters.visibleGroups,
    propertyFilter,
    showKeyframedOnly: filters.showKeyframedOnly,
    resolvedPropertyLinks,
    keyframesByProperty,
    currentFrame,
    selectedProperty,
    allPropertyGroups: derivations.allPropertyGroups,
    initialExpandedGroups,
    onExpandedGroupsChange,
  }))

  // Shift-clicking any row's lock icon applies that row's next lock state to
  // every visible row, so "lock everything except this one" is two clicks.
  const setAllRowsLocked = (locked: boolean) => {
    filters.setGroupLocked(structure.visibleProperties, locked)
  }

  const resetParameterView = () => {
    filters.setShowKeyframedOnly(false)
    filters.setVisibleGroups(
      Object.fromEntries(derivations.allPropertyGroups.map((group) => [group.id, true])) as Record<
        string,
        boolean
      >,
    )
    structure.setAllGroupsExpanded(true)
  }

  const graphPaneSize = useElementSize(
    () => graphPaneRef.current,
    () => ({ enabled: showGraphPane, deps: [visualizationMode, structure.sheetRows.length] }),
  )

  const selectionMeta = useDopesheetSelectionMeta(() => ({
    sheetRowsStructure: structure.sheetRowsStructure,
    selectedKeyframeIds,
    currentFrame,
    globalFrame,
    isPropertyLocked: filters.isPropertyLocked,
    itemId,
  }))

  $effect(() => {
    const selectedCurveProperty = selectionMeta.selectedCurveProperty
    if (!showGraphPane || !selectedCurveProperty) {
      return
    }

    if (selectedProperty !== selectedCurveProperty) {
      onPropertyChange?.(selectedCurveProperty)
    }
    onActivePropertyChange?.(selectedCurveProperty)
  })

  const frameRange = $derived(Math.max(1, viewport.endFrame - viewport.startFrame))
  const metrics = useDopesheetSheetMetrics(() => ({
    width,
    columnWidth,
    timelineWidth: timelineSize.width,
    sheetScrollWidth: sheetScrollSize.width,
    showSheetPane,
    presentation,
    linkedTimelineViewportWidth,
    frameRange,
    fps,
    contentFrameMax: viewportState.contentFrameMax,
    minViewportFrames: viewportState.minViewportFrames,
    getTimelineLivePixelsPerSecond,
  }))

  const coords = useDopesheetCoordinates(() => ({
    viewport,
    effectiveTimelineWidth: metrics.effectiveTimelineWidth,
    timelineEdgeInset: metrics.timelineEdgeInset,
    timelineCellBorderWidth: metrics.timelineCellBorderWidth,
    timelineGridDivisions,
    timelineScrollContainerRef,
    sheetRowsStructure: structure.sheetRowsStructure,
    groupedSheetRows: structure.groupedSheetRows,
    presentation,
    textMotionBandCount: textMotionBands.length,
    inlinePropertyGroupIdSet: derivations.inlinePropertyGroupIdSet,
    expandedGroups: structure.expandedGroups,
    isPropertyLocked: filters.isPropertyLocked,
    affectedFrameRange,
    timelineRef,
    scrollAreaRef,
    currentFrame,
    scrubClampToItemBounds,
    scrubFrameBounds,
    totalFrames,
    frameRange,
  }))

  useLivePixelGeometrySync(() => ({
    syncLivePixelGeometryRef,
    rootRef: pickWhipRootRef,
    timelineScrollContainerRef,
    getTimelineLivePixelsPerSecond,
    timelinePanBaseScrollLeft,
    timelinePanBasePixelsPerSecond,
    timelinePixelsPerSecond: metrics.timelinePixelsPerSecond,
    fps,
    itemFrom,
    hasLinkedTimelineAxis: metrics.hasLinkedTimelineAxis,
    resyncDependencies: [coords.frameToX, coords.getRenderedKeyframeX, coords.ticks],
  }))

  $effect.pre(() => {
    if (presentation !== 'lanes') return
    onLaneContentHeightChange?.(coords.renderedSheetEntries.contentHeight)
  })

  const frameTargets = useDopesheetFrameTargets(() => ({
    visibleKeyframes: structure.visibleKeyframes,
    selectedKeyframeIds,
    additionalSnapFrames,
    currentFrame,
    effectiveTimelineWidth: metrics.effectiveTimelineWidth,
    frameRange,
    transitionBlockedRanges,
  }))

  const navigation = useDopesheetNavigation(() => ({
    updateViewport: viewportState.updateViewport,
    normalizeViewport: viewportState.normalizeViewport,
    contentFrameMax: viewportState.contentFrameMax,
    minViewportFrames: viewportState.minViewportFrames,
    horizontalZoomRatioBase: metrics.horizontalZoomRatioBase,
    selectedKeyframeIds,
    keyframeMetaById: selectionMeta.keyframeMetaById,
    disabled,
    getFrameFromClientX: coords.getFrameFromClientX,
    effectiveTimelineWidth: metrics.effectiveTimelineWidth,
    frameRange,
  }))

  const selectionFrameActions = useSelectionFrameActions(() => ({
    selectedRefs: selectionMeta.selectedRefs,
    selectedRefIds: selectionMeta.selectedRefIds,
    keyframeMetaByIdRef: selectionMeta.keyframeMetaByIdRef,
    isPropertyLocked: filters.isPropertyLocked,
    keyframesByProperty,
    totalFrames,
    transitionBlockedRanges,
    itemId,
    disabled,
    onRemoveKeyframes,
    onKeyframeMove,
    onKeyframesMove,
    onDuplicateKeyframes,
    onDragStart,
    onDragEnd,
  }))

  const rowActions = useDopesheetRowActions(() => ({
    disabled,
    isPropertyLocked: filters.isPropertyLocked,
    itemId,
    currentFrame,
    isCurrentFrameBlocked: frameTargets.isCurrentFrameBlocked,
    notifyKeyframeBlocked: frameTargets.notifyKeyframeBlocked,
    propertyRowByProperty: structure.propertyRowByProperty,
    selectedKeyframeIds,
    showGraphPane,
    singleCurveMode,
    setGraphVisibleProperties: graphView.setGraphVisibleProperties,
    onCurveVisibilityChange,
    onPropertyChange,
    onActivePropertyChange,
    onRemoveKeyframes,
    onSelectionChange,
    onAddKeyframe,
    toggleAutoKeyframeEnabled,
    moveSelectedKeyframesByDelta: selectionFrameActions.moveSelectedKeyframesByDelta,
  }))

  const headerInputs = useHeaderFrameInputs(() => ({
    selectedFrameSummary: selectionMeta.selectedFrameSummary,
    currentFrame,
    globalFrame,
    totalFrames,
    transitionBlockedRanges,
    onKeyframeMove,
    onNavigateToKeyframe,
    moveSelectedKeyframesByDelta: selectionFrameActions.moveSelectedKeyframesByDelta,
  }))

  const dragStateRef: Ref<DragState | null> = { current: null }
  const selectionAnchorByPropertyRef: Ref<Map<AnimatableProperty, string>> = {
    current: new Map(),
  }

  const handleRowNavigate = (property: AnimatableProperty, keyframe: Keyframe | null) => {
    if (!keyframe || !onNavigateToKeyframe) return
    rowActions.activateProperty(property)
    onNavigateToKeyframe(keyframe.frame)
    onSelectionChange?.(new Set([keyframe.id]))
    selectionAnchorByPropertyRef.current.set(property, keyframe.id)
  }

  const valueEditing = usePropertyValueEditing(() => ({
    propertyColumnProperties: structure.propertyColumnProperties,
    propertyValues,
    formatPropertyValue: formatDopesheetPropertyValue,
    isPropertyLocked: filters.isPropertyLocked,
    activateProperty: rowActions.activateProperty,
    onPropertyValueCommit,
    onPropertyValuePreview,
    onDragStart,
    onDragEnd,
    onDragCancel,
  }))

  const activePropertyRow = $derived(
    selectedProperty ? structure.propertyRowByProperty.get(selectedProperty) : undefined,
  )
  useDopesheetHotkeys(() => ({
    shortcutsEnabled,
    addKeyframeShortcutEnabled,
    disabled,
    shortcuts,
    activePropertyRow,
    hasSelection: selectionMeta.selectedRefs.length > 0,
    canCommitValues: Boolean(onPropertyValueCommit),
    selectedRefs: selectionMeta.selectedRefs,
    onRemoveKeyframes,
    handleRowAddKeyframe: rowActions.handleRowAddKeyframe,
    handleRowNavigate,
    handleRowAutoKeyToggle: rowActions.handleRowAutoKeyToggle,
    fitKeyframesInView: navigation.fitKeyframesInView,
    nudgeSelectedKeyframes: rowActions.nudgeSelectedKeyframes,
  }))

  const previewDom = useSheetPreviewDom(() => ({
    committedKeyframeSelectionRef,
    keyframeMetaByIdRef: selectionMeta.keyframeMetaByIdRef,
    dragStateRef,
    getRenderedKeyframeX: coords.getRenderedKeyframeX,
    setSheetPreviewFrames,
    setSheetPreviewDuplicateKeyframeIds,
  }))

  const marquee = useDopesheetMarquee(() => ({
    getKeyframePoints: coords.getKeyframePoints,
    scrollAreaRef,
    getTimelineXFromClientX: coords.getTimelineXFromClientX,
    getContentYFromClientY: coords.getContentYFromClientY,
    onSelectionChange,
    onSelectionPreviewChange: previewDom.handleMarqueeSelectionPreviewChange,
  }))

  const keyframeDrag = useKeyframeDrag(() => ({
    disabled,
    totalFrames,
    snapEnabled,
    snapFrame: frameTargets.snapFrame,
    isPropertyLocked: filters.isPropertyLocked,
    selectedKeyframeIds,
    rowKeyframesByProperty: structure.sheetKeyframesByProperty,
    keyframeMetaByIdRef: selectionMeta.keyframeMetaByIdRef,
    dragStateRef,
    selectionAnchorByPropertyRef,
    scheduleDragPreviewFrames: previewDom.scheduleDragPreviewFrames,
    buildSelectionFramePreview: selectionFrameActions.buildSelectionFramePreview,
    commitSelectionFramePreview: selectionFrameActions.commitSelectionFramePreview,
    duplicateSelectionFramePreview: selectionFrameActions.duplicateSelectionFramePreview,
    getLiveDragPixelsPerFrame: metrics.getLiveDragPixelsPerFrame,
    onSelectionChange,
    onActivePropertyChange,
    onDragStart,
    onDragEnd,
    onDragCancel,
    onSelectionFrameDelta,
    onKeyframeMove,
    onDuplicateKeyframes,
  }))

  const pointerDispatch = useDopesheetPointerDispatch(() => ({
    disabled,
    isPropertyLocked: filters.isPropertyLocked,
    selectedKeyframeIds,
    onActivePropertyChange,
    beginMarqueeSelection: marquee.beginMarqueeSelection,
    getMarqueeModeFromPointerEvent: marquee.getMarqueeModeFromPointerEvent,
  }))

  const rulerScrub = useRulerScrub(() => ({
    disabled,
    viewport,
    effectiveTimelineWidth: metrics.effectiveTimelineWidth,
    timelinePixelsPerSecond: metrics.timelinePixelsPerSecond,
    fps,
    itemFrom,
    totalFrames,
    timelineEdgeInset: metrics.timelineEdgeInset,
    timelineCellBorderWidth: metrics.timelineCellBorderWidth,
    scrubClampToItemBounds,
    scrubFrameBounds,
    frameToX: coords.frameToX,
    globalFrameToPixels,
    getTimelineXFromClientX: coords.getTimelineXFromClientX,
    getFrameFromClientX: coords.getFrameFromClientX,
    getLiveDragPixelsPerFrame: metrics.getLiveDragPixelsPerFrame,
    getTimelineLivePixelsPerSecond,
    timelineRef,
    timelineScrollContainerRef,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onSkim,
    onRulerEdgeScroll,
  }))

  useLinkedTimelineWheelForwarding(() => ({
    rootRef: pickWhipRootRef,
    timelineScrollContainerRef,
    viewportInteractionEnabled,
  }))

  const graphDisplay = useDopesheetGraphDisplay(() => ({
    graphPaneRef,
    graphVisibleProperties: graphView.graphVisibleProperties,
    compoundSecondaryProperties,
    graphableProperties: derivations.graphableProperties,
    keyframesByProperty,
    autoZoomGraphHeight: graphView.autoZoomGraphHeight,
    activeSelectedProperty: structure.activeSelectedProperty,
    isPropertyLocked: filters.isPropertyLocked,
    disabled,
    selectedRefs: selectionMeta.selectedRefs,
    nudgeSelectedKeyframes: rowActions.nudgeSelectedKeyframes,
    onRemoveKeyframes,
  }))
  const timingStrip = useDopesheetTimingStrip(() => ({
    showGraphPane,
    showSheetPane,
    activeSelectedProperty: structure.activeSelectedProperty,
    keyframesByProperty,
    visibleKeyframes: structure.visibleKeyframes,
    selectedKeyframeIds,
    selectedRefIds: selectionMeta.selectedRefIds,
    isPropertyLocked: filters.isPropertyLocked,
    onKeyframeMove,
    disabled,
    totalFrames,
    onSelectionChange,
    onDragStart,
    onDragEnd,
    buildSelectionFramePreview: selectionFrameActions.buildSelectionFramePreview,
    commitSelectionFramePreview: selectionFrameActions.commitSelectionFramePreview,
    scheduleDragPreviewFrames: previewDom.scheduleDragPreviewFrames,
  }))
  // Shared row and group-header bundles, rebuilt only when one of their values changes.
  const rowProps = useDopesheetRowProps(() => ({
    activateProperty: rowActions.activateProperty,
    axisConstraintByProperty,
    autoKeyEnabledByProperty,
    beginPropertyLink,
    canClearRow: rowActions.canClearRow,
    compoundPropertyRows,
    compoundSecondaryProperties,
    itemId,
    itemFrom,
    currentFrame,
    fps,
    disabled,
    expressionEditor: expression.expressionEditor,
    formatPropertyValue: formatDopesheetPropertyValue,
    globalFrame,
    graphVisibleProperties: graphView.graphVisibleProperties,
    handleClearProperty: rowActions.handleClearProperty,
    handleRowAutoKeyToggle: rowActions.handleRowAutoKeyToggle,
    handleRowNavigate,
    handleRowToggleKeyframe: rowActions.handleRowToggleKeyframe,
    handleRowValueChange: valueEditing.handleRowValueChange,
    handleRowValueCommit: valueEditing.handleRowValueCommit,
    handleValueScrubEnd: valueEditing.handleValueScrubEnd,
    handleValueScrubCancel: valueEditing.handleValueScrubCancel,
    handleValueScrubMove: valueEditing.handleValueScrubMove,
    handleValueScrubStart: valueEditing.handleValueScrubStart,
    isPropertyLocked: filters.isPropertyLocked,
    isCurrentFrameBlocked: frameTargets.isCurrentFrameBlocked,
    onAddKeyframe,
    onNavigateToKeyframe,
    onCurveVisibilityChange,
    onDragCancel,
    onDragEnd,
    onDragStart,
    onPropertyValueCommit,
    onPropertyValuePreview,
    resolvedPropertyLinks,
    resolvedPropertyLinkSourceLabels,
    removePropertyLink,
    propertyExpressions,
    propertyLabels,
    preExpressionPropertyValues,
    resolveExpressionReference,
    onSetPropertyExpression,
    openPropertyExpressionEditor: expression.openPropertyExpressionEditor,
    onResetPropertiesToDefault,
    propertyValues,
    presentation,
    selectedProperty,
    selectedCurveVisibleExternally,
    setAllRowsLocked,
    setEditingValueProperty: valueEditing.setEditingValueProperty,
    setValueDrafts: valueEditing.setValueDrafts,
    showGraphPane,
    showSinglePropertyCurve: rowActions.showSinglePropertyCurve,
    singleCurveMode,
    skipNextBlurCommitPropertyRef: valueEditing.skipNextBlurCommitPropertyRef,
    spacious,
    t: translate,
    togglePropertyCurve: graphView.togglePropertyCurve,
    toggleLockedProperty: filters.toggleLockedProperty,
    valueDraftAtFocusRef: valueEditing.valueDraftAtFocusRef,
    valueDrafts: valueEditing.valueDrafts,
    expandedGroups: structure.expandedGroups,
    dimensionSeparationByProperty,
    setAllGroupsExpanded: structure.setAllGroupsExpanded,
    setGroupLocked: filters.setGroupLocked,
    toggleGroup: structure.toggleGroup,
    toggleGroupCurves: graphView.toggleGroupCurves,
    handleClearGroup: rowActions.handleClearGroup,
  }))
  const expressionDock = useDopesheetExpressionDock(() => ({
    editor: expression.expressionEditor,
    referencePick: expression.expressionReferencePick,
    dockRef: expression.expressionDockRef,
    textareaRef: expression.expressionTextareaRef,
    setEditor: expression.setExpressionEditor,
    setReferencePick: expression.setExpressionReferencePick,
    beginReferenceDrag: expression.beginExpressionReferenceDrag,
    applyPreset: expression.applyExpressionPreset,
    itemId,
    rows: structure.sheetRows,
    compoundRows: compoundPropertyRows,
    preExpressionValues: preExpressionPropertyValues,
    propertyValues,
    expressions: propertyExpressions,
    currentFrame,
    globalFrame,
    itemFrom,
    fps,
    resolveExpressionReference,
    onSetPropertyExpression,
    onRemovePropertyExpression,
  }))

  // The row controls are substantially heavier than the timeline cells, and
  // their output does not depend on the time viewport. The rows read the
  // bundles and the cells read the geometry separately, so zooming only
  // updates keyframe/tick geometry.
  const textMotionHandlers: UseDopesheetSheetRowsOptions['textMotionHandlers'] = {
    get onDurationDragStart() {
      return onTextMotionDurationDragStart
    },
    get onDurationCommit() {
      return onTextMotionDurationCommit
    },
    get onDurationCancel() {
      return onTextMotionDurationCancel
    },
    get onOffsetDragStart() {
      return onTextMotionOffsetDragStart
    },
    get onOffsetCommit() {
      return onTextMotionOffsetCommit
    },
    get onOffsetCancel() {
      return onTextMotionOffsetCancel
    },
    get onBandClick() {
      return onTextMotionBandClick
    },
  }
  const sheetRowsProps: UseDopesheetSheetRowsOptions = {
    get rowContentProps() {
      return rowProps.rowContentProps
    },
    get groupHeaderProps() {
      return rowProps.groupHeaderProps
    },
    get renderedSheetEntries() {
      return coords.renderedSheetEntries
    },
    get groupTimelineById() {
      return structure.groupTimelineById
    },
    get groupedPropertyRows() {
      return structure.groupedSheetRows
    },
    get expandedGroups() {
      return structure.expandedGroups
    },
    get inlinePropertyGroupIdSet() {
      return derivations.inlinePropertyGroupIdSet
    },
    get rowKeyframesByProperty() {
      return structure.sheetKeyframesByProperty
    },
    get renderedKeyframeXById() {
      return coords.renderedKeyframeXById
    },
    get proceduralBandByProperty() {
      return derivations.proceduralBandByProperty
    },
    get selectedKeyframeIds() {
      return selectedKeyframeIds
    },
    get transitionBlockedRanges() {
      return transitionBlockedRanges
    },
    get ticks() {
      return coords.ticks
    },
    get frameToX() {
      return coords.frameToX
    },
    get sharedGridFrameToX() {
      return coords.sharedGridFrameToX
    },
    get getRenderedKeyframeX() {
      return coords.getRenderedKeyframeX
    },
    get effectiveTimelineWidth() {
      return metrics.effectiveTimelineWidth
    },
    get timelineGridDivisions() {
      return timelineGridDivisions
    },
    get propertyGridStyle() {
      return metrics.propertyGridStyle
    },
    get presentation() {
      return presentation
    },
    get disabled() {
      return disabled
    },
    get isPropertyLocked() {
      return filters.isPropertyLocked
    },
    get itemId() {
      return itemId
    },
    get textMotionBands() {
      return textMotionBands
    },
    getLiveDragPixelsPerFrame: metrics.getLiveDragPixelsPerFrame,
    get sheetPreviewFrames() {
      return sheetPreviewFrames
    },
    get sheetPreviewDuplicateKeyframeIds() {
      return sheetPreviewDuplicateKeyframeIds
    },
    keyframeMetaByIdRef: selectionMeta.keyframeMetaByIdRef,
    setKeyframeButtonRef: previewDom.setKeyframeButtonRef,
    handleRowPointerDown: pointerDispatch.handleRowPointerDown,
    handleTimelineBackgroundPointerDown: pointerDispatch.handleTimelineBackgroundPointerDown,
    handleKeyframePointerDown: keyframeDrag.handleKeyframePointerDown,
    handleGroupKeyframePointerDown: keyframeDrag.handleGroupKeyframePointerDown,
    get onSegmentEasingChange() {
      return onSegmentEasingChange
    },
    get onDragStart() {
      return onDragStart
    },
    get onDragEnd() {
      return onDragEnd
    },
    textMotionHandlers,
  }
  const propertyColumnProps: DopesheetPropertyColumnProps = {
    get rowContentProps() {
      return rowProps.rowContentProps
    },
    get groupHeaderProps() {
      return rowProps.groupHeaderProps
    },
    get groupedPropertyRows() {
      return structure.groupedSheetRows
    },
    get expandedGroups() {
      return structure.expandedGroups
    },
    get inlinePropertyGroupIdSet() {
      return derivations.inlinePropertyGroupIdSet
    },
  }

  const paneState: DopesheetPaneElementsState = {
    t: translate,
    get hasPropertyFilters() {
      return structure.hasPropertyFilters
    },
    get hasProceduralMotion() {
      return hasProceduralMotion
    },
    get propertyGridStyle() {
      return metrics.propertyGridStyle
    },
    timelineRef,
    get graphRulerUnit() {
      return graphView.graphRulerUnit
    },
    get reservedScrollbarGutterWidth() {
      return metrics.reservedScrollbarGutterWidth
    },
    get ticks() {
      return coords.ticks
    },
    get frameToX() {
      return coords.frameToX
    },
    handleRulerPointerDown: rulerScrub.handleRulerPointerDown,
    handleRulerPointerMove: rulerScrub.handleRulerPointerMove,
    handleRulerPointerUp: rulerScrub.handleRulerPointerUp,
    handleRulerPointerLeave: rulerScrub.handleRulerPointerLeave,
    get filterKeyframedOnly() {
      return structure.filterKeyframedOnly
    },
    setShowKeyframedOnly: filters.setShowKeyframedOnly,
    get presentation() {
      return presentation
    },
    get propertyFilter() {
      return propertyFilter
    },
    get hasLinkedTimelineAxis() {
      return metrics.hasLinkedTimelineAxis
    },
    get timelineScrollContainerRef() {
      return timelineScrollContainerRef
    },
    get getTimelineLivePixelsPerSecond() {
      return getTimelineLivePixelsPerSecond
    },
    get timelinePixelsPerSecond() {
      return metrics.timelinePixelsPerSecond
    },
    get itemFrom() {
      return itemFrom
    },
    get columnWidth() {
      return columnWidth
    },
    get showPlayhead() {
      return showPlayhead
    },
    get onSkim() {
      return onSkim
    },
    get playheadFrame() {
      return playheadFrame
    },
    get currentFrame() {
      return currentFrame
    },
    get totalFrames() {
      return totalFrames
    },
    get playheadClampToItemBounds() {
      return playheadClampToItemBounds
    },
    get globalFrameToPixels() {
      return globalFrameToPixels
    },
    rulerScrubActiveRef: rulerScrub.rulerScrubActiveRef,
    rulerScrubHandoffFrameRef: rulerScrub.rulerScrubHandoffFrameRef,
    get effectiveTimelineWidth() {
      return metrics.effectiveTimelineWidth
    },
    get fps() {
      return fps
    },
    get isRulerScrubbing() {
      return rulerScrub.isRulerScrubbing
    },
    scrollAreaRef,
    get sheetRows() {
      return structure.sheetRows
    },
    get textMotionBands() {
      return textMotionBands
    },
    rowElements,
    marqueeOverlayRef: marquee.marqueeOverlayRef,
    handleTimelineBackgroundPointerDown: pointerDispatch.handleTimelineBackgroundPointerDown,
    propertyColumnElements,
    graphPaneRef,
    get disabled() {
      return disabled
    },
    get graphDisplayPropertyLocked() {
      return graphDisplay.graphDisplayPropertyLocked
    },
    focusGraphPane: graphDisplay.focusGraphPane,
    handleGraphPaneKeyDown: graphDisplay.handleGraphPaneKeyDown,
    graphPaneSize,
    get visibleGraphProperties() {
      return graphDisplay.visibleGraphProperties
    },
    get viewport() {
      return viewport
    },
    updateViewport: (next) => viewportState.updateViewport(next),
    get itemId() {
      return itemId
    },
    get keyframesByProperty() {
      return keyframesByProperty
    },
    get graphDisplayProperty() {
      return graphDisplay.graphDisplayProperty
    },
    get singleCurveMode() {
      return singleCurveMode
    },
    get compoundSecondaryProperties() {
      return compoundSecondaryProperties
    },
    get selectedKeyframeIds() {
      return selectedKeyframeIds
    },
    get onKeyframeMove() {
      return onKeyframeMove
    },
    get timingStripPreviewFrames() {
      return timingStrip.timingStripPreviewFrames
    },
    constrainGraphFrameDelta: timingStrip.constrainGraphFrameDelta,
    get onBezierHandleMove() {
      return onBezierHandleMove
    },
    get onSelectionChange() {
      return onSelectionChange
    },
    get onPropertyChange() {
      return onPropertyChange
    },
    get onScrub() {
      return onScrub
    },
    get onScrubStart() {
      return onScrubStart
    },
    get onScrubEnd() {
      return onScrubEnd
    },
    get onDragStart() {
      return onDragStart
    },
    get onDragEnd() {
      return onDragEnd
    },
    get onAddKeyframe() {
      return onAddKeyframe
    },
    get onRemoveKeyframes() {
      return onRemoveKeyframes
    },
    get onNavigateToKeyframe() {
      return onNavigateToKeyframe
    },
    get transitionBlockedRanges() {
      return transitionBlockedRanges
    },
    get proceduralPreview() {
      return proceduralPreview
    },
    snapEnabled,
    get showAllGraphHandles() {
      return graphView.showAllGraphHandles
    },
    get autoZoomGraphHeight() {
      return graphView.autoZoomGraphHeight
    },
    get graphVerticalZoomValue() {
      return graphView.graphVerticalZoomValue
    },
    get isSplitView() {
      return isSplitView
    },
    get graphMode() {
      return graphMode
    },
    get speedGraphContent() {
      return speedGraphContent
    },
    get affectedFrameRange() {
      return affectedFrameRange
    },
    get affectedFrameRangeGeometry() {
      return coords.affectedFrameRangeGeometry
    },
    get selectedFrameSummary() {
      return selectionMeta.selectedFrameSummary
    },
    get globalFrame() {
      return globalFrame
    },
    get localFrameInputValue() {
      return headerInputs.localFrameInputValue
    },
    get globalFrameInputValue() {
      return headerInputs.globalFrameInputValue
    },
    setLocalFrameInputValue: headerInputs.setLocalFrameInputValue,
    setGlobalFrameInputValue: headerInputs.setGlobalFrameInputValue,
    skipNextHeaderFrameBlurRef: headerInputs.skipNextHeaderFrameBlurRef,
    commitLocalFrameInput: headerInputs.commitLocalFrameInput,
    commitGlobalFrameInput: headerInputs.commitGlobalFrameInput,
    handleHeaderFrameInputKeyDown: headerInputs.handleHeaderFrameInputKeyDown,
  }
  const headerFrameInputs = buildDopesheetHeaderFrameInputs(paneState)
  const hasAffectedFrameRangeOverlay = $derived(hasDopesheetAffectedFrameRangeOverlay(paneState))

  // Workspace chrome: only the default shell renders these.
  const chromeState: DopesheetWorkspaceChromeState = {
    get propertyGridStyle() {
      return metrics.propertyGridStyle
    },
    get viewport() {
      return viewport
    },
    get contentFrameMax() {
      return viewportState.contentFrameMax
    },
    get disabled() {
      return disabled
    },
    get currentFrame() {
      return currentFrame
    },
    get minViewportFrames() {
      return viewportState.minViewportFrames
    },
    updateViewport: (next) => viewportState.updateViewport(next),
    get timingStripMarkers() {
      return timingStrip.timingStripMarkers
    },
    get timingStripPreviewFrames() {
      return timingStrip.timingStripPreviewFrames
    },
    handleTimingStripSelectionChange: timingStrip.handleTimingStripSelectionChange,
    handleTimingStripSlideStart: timingStrip.handleTimingStripSlideStart,
    handleTimingStripSlideChange: timingStrip.handleTimingStripSlideChange,
    handleTimingStripSlideEnd: timingStrip.handleTimingStripSlideEnd,
    headerFrameInputs,
    get availableProperties() {
      return derivations.availableProperties
    },
    get filterKeyframedOnly() {
      return structure.filterKeyframedOnly
    },
    setShowKeyframedOnly: filters.setShowKeyframedOnly,
    get allPropertyGroups() {
      return derivations.allPropertyGroups
    },
    get visibleGroups() {
      return filters.visibleGroups
    },
    toggleVisibleGroup: filters.toggleVisibleGroup,
    setAllGroupsExpanded: structure.setAllGroupsExpanded,
    resetParameterView,
    get hasPropertyFilters() {
      return structure.hasPropertyFilters
    },
    get showGraphPane() {
      return showGraphPane
    },
    get graphDisplayProperty() {
      return graphDisplay.graphDisplayProperty
    },
    get compoundPropertyRows() {
      return compoundPropertyRows
    },
    get speedGraphContent() {
      return speedGraphContent
    },
    get onGraphModeChange() {
      return onGraphModeChange
    },
    get graphMode() {
      return graphMode
    },
    get visibleKeyframes() {
      return structure.visibleKeyframes
    },
    get isCurrentFrameBlocked() {
      return frameTargets.isCurrentFrameBlocked
    },
    get canBakeMotion() {
      return canBakeMotion
    },
    get onBakeMotion() {
      return onBakeMotion
    },
    get interpolationOptions() {
      return interpolationOptions
    },
    get selectedInterpolation() {
      return selectedInterpolation
    },
    get interpolationDisabled() {
      return interpolationDisabled
    },
    get onInterpolationChange() {
      return onInterpolationChange
    },
    get selectedRefs() {
      return selectionMeta.selectedRefs
    },
    get hasKeyframeClipboard() {
      return hasKeyframeClipboard
    },
    get isKeyframeClipboardCut() {
      return isKeyframeClipboardCut
    },
    get onCopyKeyframes() {
      return onCopyKeyframes
    },
    get onCutKeyframes() {
      return onCutKeyframes
    },
    get onPasteKeyframes() {
      return onPasteKeyframes
    },
    get onRemoveKeyframes() {
      return onRemoveKeyframes
    },
    handleRemoveKeyframes: selectionFrameActions.handleRemoveKeyframes,
    get horizontalZoomValue() {
      return metrics.horizontalZoomValue
    },
    get horizontalZoomRatioBase() {
      return metrics.horizontalZoomRatioBase
    },
    setHorizontalZoomValue: navigation.setHorizontalZoomValue,
    resetViewport: navigation.resetViewport,
    get graphVerticalZoomValue() {
      return graphView.graphVerticalZoomValue
    },
    get visibleGraphProperties() {
      return graphDisplay.visibleGraphProperties
    },
    get verticalZoomRatioBase() {
      return graphDisplay.verticalZoomRatioBase
    },
    setGraphVerticalZoomValue: graphView.setGraphVerticalZoomValue,
    get graphRulerUnit() {
      return graphView.graphRulerUnit
    },
    setGraphRulerUnit: graphView.setGraphRulerUnit,
    get showAllGraphHandles() {
      return graphView.showAllGraphHandles
    },
    setShowAllGraphHandles: graphView.setShowAllGraphHandles,
    get autoZoomGraphHeight() {
      return graphView.autoZoomGraphHeight
    },
    setAutoZoomGraphHeight: graphView.setAutoZoomGraphHeight,
  }
</script>

{#snippet rowElements()}
  <DopesheetSheetRows {...sheetRowsProps} />
{/snippet}

{#snippet propertyColumnElements()}
  <DopesheetPropertyColumn {...propertyColumnProps} />
{/snippet}

{#snippet expressionDockElement()}
  <DopesheetExpressionDockElement dock={expressionDock} />
{/snippet}

{#snippet rulerHeader()}
  {@render rulerHeaderElement(paneState)}
{/snippet}

{#snippet sheetBody()}
  {@render sheetBodyElement(paneState)}
{/snippet}

{#snippet graphPane()}
  {@render graphPaneElement(paneState)}
{/snippet}

{#snippet playheadOverlay()}
  {@render playheadOverlayElement(paneState)}
{/snippet}

{#snippet splitPlayheadOverlay()}
  {@render splitPlayheadOverlayElement(paneState)}
{/snippet}

{#snippet skimPlayheadOverlay()}
  {@render skimPlayheadOverlayElement(paneState)}
{/snippet}

{#snippet affectedFrameRangeOverlay()}
  {@render affectedFrameRangeOverlayElement(paneState)}
{/snippet}

{#snippet toolbar()}
  {@render toolbarElement(chromeState)}
{/snippet}

{#snippet timingStripSnippet()}
  {@render timingStripElement(chromeState)}
{/snippet}

{#snippet navigator()}
  {@render navigatorElement(chromeState)}
{/snippet}

{#if presentation === 'lanes'}
  <DopesheetLanesPresentation
    {pickWhipRootRef}
    class={className}
    {height}
    {disabled}
    handleWheel={navigation.handleWheel}
    handleGraphPaneKeyDown={graphDisplay.handleGraphPaneKeyDown}
    {timelineRef}
    {timelineGridDivisions}
    timelineCellBorderWidth={metrics.timelineCellBorderWidth}
    {columnWidth}
    {showSheetPane}
    {showGraphPane}
    graphPaneElement={graphPane}
    sheetBodyElement={sheetBody}
    skimPlayheadOverlayElement={skimPlayheadOverlay}
    playheadOverlayElement={playheadOverlay}
    {expressionDockElement}
    expressionReferenceDrag={expression.expressionReferenceDrag}
  />
{:else if presentation === 'classic'}
  <DopesheetClassicPresentation
    {pickWhipRootRef}
    class={className}
    {height}
    {width}
    {disabled}
    t={translate}
    keyframeCount={structure.visibleKeyframes.length}
    {trimmedKeyframeCount}
    {onTrimAnimation}
    {headerFrameInputs}
    {viewportInteractionEnabled}
    handleWheel={navigation.handleWheel}
    affectedFrameRangeOverlayElement={hasAffectedFrameRangeOverlay
      ? affectedFrameRangeOverlay
      : undefined}
    effectiveTimelineWidth={metrics.effectiveTimelineWidth}
    {columnWidth}
    skimPlayheadOverlayElement={skimPlayheadOverlay}
    playheadOverlayElement={playheadOverlay}
    rulerHeaderElement={rulerHeader}
    sheetBodyElement={sheetBody}
  />
{:else}
  <DopesheetEditorPresentation
    {pickWhipRootRef}
    class={className}
    {height}
    {width}
    {disabled}
    t={translate}
    {visualizationMode}
    {isSplitView}
    {showSheetPane}
    {showGraphPane}
    handleWheel={navigation.handleWheel}
    propertyGridStyle={metrics.propertyGridStyle}
    toolbarElement={toolbar}
    rulerHeaderElement={rulerHeader}
    sheetBodyElement={sheetBody}
    graphPaneElement={graphPane}
    playheadOverlayElement={playheadOverlay}
    splitPlayheadOverlayElement={splitPlayheadOverlay}
    skimPlayheadOverlayElement={skimPlayheadOverlay}
    {expressionDockElement}
    expressionReferenceDrag={expression.expressionReferenceDrag}
    timingStripElement={timingStripSnippet}
    navigatorElement={navigator}
  />
{/if}
