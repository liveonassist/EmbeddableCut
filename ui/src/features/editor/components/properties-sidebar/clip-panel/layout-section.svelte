<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  type MixedValue = number | 'mixed'

  /** Common transform properties that both gizmo and resolved transforms share */
  type TransformValues = {
    x: number
    y: number
    width: number
    height: number
    anchorX: number
    anchorY: number
    rotation: number
  }

  const mixedOf = (
    resolvedValues: TransformValues[],
    getter: (resolved: TransformValues) => number,
  ): MixedValue => {
    const values = resolvedValues.map(getter)
    const firstValue = values[0]!
    return values.every((v) => Math.abs(v - firstValue) < 0.1) ? firstValue : 'mixed'
  }
</script>

<script lang="ts">
  import Move from 'lucide-svelte/icons/move'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import Link2 from 'lucide-svelte/icons/link-2'
  import Link2Off from 'lucide-svelte/icons/link-2-off'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Switch } from '@/components/ui/switch'
  import type { TimelineItem, VideoItem, CompositionItem } from '@/types/timeline'
  import type { TransformProperties, CanvasSettings } from '@/types/transform'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
  import {
    applyAutoKeyframeOperations,
    updateItemsTransformMap,
  } from '@/features/editor/deps/timeline-store'
  import { resolveTransform, getSourceDimensions } from '@/features/editor/deps/composition-runtime'
  import {
    getAutoKeyframeOperation as getAutoKeyframeOp,
    type AutoKeyframeOperation,
    resolveAnimatedTransform,
    KeyframeToggle,
  } from '@/features/editor/deps/keyframes'
  import { PropertySection, PropertyRow, NumberInput, SliderInput } from '../components'
  import { applyAutoKeyframedTransformChange } from './auto-keyframe-transform'
  import { useKeyframesByItemId } from './use-keyframes-by-item-id.svelte'
  import { demixValue } from '../utils'
  import PositionAxisControl from './layout-position-axis-control.svelte'

  interface LayoutSectionProps {
    items: TimelineItem[]
    mediaTransformItems?: Array<VideoItem | CompositionItem>
    canvas: CanvasSettings
    onTransformChange: (ids: string[], updates: Partial<TransformProperties>) => void
    aspectLocked: boolean
    onAspectLockToggle: () => void
  }

  /**
   * Transform section - position, dimensions, and rotation.
   */
  let {
    items,
    mediaTransformItems = [],
    canvas,
    onTransformChange,
    aspectLocked,
    onAspectLockToggle,
  }: LayoutSectionProps = $props()

  // Same ids keep the same array, so the axis controls and keyframe toggles
  // don't see a new selection when an unrelated item field changes.
  let stableItemIds: string[] = []
  const itemIds = $derived.by(() => {
    const nextItemIds = items.map((item) => item.id)
    if (
      stableItemIds.length !== nextItemIds.length ||
      stableItemIds.some((itemId, index) => itemId !== nextItemIds[index])
    ) {
      stableItemIds = nextItemIds
    }
    return stableItemIds
  })
  const mediaTransformItemIds = $derived(mediaTransformItems.map((item) => item.id))
  const itemsById = $derived(new Map(items.map((item) => [item.id, item])))

  // Get current playhead frame for keyframe animation (throttled to reduce re-renders)
  const currentFrame = useThrottledFrame()

  const keyframesByItemId = useKeyframesByItemId(() => itemIds)

  // Gizmo store for live preview (both for properties panel and gizmo drag sync)
  const { setTransformPreview, clearPreview, clearInteraction } = useGizmoStore.getState()

  const clearTransformUiState = () => {
    clearPreview()
    clearInteraction()
  }

  // Resolve committed transforms once for all items. Live gizmo position is
  // subscribed at the two tiny axis controls below so the full section and its
  // keyframe controls stay out of the canvas pointer hot path.
  const resolvedTransformsByItem = $derived.by(() => {
    const resolved = new Map<string, TransformValues>()
    for (const item of items) {
      const sourceDimensions = getSourceDimensions(item)
      const baseResolved = resolveTransform(item, canvas, sourceDimensions)
      const itemKeyframes = keyframesByItemId.current.get(item.id) ?? undefined
      const transform = itemKeyframes
        ? resolveAnimatedTransform(baseResolved, itemKeyframes, currentFrame.current - item.from)
        : baseResolved

      resolved.set(item.id, {
        x: transform.x,
        y: transform.y,
        width: transform.width,
        height: transform.height,
        anchorX: transform.anchorX ?? transform.width / 2,
        anchorY: transform.anchorY ?? transform.height / 2,
        rotation: transform.rotation,
      })
    }
    return resolved
  })

  // Compute all transform values at once to avoid repeated iterations.
  const sizeAndRotation = $derived.by(() => {
    if (items.length === 0) {
      return { width: 0 as MixedValue, height: 0 as MixedValue, rotation: 0 as MixedValue }
    }

    const resolvedValues = items
      .map((item) => resolvedTransformsByItem.get(item.id))
      .filter((value): value is TransformValues => value !== undefined)

    if (resolvedValues.length === 0) {
      return { width: 0 as MixedValue, height: 0 as MixedValue, rotation: 0 as MixedValue }
    }

    return {
      width: mixedOf(resolvedValues, (r) => r.width),
      height: mixedOf(resolvedValues, (r) => r.height),
      rotation: mixedOf(resolvedValues, (r) => r.rotation),
    }
  })
  const width = $derived(sizeAndRotation.width)
  const height = $derived(sizeAndRotation.height)
  const rotation = $derived(sizeAndRotation.rotation)

  const flipHorizontal = $derived.by((): boolean | 'mixed' => {
    if (mediaTransformItems.length === 0) return false
    const firstValue = mediaTransformItems[0]?.transform?.flipHorizontal ?? false
    return mediaTransformItems.every(
      (item) => (item.transform?.flipHorizontal ?? false) === firstValue,
    )
      ? firstValue
      : 'mixed'
  })

  const flipVertical = $derived.by((): boolean | 'mixed' => {
    if (mediaTransformItems.length === 0) return false
    const firstValue = mediaTransformItems[0]?.transform?.flipVertical ?? false
    return mediaTransformItems.every(
      (item) => (item.transform?.flipVertical ?? false) === firstValue,
    )
      ? firstValue
      : 'mixed'
  })

  const mediaAnchor = $derived.by(() => {
    if (mediaTransformItems.length === 0) {
      return { mediaAnchorX: 0 as MixedValue, mediaAnchorY: 0 as MixedValue }
    }

    const resolvedValues = mediaTransformItems
      .map((item) => resolvedTransformsByItem.get(item.id))
      .filter((value): value is TransformValues => value !== undefined)

    if (resolvedValues.length === 0) {
      return { mediaAnchorX: 0 as MixedValue, mediaAnchorY: 0 as MixedValue }
    }

    return {
      mediaAnchorX: mixedOf(resolvedValues, (r) => r.anchorX),
      mediaAnchorY: mixedOf(resolvedValues, (r) => r.anchorY),
    }
  })
  const mediaAnchorX = $derived(mediaAnchor.mediaAnchorX)
  const mediaAnchorY = $derived(mediaAnchor.mediaAnchorY)

  // Store current aspect ratio for linked dimensions
  const currentAspectRatio = $derived.by(() => {
    if (width === 'mixed' || height === 'mixed') return 1
    return height > 0 ? width / height : 1
  })

  // Helper: Build auto-keyframe operations for properties that are already animated.
  const getAutoKeyframeOperation = (
    itemId: string,
    property: 'x' | 'y' | 'width' | 'height' | 'anchorX' | 'anchorY' | 'rotation' | 'opacity',
    value: number,
  ): AutoKeyframeOperation | null => {
    const item = itemsById.get(itemId)
    if (!item) return null

    const itemKeyframes = keyframesByItemId.current.get(itemId) ?? undefined
    return getAutoKeyframeOp(item, itemKeyframes, property, value, currentFrame.current)
  }

  // Live preview for X position (during scrub)
  const handleXLiveChange = (value: number) => {
    const previews: Record<string, { x: number }> = {}
    items.forEach((item) => {
      previews[item.id] = { x: value }
    })
    setTransformPreview(previews)
  }

  // Commit X position (with auto-keyframe support)
  const handleXChange = (value: number) => {
    applyAutoKeyframedTransformChange({
      itemIds,
      updates: { x: value },
      getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'x', value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  // Live preview for Y position (during scrub)
  const handleYLiveChange = (value: number) => {
    const previews: Record<string, { y: number }> = {}
    items.forEach((item) => {
      previews[item.id] = { y: value }
    })
    setTransformPreview(previews)
  }

  // Commit Y position (with auto-keyframe support)
  const handleYChange = (value: number) => {
    applyAutoKeyframedTransformChange({
      itemIds,
      updates: { y: value },
      getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'y', value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  // Live preview for width (during scrub)
  const handleWidthLiveChange = (value: number) => {
    const previews: Record<string, { width: number; height?: number }> = {}
    items.forEach((item) => {
      if (aspectLocked && height !== 'mixed') {
        const newHeight = Math.round(value / currentAspectRatio)
        previews[item.id] = { width: value, height: newHeight }
      } else {
        previews[item.id] = { width: value }
      }
    })
    setTransformPreview(previews)
  }

  // Commit width (with auto-keyframe support)
  const handleWidthChange = (value: number) => {
    const newHeight =
      aspectLocked && height !== 'mixed' ? Math.round(value / currentAspectRatio) : null
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackUpdates = new Map<string, Partial<TransformProperties>>()
    for (const itemId of itemIds) {
      const widthOperation = getAutoKeyframeOperation(itemId, 'width', value)
      const heightOperation =
        newHeight !== null ? getAutoKeyframeOperation(itemId, 'height', newHeight) : null
      if (widthOperation) autoOps.push(widthOperation)
      if (heightOperation) autoOps.push(heightOperation)
      const updates: Partial<TransformProperties> = {}
      if (!widthOperation) {
        updates.width = value
      }
      if (newHeight !== null && !heightOperation) {
        updates.height = newHeight
      }
      if (Object.keys(updates).length > 0) {
        fallbackUpdates.set(itemId, updates)
      }
    }
    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackUpdates.size > 0) {
      updateItemsTransformMap(fallbackUpdates, { operation: 'resize' })
    }
    queueMicrotask(() => clearPreview())
  }

  // Live preview for height (during scrub)
  const handleHeightLiveChange = (value: number) => {
    const previews: Record<string, { width?: number; height: number }> = {}
    items.forEach((item) => {
      if (aspectLocked && width !== 'mixed') {
        const newWidth = Math.round(value * currentAspectRatio)
        previews[item.id] = { width: newWidth, height: value }
      } else {
        previews[item.id] = { height: value }
      }
    })
    setTransformPreview(previews)
  }

  // Commit height (with auto-keyframe support)
  const handleHeightChange = (value: number) => {
    const newWidth =
      aspectLocked && width !== 'mixed' ? Math.round(value * currentAspectRatio) : null
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackUpdates = new Map<string, Partial<TransformProperties>>()
    for (const itemId of itemIds) {
      const heightOperation = getAutoKeyframeOperation(itemId, 'height', value)
      const widthOperation =
        newWidth !== null ? getAutoKeyframeOperation(itemId, 'width', newWidth) : null
      if (heightOperation) autoOps.push(heightOperation)
      if (widthOperation) autoOps.push(widthOperation)
      const updates: Partial<TransformProperties> = {}
      if (!heightOperation) {
        updates.height = value
      }
      if (newWidth !== null && !widthOperation) {
        updates.width = newWidth
      }
      if (Object.keys(updates).length > 0) {
        fallbackUpdates.set(itemId, updates)
      }
    }
    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackUpdates.size > 0) {
      updateItemsTransformMap(fallbackUpdates, { operation: 'resize' })
    }
    queueMicrotask(() => clearPreview())
  }

  // Live preview for rotation (during drag)
  const handleRotationLiveChange = (value: number) => {
    const previews: Record<string, { rotation: number }> = {}
    items.forEach((item) => {
      previews[item.id] = { rotation: value }
    })
    setTransformPreview(previews)
  }

  // Commit rotation (on mouse up, with auto-keyframe support)
  const handleRotationChange = (value: number) => {
    applyAutoKeyframedTransformChange({
      itemIds,
      updates: { rotation: value },
      getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'rotation', value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  const handleAnchorXLiveChange = (value: number) => {
    if (mediaTransformItems.length === 0) return
    const previews: Record<string, { anchorX: number }> = {}
    mediaTransformItems.forEach((item) => {
      previews[item.id] = { anchorX: value }
    })
    setTransformPreview(previews)
  }

  const handleAnchorXChange = (value: number) => {
    if (mediaTransformItemIds.length === 0) return
    applyAutoKeyframedTransformChange({
      itemIds: mediaTransformItemIds,
      updates: { anchorX: value },
      getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'anchorX', value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  const handleAnchorYLiveChange = (value: number) => {
    if (mediaTransformItems.length === 0) return
    const previews: Record<string, { anchorY: number }> = {}
    mediaTransformItems.forEach((item) => {
      previews[item.id] = { anchorY: value }
    })
    setTransformPreview(previews)
  }

  const handleAnchorYChange = (value: number) => {
    if (mediaTransformItemIds.length === 0) return
    applyAutoKeyframedTransformChange({
      itemIds: mediaTransformItemIds,
      updates: { anchorY: value },
      getOperation: (itemId) => getAutoKeyframeOperation(itemId, 'anchorY', value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  // Get media items for fallback source dimensions lookup
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)

  // Reset scale to source dimensions (1:1 scale)
  // For shapes: reset to 1:1 aspect ratio (square based on smaller dimension)
  const handleResetScale = () => {
    const tolerance = 0.5

    // For each item, reset to its source dimensions
    items.forEach((item) => {
      // Get current dimensions
      const sourceDimensions = getSourceDimensions(item)
      const resolved = resolveTransform(item, canvas, sourceDimensions)

      // For shapes: reset to 1:1 aspect ratio
      if (item.type === 'shape' || item.type === 'text') {
        const size = Math.min(resolved.width, resolved.height)
        const updates: Partial<TransformProperties> = {}

        if (Math.abs(resolved.width - size) > tolerance) {
          updates.width = size
        }
        if (Math.abs(resolved.height - size) > tolerance) {
          updates.height = size
        }

        if (Object.keys(updates).length > 0) {
          onTransformChange([item.id], updates)
        }
        return
      }

      // First try to get source dimensions from the item itself
      let source = getSourceDimensions(item)

      // Fallback: look up dimensions from media library if item has mediaId
      if (!source && item.mediaId) {
        const media = mediaById.current[item.mediaId]
        if (media && media.width && media.height) {
          source = { width: media.width, height: media.height }
        }
      }

      if (!source) return

      // Only update if dimensions actually changed
      const updates: Partial<TransformProperties> = {}
      if (Math.abs(resolved.width - source.width) > tolerance) {
        updates.width = source.width
      }
      if (Math.abs(resolved.height - source.height) > tolerance) {
        updates.height = source.height
      }

      // Skip if no actual changes
      if (Object.keys(updates).length === 0) return

      onTransformChange([item.id], updates)
    })
    queueMicrotask(clearTransformUiState)
  }

  // Reset position to center (x=0, y=0)
  const handleResetPosition = () => {
    const tolerance = 0.5
    items.forEach((item) => {
      const sourceDimensions = getSourceDimensions(item)
      const resolved = resolveTransform(item, canvas, sourceDimensions)

      const updates: Partial<TransformProperties> = {}
      if (Math.abs(resolved.x) > tolerance) updates.x = 0
      if (Math.abs(resolved.y) > tolerance) updates.y = 0

      if (Object.keys(updates).length === 0) return
      onTransformChange([item.id], updates)
    })
    queueMicrotask(clearTransformUiState)
  }

  // Reset rotation to 0°
  const handleResetRotation = () => {
    const tolerance = 0.5
    items.forEach((item) => {
      const sourceDimensions = getSourceDimensions(item)
      const resolved = resolveTransform(item, canvas, sourceDimensions)

      if (Math.abs(resolved.rotation) <= tolerance) return
      onTransformChange([item.id], { rotation: 0 })
    })
    queueMicrotask(clearTransformUiState)
  }

  const handleFlipHorizontalChange = (checked: boolean) => {
    if (mediaTransformItemIds.length === 0) return
    onTransformChange(mediaTransformItemIds, { flipHorizontal: checked })
  }

  const handleFlipVerticalChange = (checked: boolean) => {
    if (mediaTransformItemIds.length === 0) return
    onTransformChange(mediaTransformItemIds, { flipVertical: checked })
  }

  const handleResetAnchor = () => {
    if (mediaTransformItems.length === 0) return
    const needsReset = mediaTransformItems.some(
      (item) => item.transform?.anchorX !== undefined || item.transform?.anchorY !== undefined,
    )
    if (needsReset) {
      onTransformChange(mediaTransformItemIds, {
        anchorX: undefined,
        anchorY: undefined,
      })
    }
    queueMicrotask(clearTransformUiState)
  }
</script>

<PropertySection title={t('editor.layoutSection.transform')} icon={Move} defaultOpen={true}>
  <!-- Position -->
  <PropertyRow label={t('editor.layoutSection.position')}>
    <div class="flex items-start gap-1 w-full">
      <div class="grid grid-cols-2 gap-1 flex-1">
        <PositionAxisControl
          axis="x"
          {itemIds}
          {canvas}
          onChange={handleXChange}
          onLiveChange={handleXLiveChange}
        />
        <PositionAxisControl
          axis="y"
          {itemIds}
          {canvas}
          onChange={handleYChange}
          onLiveChange={handleYLiveChange}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleResetPosition}
        title={t('editor.layoutSection.resetPosition')}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>

  <!-- Dimensions -->
  <PropertyRow label={t('editor.layoutSection.size')}>
    <div class="flex items-center gap-1 w-full">
      <NumberInput
        value={width}
        onChange={handleWidthChange}
        onLiveChange={handleWidthLiveChange}
        label="W"
        unit="px"
        min={1}
        max={7680}
        step={1}
        class="flex-1 min-w-0"
      />
      <KeyframeToggle {itemIds} property="width" currentValue={demixValue(width, 100)} />
      <Button
        variant="ghost"
        size="icon"
        class={`h-7 w-7 flex-shrink-0 ${aspectLocked ? 'text-primary' : ''}`}
        onclick={onAspectLockToggle}
        title={aspectLocked
          ? t('editor.layoutSection.unlockAspect')
          : t('editor.layoutSection.lockAspect')}
      >
        {#if aspectLocked}
          <Link2 class="w-3.5 h-3.5" />
        {:else}
          <Link2Off class="w-3.5 h-3.5" />
        {/if}
      </Button>
      <NumberInput
        value={height}
        onChange={handleHeightChange}
        onLiveChange={handleHeightLiveChange}
        label="H"
        unit="px"
        min={1}
        max={7680}
        step={1}
        class="flex-1 min-w-0"
      />
      <KeyframeToggle {itemIds} property="height" currentValue={demixValue(height, 100)} />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleResetScale}
        title={t('editor.layoutSection.resetSize')}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>

  <!-- Rotation -->
  <PropertyRow label={t('editor.layoutSection.rotation')}>
    <div class="flex items-center gap-1 w-full">
      <SliderInput
        value={rotation}
        onChange={handleRotationChange}
        onLiveChange={handleRotationLiveChange}
        min={-180}
        max={180}
        step={1}
        unit="°"
        class="flex-1 min-w-0"
      />
      <KeyframeToggle {itemIds} property="rotation" currentValue={demixValue(rotation, 0)} />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleResetRotation}
        title={t('editor.layoutSection.resetRotation')}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>

  {#if mediaTransformItems.length > 0}
    <PropertyRow label={t('editor.layoutSection.anchor')}>
      <div class="flex items-center gap-1 w-full">
        <div class="flex items-center gap-0.5 flex-1 min-w-0">
          <NumberInput
            value={mediaAnchorX}
            onChange={handleAnchorXChange}
            onLiveChange={handleAnchorXLiveChange}
            label="X"
            unit="px"
            step={1}
            class="flex-1 min-w-0"
          />
          <KeyframeToggle
            itemIds={mediaTransformItemIds}
            property="anchorX"
            currentValue={demixValue(mediaAnchorX, 0)}
          />
        </div>
        <div class="flex items-center gap-0.5 flex-1 min-w-0">
          <NumberInput
            value={mediaAnchorY}
            onChange={handleAnchorYChange}
            onLiveChange={handleAnchorYLiveChange}
            label="Y"
            unit="px"
            step={1}
            class="flex-1 min-w-0"
          />
          <KeyframeToggle
            itemIds={mediaTransformItemIds}
            property="anchorY"
            currentValue={demixValue(mediaAnchorY, 0)}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetAnchor}
          title={t('editor.layoutSection.resetAnchor')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>
  {/if}

  {#if mediaTransformItems.length > 0}
    <PropertyRow label={t('editor.layoutSection.flip')}>
      <div class="flex items-center justify-between gap-3 w-full">
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={demixValue(flipHorizontal, false)}
            onCheckedChange={handleFlipHorizontalChange}
            aria-label={t('editor.layoutSection.flipHorizontalAria')}
          />
          <span>
            {flipHorizontal === 'mixed'
              ? t('editor.layoutSection.horizontalMixed')
              : t('editor.layoutSection.horizontal')}
          </span>
        </label>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={demixValue(flipVertical, false)}
            onCheckedChange={handleFlipVerticalChange}
            aria-label={t('editor.layoutSection.flipVerticalAria')}
          />
          <span>
            {flipVertical === 'mixed'
              ? t('editor.layoutSection.verticalMixed')
              : t('editor.layoutSection.vertical')}
          </span>
        </label>
      </div>
    </PropertyRow>
  {/if}
</PropertySection>
