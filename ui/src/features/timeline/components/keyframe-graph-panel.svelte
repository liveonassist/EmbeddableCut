<!-- SPDX-License-Identifier: MIT -->
<!--
  Keyframe Graph Panel Component

  Panel that shows the value graph editor for selected items.
  Integrates with the timeline to provide visual keyframe editing.
-->
<script lang="ts" module>
  import type { EasingType } from '@/types/keyframe'

  const EASING_OPTIONS: Array<{
    value: EasingType
    labelKey: string
    defaultLabel: string
  }> = [
    {
      value: 'hold',
      labelKey: 'timeline.keyframeEditor.easing.hold',
      defaultLabel: 'Hold',
    },
    {
      value: 'linear',
      labelKey: 'timeline.keyframeEditor.easing.linear',
      defaultLabel: 'Linear',
    },
    {
      value: 'ease-in',
      labelKey: 'timeline.keyframeEditor.easing.easeIn',
      defaultLabel: 'Ease In',
    },
    {
      value: 'ease-in-out',
      labelKey: 'timeline.keyframeEditor.easing.easeInOut',
      defaultLabel: 'Ease In/Out',
    },
    {
      value: 'ease-out',
      labelKey: 'timeline.keyframeEditor.easing.easeOut',
      defaultLabel: 'Ease Out',
    },
  ]
</script>

