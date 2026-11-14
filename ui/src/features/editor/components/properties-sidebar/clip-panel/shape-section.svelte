<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Shapes from 'lucide-svelte/icons/shapes'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { TimelineItem } from '@/types/timeline'
  import { useGizmoStore, useMaskEditorStore } from '@/features/editor/deps/preview'
  import { PropertySection, PropertyRow } from '../components'
  import { SHAPE_TYPE_OPTIONS } from './shape-section-constants'
  import { useShapeSectionSelection } from './use-shape-section-selection.svelte'
  import ShapeFillControls from './shape-fill-controls.svelte'
  import ShapeKindControls from './shape-kind-controls.svelte'
  import ShapePathControls from './shape-path-controls.svelte'
  import ShapeMaskControls from './shape-mask-controls.svelte'
  import ShapeTrimTaperControls from './shape-trim-taper-controls.svelte'
  import { ShapeStrokeControls, ShapeStrokeJoinControls } from './shape-stroke-controls'
  import { useShapeSectionHandlers } from './use-shape-section-handlers.svelte'

  interface ShapeSectionProps {
    items: TimelineItem[]
  }

  /**
   * Shape section - properties for shape items (shapeType, colors, stroke, etc.)
   */
  let { items }: ShapeSectionProps = $props()

  const isEditing = select(useMaskEditorStore, (s) => s.isEditing)
  const editingItemId = select(useMaskEditorStore, (s) => s.editingItemId)
  const penMode = select(useMaskEditorStore, (s) => s.penMode)
  const selectedVertexIndex = select(useMaskEditorStore, (s) => s.selectedVertexIndex)
  const startEditing = (itemId: string) => useMaskEditorStore.getState().startEditing(itemId)
  const stopEditing = () => useMaskEditorStore.getState().stopEditing()

  const selection = useShapeSectionSelection(() => ({
    items,
    isEditing: isEditing.current,
    editingItemId: editingItemId.current,
    penMode: penMode.current,
  }))

  const handlers = useShapeSectionHandlers(() => ({
    shapeItems: selection.shapeItems,
    itemIds: selection.itemIds,
    sharedValues: selection.sharedValues,
    singlePathShape: selection.singlePathShape,
    pathTopologyLocked: selection.pathTopologyLocked,
    selectedVertexIndex: selectedVertexIndex.current,
    // Gizmo store for live property preview
    setPropertiesPreviewNew: useGizmoStore.getState().setPropertiesPreviewNew,
    clearPreview: useGizmoStore.getState().clearPreview,
  }))

  const {
    updateShapeItems,
    handleShapeTypeChange,
    handleFillColorLiveChange,
    handleFillColorChange,
    handleStrokeColorLiveChange,
    handleStrokeColorChange,
    handleStrokeWidthLiveChange,
    handleStrokeWidthChange,
    handleFillEnabledChange,
    handleFillTypeChange,
    handleGradientStartColorLiveChange,
    handleGradientStartColorChange,
    handleGradientEndColorLiveChange,
    handleGradientEndColorChange,
    handleGradientAngleLiveChange,
    handleGradientAngleChange,
    handleSwapGradientColors,
    handleStrokeEnabledChange,
    handleStrokeMiterLimitLiveChange,
    handleStrokeMiterLimitChange,
    handlePathClosedChange,
    handleReversePath,
    handleSetFirstVertex,
    handleCornerRadiusLiveChange,
    handleCornerRadiusChange,
    handleDirectionChange,
    handlePointsLiveChange,
    handlePointsChange,
    handleInnerRadiusLiveChange,
    handleInnerRadiusChange,
    previewStrokePathProperty,
    commitStrokePathProperty,
    resetNumericProperty,
    handleIsMaskChange,
    handleMaskTypeChange,
    handleMaskFeatherLiveChange,
    handleMaskFeatherChange,
    handleMaskOpacityLiveChange,
    handleMaskOpacityChange,
    handleMaskInvertChange,
  } = handlers

  const sharedValues = $derived(selection.sharedValues)
  const controlVisibility = $derived(selection.controlVisibility)
</script>