<script lang="ts">
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { createLogger } from '@/shared/logging/logger'
  import MotionBakeConfirmationDialog from '@/shared/ui/motion-bake-confirmation-dialog.svelte'
  import { buildBakeMotionPlan } from '@/features/timeline/deps/keyframe-editors'
  import {
    DopesheetEditor,
    PropertyLinkPickWhipOverlay,
  } from '@/features/timeline/deps/keyframe-editors-ui'
  import { usePropertyLinkPickWhip } from '@/features/timeline/hooks/use-property-link-pick-whip.svelte'
  import { bakeMotionToKeyframes } from '@/features/timeline/stores/actions/motion-modifier-actions'
  import {
    resolveTransform,
    getSourceDimensions,
  } from '@/features/timeline/deps/composition-runtime'
  import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
  import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store'
  import { useEditorStore } from '@/shared/state/editor'
  import type { AnimatableProperty, DirectLinkableProperty } from '@/types/keyframe'
  import { getDirectPropertyLinks } from '@/types/keyframe'
  import { HOTKEY_OPTIONS } from '@/config/hotkeys'
  import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
  import { useHotkeys } from '$lib/hotkeys.svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import KeyframeGraphPanelHeader from './keyframe-graph-panel-header.svelte'
  import {
    MIN_CONTENT_HEIGHT,
    RESIZE_HANDLE_HEIGHT,
    useKeyframeGraphPanelChrome,
  } from './use-keyframe-graph-panel-chrome.svelte'
  import { useKeyframeGraphPanelViewState } from './use-keyframe-graph-panel-view-state.svelte'
  import { useKeyframeGraphPanelModel } from './use-keyframe-graph-panel-model.svelte'
  import { useEditTimelineKeyframeGeometry } from './use-edit-timeline-keyframe-geometry.svelte'
  import { useKeyframeGraphTextMotion } from './use-keyframe-graph-text-motion.svelte'
  import { useVectorKeyframeEditing } from './use-vector-keyframe-editing.svelte'
  import { useKeyframeDragCommands } from './use-keyframe-drag-commands.svelte'
  import { useKeyframeScrubAdd } from './use-keyframe-scrub-add.svelte'
  import { useKeyframePropertyValues } from './use-keyframe-property-values.svelte'
  import { buildDopesheetEditorProps } from './build-dopesheet-editor-props'
  import { VectorSpeedGraph } from './vector-speed-graph'
  import type { KeyframeEditorSurface } from './keyframe-graph-panel-model'

  const logger = createLogger('ErrorBoundary')

  interface KeyframeGraphPanelProps {
    /** Whether the panel is open */
    isOpen: boolean
    /** Deprecated: panel no longer collapses from the header */
    onToggle?: () => void
    /** Callback to close the panel */
    onClose: () => void
    /** Where the panel is docked in the layout */
    placement?: 'bottom' | 'top' | 'side'
    /** Side-lane docks stay persistent and should not expose a close affordance. */
    showCloseButton?: boolean
    /**
     * Animate-workspace context: keeps the panel persistent/spacious and unlocks
     * the third "split" view-mode option (sheet + graph stacked) in the toggle.
     * The user still chooses sheet / graph / split; split is no longer forced.
     */
    splitView?: boolean
    /** Whether the Animate workspace has hidden preview chrome for focused editing. */
    isFocusMode?: boolean
    /** Toggle the Animate workspace's focused keyframe layout. */
    onFocusModeChange?: (isFocusMode: boolean) => void
    /** Motion workspace context: a dedicated selected-layer value-curve editor. */
    surface?: KeyframeEditorSurface
    /** Initial parameter groups shown by this workspace; users can change them from Parameters. */
    initialVisibleGroupIds?: readonly string[]
    /** Optional property-column width for workspace-specific layouts. */
    propertyColumnWidth?: number
    /** Main Edit timeline scroll surface shared by the docked keyframe ruler. */
    timelineScrollContainer?: HTMLDivElement | null
  }

  let {
    isOpen,
    onClose,
    placement = 'bottom',
    showCloseButton = true,
    splitView = false,
    isFocusMode = false,
    onFocusModeChange,
    surface = 'default',
    initialVisibleGroupIds,
    propertyColumnWidth,
    timelineScrollContainer,
  }: KeyframeGraphPanelProps = $props()

  const easingOptions = $derived(
    EASING_OPTIONS.map((option) => ({
      value: option.value,
      label: t(option.labelKey, { defaultValue: option.defaultLabel }),
    })),
  )
  const hotkeys = useResolvedHotkeys()
  const chrome = useKeyframeGraphPanelChrome(() => ({ isOpen, placement, surface }))

  const valueScrubCreatedKeyframesRef = { current: new Map<AnimatableProperty, string>() }
  const promotedVectorDragIdsRef = { current: new Map<string, string>() }
  const keyframeEditorScrubbingRef = { current: false }
  let isPointerWithinEditor = $state(false)
  let isFocusWithinEditor = $state(false)

  // Use _updateKeyframe directly (no undo per call) for dragging
  const { _updateKeyframe, _addKeyframe, _removeKeyframesForProperty } =
    useKeyframesStore.getState()
  const { setKeyframeEditorShortcutScopeActive } = useEditorStore.getState()

  // Keyframe selection
  const {
    selectKeyframe,
    selectKeyframes,
    clearSelection: clearKeyframeSelection,
    copySelectedKeyframes,
    cutSelectedKeyframes,
    clearClipboard: clearKeyframeClipboard,
  } = useKeyframeSelectionStore.getState()
  const keyframeClipboard = select(useKeyframeSelectionStore, (s) => s.clipboard)
  const isKeyframeClipboardCut = select(useKeyframeSelectionStore, (s) => s.isCut)

  // View-mode + canvas state, and the derived selection/keyframes model. Both
  // are called before every hook that consumes their values.
  const viewState = useKeyframeGraphPanelViewState(() => ({ surface, splitView }))

  const model = useKeyframeGraphPanelModel(() => ({
    surface,
    canvas: viewState.canvas,
    selectedProperty: viewState.selectedProperty,
    t,
    keyframeEditorScrubbingRef,
  }))

  const propertyLink = usePropertyLinkPickWhip()
  const propertyLinkSourceLabels = $derived(
    Object.fromEntries(
      getDirectPropertyLinks(model.selectedItemKeyframes ?? undefined).map((link) => {
        const source = model.allItemsById[link.sourceItemId]
        const sourceLabel = source?.label || source?.type || link.sourceItemId
        return [link.targetProperty, `${sourceLabel} -> ${link.sourceProperty}`]
      }),
    ) as Partial<Record<DirectLinkableProperty, string>>,
  )
  const handlePropertyLinkPointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    property: DirectLinkableProperty,
  ) => {
    const item = model.selectedItemForEditor
    if (!item) return
    propertyLink.begin(event, item.id, property)
  }
  const handleRemovePropertyLink = (property: DirectLinkableProperty) => {
    const item = model.selectedItemForEditor
    if (!item) return
    propertyLink.remove(item.id, property)
  }

  $effect(() => {
    if (!isOpen) {
      isPointerWithinEditor = false
      isFocusWithinEditor = false
      setKeyframeEditorShortcutScopeActive(false)
      return
    }

    setKeyframeEditorShortcutScopeActive(isPointerWithinEditor || isFocusWithinEditor)
  })

  $effect(() => () => {
    setKeyframeEditorShortcutScopeActive(false)
  })

  const geometry = useEditTimelineKeyframeGeometry(() => ({
    timelineScrollContainer,
    surface,
    isOpen,
    maxItemEndFrame: model.maxItemEndFrame,
    selectedItemForEditor: model.selectedItemForEditor,
  }))

  const textMotion = useKeyframeGraphTextMotion(() => ({
    selectedItemForEditor: model.selectedItemForEditor,
    surface,
  }))

  let bakeDialogOpen = $state(false)
  const setBakeDialogOpen = (open: boolean) => {
    bakeDialogOpen = open
  }

  const handleBakeProceduralMotion = () => {
    const item = model.selectedItemForEditor
    if (!item) return
    const canvas = viewState.canvas
    const plan = buildBakeMotionPlan({
      items: [item],
      keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
      fps: canvas.fps,
      frameWidth: canvas.width,
      frameHeight: canvas.height,
      resolveBase: (candidate) =>
        resolveTransform(candidate, canvas, getSourceDimensions(candidate)),
    })
    if (plan.length === 0) return
    const baked = bakeMotionToKeyframes(plan)
    bakeDialogOpen = false
    toast.success(t('timeline.keyframeEditor.motionBaked', { count: baked }))
  }

  const vector = useVectorKeyframeEditing(() => ({
    selectedItemForEditor: model.selectedItemForEditor,
    selectedItemKeyframes: model.selectedItemKeyframes,
    keyframesByProperty: model.keyframesByProperty,
    vectorBaseTransform: model.vectorBaseTransform,
    relativeFrame: model.relativeFrame,
    transitionBlockedRanges: model.transitionBlockedRanges,
    canvas: viewState.canvas,
    t,
    surface,
    vectorControlRows: model.vectorControlRows,
    effectiveSelectedProperty: model.effectiveSelectedProperty,
    selectedKeyframeIds: model.selectedKeyframeIds,
    positionDimensionsSeparated: model.positionDimensionsSeparated,
    scaleAxesConstrained: model.scaleAxesConstrained,
    getNextVectorAxisValue: model.getNextVectorAxisValue,
    promotedVectorDragIdsRef,
    selectKeyframe,
    selectKeyframes,
    clearKeyframeSelection,
    vectorGraphMode: viewState.vectorGraphMode,
    setVectorGraphMode: viewState.setVectorGraphMode,
  }))

  const commands = useKeyframeDragCommands(() => ({
    selectedItemForEditor: model.selectedItemForEditor,
    selectedItemKeyframes: model.selectedItemKeyframes,
    selectedEditorKeyframes: model.selectedEditorKeyframes,
    keyframesByProperty: model.keyframesByProperty,
    allAvailableProperties: model.allAvailableProperties,
    availableProperties: model.availableProperties,
    transitionBlockedRanges: model.transitionBlockedRanges,
    vectorBaseTransform: model.vectorBaseTransform,
    relativeFrame: model.relativeFrame,
    canvas: viewState.canvas,
    allItemsById: model.allItemsById,
    allKeyframesByItemId: model.allKeyframesByItemId,
    keyframeClipboard: keyframeClipboard.current,
    isKeyframeClipboardCut: isKeyframeClipboardCut.current,
    t,
    _updateKeyframe,
    ensureVectorKeyframeForLiveEdit: vector.ensureVectorKeyframeForLiveEdit,
    applyVectorKeyframeUpdates: vector.applyVectorKeyframeUpdates,
    selectKeyframe,
    selectKeyframes,
    clearKeyframeSelection,
    copySelectedKeyframes,
    cutSelectedKeyframes,
    clearKeyframeClipboard,
    setSelectedProperty: viewState.setSelectedProperty,
    promotedVectorDragIdsRef,
    valueScrubCreatedKeyframesRef,
  }))

  const isEditorShortcutScopeActive = $derived(
    isOpen && (isPointerWithinEditor || isFocusWithinEditor),
  )

  // The view-mode toggle is always visible now, so the hotkeys map to it in
  // every context (including the Animate workspace's split-capable toggle).
  useHotkeys(
    () => hotkeys.current.KEYFRAME_EDITOR_GRAPH,
    (event) => {
      event.preventDefault()
      viewState.setEditorMode('graph')
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: isEditorShortcutScopeActive }),
  )

  useHotkeys(
    () => hotkeys.current.KEYFRAME_EDITOR_DOPESHEET,
    (event) => {
      event.preventDefault()
      viewState.setEditorMode('dopesheet')
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: isEditorShortcutScopeActive }),
  )

  useHotkeys(
    () => hotkeys.current.KEYFRAME_EDITOR_SPLIT,
    (event) => {
      event.preventDefault()
      viewState.setEditorMode('split')
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: isEditorShortcutScopeActive && splitView }),
  )

  useHotkeys(
    () => hotkeys.current.COPY,
    (event) => {
      event.preventDefault()
      commands.handleCopyKeyframes()
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: isOpen && model.selectedEditorKeyframes.length > 0 }),
  )

  useHotkeys(
    () => hotkeys.current.CUT,
    (event) => {
      event.preventDefault()
      commands.handleCutKeyframes()
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: isOpen && model.selectedEditorKeyframes.length > 0 }),
  )

  useHotkeys(
    () => hotkeys.current.PASTE,
    (event) => {
      event.preventDefault()
      commands.handlePasteKeyframes()
    },
    () => ({
      ...HOTKEY_OPTIONS,
      enabled: isOpen && !!model.selectedItemForEditor && !!keyframeClipboard.current,
    }),
  )

  const scrubAdd = useKeyframeScrubAdd(() => ({
    selectedItemForEditor: model.selectedItemForEditor,
    selectedItemKeyframes: model.selectedItemKeyframes,
    keyframesByProperty: model.keyframesByProperty,
    vectorBaseTransform: model.vectorBaseTransform,
    canvas: viewState.canvas,
    allItemsById: model.allItemsById,
    allKeyframesByItemId: model.allKeyframesByItemId,
    t,
    isVectorFrameBlocked: vector.isVectorFrameBlocked,
    promoteVectorProperty: vector.promoteVectorProperty,
    selectKeyframes,
    keyframeEditorScrubbingRef,
  }))

  const values = useKeyframePropertyValues(() => ({
    selectedItemForEditor: model.selectedItemForEditor,
    selectedItemKeyframes: model.selectedItemKeyframes,
    selectedEditorKeyframes: model.selectedEditorKeyframes,
    keyframesByProperty: model.keyframesByProperty,
    availableProperties: model.availableProperties,
    vectorControlRows: model.vectorControlRows,
    vectorResolvedTransform: model.vectorResolvedTransform,
    vectorPreExpressionTransform: model.vectorPreExpressionTransform,
    vectorBaseTransform: model.vectorBaseTransform,
    relativeFrame: model.relativeFrame,
    currentFrame: model.currentFrame,
    canvas: viewState.canvas,
    surface,
    allItemsById: model.allItemsById,
    allKeyframesByItemId: model.allKeyframesByItemId,
    selectedKeyframes: model.selectedKeyframes,
    isVectorFrameBlocked: vector.isVectorFrameBlocked,
    ensureVectorKeyframeForLiveEdit: vector.ensureVectorKeyframeForLiveEdit,
    getNextVectorAxisValue: model.getNextVectorAxisValue,
    handleVectorValueCommit: vector.handleVectorValueCommit,
    selectKeyframe,
    selectKeyframes,
    _updateKeyframe,
    _addKeyframe,
    _removeKeyframesForProperty,
    valueScrubCreatedKeyframesRef,
  }))

  const isSidePlacement = $derived(placement === 'side')

  const sideContentHeight = $derived(
    Math.max(
      MIN_CONTENT_HEIGHT,
      chrome.parentHeight > 0 ? chrome.parentHeight - chrome.panelHeaderHeight : MIN_CONTENT_HEIGHT,
    ),
  )
  const resolvedContentHeight = $derived(
    isSidePlacement ? sideContentHeight : chrome.clampedContentHeight,
  )

  // Calculate total panel height for proper flex sizing
  // When closed, show just the header; when open, show header + resize handle + content
  const panelHeight = $derived(
    isOpen
      ? chrome.panelHeaderHeight + RESIZE_HANDLE_HEIGHT + chrome.clampedContentHeight
      : chrome.panelHeaderHeight,
  )

  // The editor only renders for a selected item once the container has a
  // measured width; the props it is passed are built under the same guard.
  const dopesheetEditorProps = $derived.by(() => {
    const selectedItemForEditor = model.selectedItemForEditor
    const containerWidth = chrome.containerWidth
    if (!selectedItemForEditor || containerWidth <= 0) return null
    return buildDopesheetEditorProps({
      surface,
      selectedItemForEditor,
      containerWidth,
      resolvedContentHeight,
      maxItemEndFrame: model.maxItemEndFrame,
      canvas: viewState.canvas,
      currentFrame: model.currentFrame,
      relativeFrame: model.relativeFrame,
      effectiveEditorMode: viewState.effectiveEditorMode,
      effectiveSelectedProperty: model.effectiveSelectedProperty,
      keyframesByProperty: model.keyframesByProperty,
      selectedItemKeyframes: model.selectedItemKeyframes,
      propertyValues: values.propertyValues,
      preExpressionPropertyValues: values.preExpressionPropertyValues,
      selectedKeyframeIds: model.selectedKeyframeIds,
      selectedEditorKeyframes: model.selectedEditorKeyframes,
      selectedEditorEasing: model.selectedEditorEasing,
      easingOptions,
      trimmedKeyframeCount: model.trimmedKeyframeCount,
      transitionBlockedRanges: model.transitionBlockedRanges,
      proceduralPreview: model.proceduralPreview,
      canBakeProceduralMotion: model.canBakeProceduralMotion,
      propertyLinkSourceLabels,
      handlePropertyLinkPointerDown,
      handleRemovePropertyLink,
      resolveExpressionReference: values.resolveExpressionReference,
      handleSetPropertyExpression: values.handleSetPropertyExpression,
      handleRemovePropertyExpression: values.handleRemovePropertyExpression,
      hiddenVectorPropertyRows: vector.hiddenVectorPropertyRows,
      compoundPropertyRows: vector.compoundPropertyRows,
      compoundSecondaryProperties: vector.compoundSecondaryProperties,
      dimensionSeparationByProperty: vector.dimensionSeparationByProperty,
      classicAxisConstraints: vector.classicAxisConstraints,
      activeVectorRow: vector.activeVectorRow,
      vectorGraphMode: viewState.vectorGraphMode,
      setVectorGraphMode: viewState.setVectorGraphMode,
      vectorSpeedGraphContent: vector.vectorSpeedGraphProps ? vectorSpeedGraphContent : undefined,
      editTextMotionBands: textMotion.editTextMotionBands,
      handleTextMotionDurationDragStart: textMotion.handleTextMotionDurationDragStart,
      handleTextMotionDurationCommit: textMotion.handleTextMotionDurationCommit,
      handleTextMotionDurationCancel: textMotion.handleTextMotionDurationCancel,
      handleTextMotionOffsetDragStart: textMotion.handleTextMotionOffsetDragStart,
      handleTextMotionOffsetCommit: textMotion.handleTextMotionOffsetCommit,
      handleTextMotionOffsetCancel: textMotion.handleTextMotionOffsetCancel,
      handleTextMotionBandClick: textMotion.handleTextMotionBandClick,
      editTimelineFps: geometry.editTimelineFps,
      editTimelineFrameViewport: geometry.editTimelineFrameViewport,
      editTimelineGlobalFrameToPixels: geometry.editTimelineGlobalFrameToPixels,
      editTimelineScrollLeft: geometry.editTimelineScrollLeft,
      editTimelinePixelsPerSecond: geometry.editTimelinePixelsPerSecond,
      editTimelineViewportWidth: geometry.editTimelineViewportWidth,
      getEditTimelineLivePixelsPerSecond: geometry.getEditTimelineLivePixelsPerSecond,
      handleEditTimelineEdgeScroll: geometry.handleEditTimelineEdgeScroll,
      timelineScrollContainer,
      handleTrimAnimation: model.handleTrimAnimation,
      handleKeyframeMove: commands.handleKeyframeMove,
      handleKeyframesMove: commands.handleKeyframesMove,
      handleBezierHandleMove: commands.handleBezierHandleMove,
      handleSegmentEasingChange: commands.handleSegmentEasingChange,
      handleSelectionChange: commands.handleSelectionChange,
      handlePropertyChange: commands.handlePropertyChange,
      setSelectedProperty: viewState.setSelectedProperty,
      handleScrub: scrubAdd.handleScrub,
      handleSkim: scrubAdd.handleSkim,
      handleScrubStart: scrubAdd.handleScrubStart,
      handleScrubEnd: scrubAdd.handleScrubEnd,
      handleDragStart: commands.handleDragStart,
      handleDragEnd: commands.handleDragEnd,
      handleDragCancel: commands.handleDragCancel,
      handleAddKeyframe: scrubAdd.handleAddKeyframe,
      handleDuplicateKeyframes: scrubAdd.handleDuplicateKeyframes,
      handlePropertyValueCommit: values.handlePropertyValueCommit,
      handlePropertyValuePreview: values.handlePropertyValuePreview,
      handleResetPropertiesToDefault: values.handleResetPropertiesToDefault,
      handleRemoveKeyframes: commands.handleRemoveKeyframes,
      handleCopyKeyframes: commands.handleCopyKeyframes,
      handleCutKeyframes: commands.handleCutKeyframes,
      handlePasteKeyframes: commands.handlePasteKeyframes,
      handleSelectedKeyframeEasingChange: commands.handleSelectedKeyframeEasingChange,
      handleNavigateToKeyframe: commands.handleNavigateToKeyframe,
      keyframeClipboard: keyframeClipboard.current,
      isKeyframeClipboardCut: isKeyframeClipboardCut.current,
      setBakeDialogOpen,
      splitView,
      initialVisibleGroupIds,
      propertyColumnWidth,
      isPointerWithinEditor,
      isFocusWithinEditor,
      hotkeys: hotkeys.current,
    })
  })

  const handlePointerEnter = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    isPointerWithinEditor = true
    const target = event.currentTarget
    const activeElement = (target.getRootNode() as Document | ShadowRoot).activeElement
    if (!target.contains(activeElement)) {
      target.focus({ preventScroll: true })
    }
  }

  const handleFocusOut = (event: FocusEvent & { currentTarget: HTMLDivElement }) => {
    const nextFocused = event.relatedTarget as Node | null
    if (event.currentTarget.contains(nextFocused)) {
      return
    }
    isFocusWithinEditor = false
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedEditorKeyframes = model.selectedEditorKeyframes
      if (selectedEditorKeyframes.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        commands.handleRemoveKeyframes(selectedEditorKeyframes.map(({ ref }) => ref))
      }
    }
  }

  const handleBoundaryError = (error: unknown) => {
    if (import.meta.env.DEV) {
      logger.error('ErrorBoundary caught:', error)
    }
  }
</script>

{#snippet vectorSpeedGraphContent()}
  {#if vector.vectorSpeedGraphProps}
    <VectorSpeedGraph {...vector.vectorSpeedGraphProps} />
  {/if}
{/snippet}

{#snippet resizeHandle()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-resize-handle="true"
    class={cn(
      'h-1.5 cursor-ns-resize flex items-center justify-center',
      'bg-secondary/30 hover:bg-primary/30 transition-colors',
      chrome.isResizing && 'bg-primary/50',
    )}
    onmousedown={chrome.handleResizeStart}
  >
    <div class="w-8 h-0.5 rounded-full bg-muted-foreground/30"></div>
  </div>
{/snippet}

<!-- Only render the docked editor when explicitly opened from the toolbar/hotkey.
     Selecting a clip should not surface the docked panel by itself. -->
{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
  <div
    bind:this={chrome.panel}
    data-pick-whip-scroll-area="true"
    tabindex={-1}
    onpointerenter={handlePointerEnter}
    onpointerleave={() => {
      isPointerWithinEditor = false
    }}
    onfocusin={() => {
      isFocusWithinEditor = true
    }}
    onfocusout={handleFocusOut}
    onkeydown={handleKeyDown}
    class={cn(
      'flex-shrink-0 bg-background overflow-hidden outline-none',
      isSidePlacement
        ? 'flex h-full min-h-0 flex-col border-0'
        : placement === 'top'
          ? 'border-b border-border'
          : 'border-t border-border',
      isOpen ? 'opacity-100' : 'opacity-90',
      !isSidePlacement && !chrome.isResizing && 'transition-all duration-200',
    )}
    style:height={isSidePlacement ? undefined : `${panelHeight}px`}
  >
    {#if placement === 'bottom'}
      {@render resizeHandle()}
    {/if}

    <KeyframeGraphPanelHeader
      {surface}
      selectedItemForEditor={model.selectedItemForEditor}
      effectiveEditorMode={viewState.effectiveEditorMode}
      {splitView}
      setEditorMode={viewState.setEditorMode}
      {isFocusMode}
      {onFocusModeChange}
      {showCloseButton}
      {onClose}
    />

    <!-- Keyframe editor content -->
    <div
      bind:this={chrome.container}
      class={cn('min-h-0', surface === 'edit' ? 'p-0' : 'p-2', isSidePlacement && 'flex-1')}
      style:height={isSidePlacement ? undefined : `${chrome.clampedContentHeight}px`}
    >
      {#if dopesheetEditorProps}
        <svelte:boundary onerror={handleBoundaryError}>
          <DopesheetEditor {...dopesheetEditorProps} />
          {#snippet failed(error, reset)}
            <div class="flex flex-col items-center justify-center p-8 gap-4 text-center">
              <AlertTriangle class="h-12 w-12 text-destructive" />
              <div>
                <h2 class="text-lg font-semibold">{t('app.errorBoundary.componentError')}</h2>
                <p class="text-sm text-muted-foreground mt-1">
                  {(error instanceof Error ? error.message : '') ||
                    t('app.errorBoundary.unexpectedError')}
                </p>
              </div>
              <div class="flex gap-2">
                <Button onclick={reset} variant="outline">
                  <RefreshCw class="h-4 w-4 mr-2" />
                  {t('app.errorBoundary.tryAgain')}
                </Button>
              </div>
              {#if import.meta.env.DEV && error instanceof Error && error.stack}
                <pre
                  class="mt-4 p-4 bg-muted rounded text-xs text-left overflow-auto max-w-full max-h-48">{error.stack}</pre>
              {/if}
            </div>
          {/snippet}
        </svelte:boundary>
      {:else}
        <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
          {model.selectedItemForEditor
            ? t('common.loading')
            : t('timeline.keyframeEditor.selectItem')}
        </div>
      {/if}
    </div>

    {#if placement === 'top'}
      {@render resizeHandle()}
    {/if}
    {#if propertyLink.drag}
      <PropertyLinkPickWhipOverlay drag={propertyLink.drag} />
    {/if}
    <MotionBakeConfirmationDialog
      open={bakeDialogOpen}
      onOpenChange={setBakeDialogOpen}
      onConfirm={handleBakeProceduralMotion}
    />
  </div>
{/if}