{#if selection.shapeItems.length > 0 && sharedValues}
  <PropertySection title={t('editor.shapeSection.shape')} icon={Shapes} defaultOpen={true}>
    <!-- Shape Type -->
    <PropertyRow label={t('editor.shapeSection.type')}>
      <Select value={sharedValues.shapeType} onValueChange={handleShapeTypeChange}>
        <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
          <SelectValue
            placeholder={sharedValues.shapeType === undefined
              ? t('editor.shapeSection.mixed')
              : t('editor.shapeSection.selectShape')}
          />
        </SelectTrigger>
        <SelectContent>
          {#each SHAPE_TYPE_OPTIONS as shape (shape.value)}
            <SelectItem value={shape.value} class="text-xs">
              {t(shape.labelKey)}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </PropertyRow>

    <ShapePathControls
      pathItemId={selection.singlePathShape?.id ?? null}
      isEditingPath={selection.isEditingPathShape}
      isMaskOnly={controlVisibility.isMaskOnly}
      showPathClosure={controlVisibility.showPathClosure}
      pathClosed={sharedValues.pathClosed}
      selectedVertexIndex={selectedVertexIndex.current}
      {startEditing}
      {stopEditing}
      onReversePath={handleReversePath}
      onPathClosedChange={handlePathClosedChange}
      onSetFirstVertex={handleSetFirstVertex}
    />

    <ShapeFillControls
      visible={controlVisibility.showFill}
      fillEnabled={sharedValues.fillEnabled}
      fillType={sharedValues.fillType}
      fillColor={sharedValues.fillColor}
      gradientStartColor={sharedValues.gradientStartColor}
      gradientEndColor={sharedValues.gradientEndColor}
      gradientAngle={sharedValues.gradientAngle}
      onFillEnabledChange={handleFillEnabledChange}
      onFillTypeChange={handleFillTypeChange}
      onFillColorChange={handleFillColorChange}
      onFillColorLiveChange={handleFillColorLiveChange}
      onGradientStartColorChange={handleGradientStartColorChange}
      onGradientStartColorLiveChange={handleGradientStartColorLiveChange}
      onGradientEndColorChange={handleGradientEndColorChange}
      onGradientEndColorLiveChange={handleGradientEndColorLiveChange}
      onGradientAngleChange={handleGradientAngleChange}
      onGradientAngleLiveChange={handleGradientAngleLiveChange}
      onSwapGradientColors={handleSwapGradientColors}
    />

    <ShapeStrokeControls
      showStroke={controlVisibility.showStroke}
      showNoAppearanceNotice={controlVisibility.showNoAppearanceNotice}
      strokeEnabled={sharedValues.strokeEnabled}
      strokeWidth={sharedValues.strokeWidth}
      strokeColor={sharedValues.strokeColor}
      onStrokeEnabledChange={handleStrokeEnabledChange}
      onStrokeWidthChange={handleStrokeWidthChange}
      onStrokeWidthLiveChange={handleStrokeWidthLiveChange}
      onStrokeWidthReset={() =>
        resetNumericProperty('strokeWidth', selection.singlePathShape ? 4 : 1)}
      onStrokeColorChange={handleStrokeColorChange}
      onStrokeColorLiveChange={handleStrokeColorLiveChange}
    />

    <ShapeStrokeJoinControls
      showStroke={controlVisibility.showStroke}
      strokeEnabled={sharedValues.strokeEnabled}
      showLineCap={controlVisibility.showLineCap}
      showLineJoin={controlVisibility.showLineJoin}
      strokeLineCap={sharedValues.strokeLineCap}
      strokeLineJoin={sharedValues.strokeLineJoin}
      strokeMiterLimit={sharedValues.strokeMiterLimit}
      {updateShapeItems}
      onStrokeMiterLimitChange={handleStrokeMiterLimitChange}
      onStrokeMiterLimitLiveChange={handleStrokeMiterLimitLiveChange}
      onStrokeMiterLimitReset={() => resetNumericProperty('strokeMiterLimit', 4)}
    />

    <ShapeKindControls
      shapeType={sharedValues.shapeType}
      cornerRadius={sharedValues.cornerRadius}
      direction={sharedValues.direction}
      points={sharedValues.points}
      innerRadius={sharedValues.innerRadius}
      onCornerRadiusChange={handleCornerRadiusChange}
      onCornerRadiusLiveChange={handleCornerRadiusLiveChange}
      onCornerRadiusReset={() => resetNumericProperty('cornerRadius', 0)}
      onDirectionChange={handleDirectionChange}
      onPointsChange={handlePointsChange}
      onPointsLiveChange={handlePointsLiveChange}
      onInnerRadiusChange={handleInnerRadiusChange}
      onInnerRadiusLiveChange={handleInnerRadiusLiveChange}
      onInnerRadiusReset={() => resetNumericProperty('innerRadius', 0.5)}
    />

    <ShapeTrimTaperControls
      showTrimPaths={controlVisibility.showTrimPaths}
      showTaper={controlVisibility.showTaper}
      trimPathStart={sharedValues.trimPathStart}
      trimPathEnd={sharedValues.trimPathEnd}
      trimPathOffset={sharedValues.trimPathOffset}
      taperStartWidth={sharedValues.taperStartWidth}
      taperEndWidth={sharedValues.taperEndWidth}
      taperStartLength={sharedValues.taperStartLength}
      taperEndLength={sharedValues.taperEndLength}
      itemIds={selection.itemIds}
      onPreviewProperty={previewStrokePathProperty}
      onCommitProperty={commitStrokePathProperty}
      onResetProperty={resetNumericProperty}
    />

    <ShapeMaskControls
      isMask={sharedValues.isMask}
      maskType={sharedValues.maskType}
      maskFeather={sharedValues.maskFeather}
      maskOpacity={sharedValues.maskOpacity}
      maskInvert={sharedValues.maskInvert}
      onIsMaskChange={handleIsMaskChange}
      onMaskTypeChange={handleMaskTypeChange}
      onMaskFeatherChange={handleMaskFeatherChange}
      onMaskFeatherLiveChange={handleMaskFeatherLiveChange}
      onMaskFeatherReset={() => resetNumericProperty('maskFeather', 10)}
      onMaskOpacityChange={handleMaskOpacityChange}
      onMaskOpacityLiveChange={handleMaskOpacityLiveChange}
      onMaskOpacityReset={() => resetNumericProperty('maskOpacity', 100)}
      onMaskInvertChange={handleMaskInvertChange}
    />
  </PropertySection>
{/if}
