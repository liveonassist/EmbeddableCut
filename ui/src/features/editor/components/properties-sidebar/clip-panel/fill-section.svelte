<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Droplet from 'lucide-svelte/icons/droplet'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { TimelineItem } from '@/types/timeline'
  import type { BlendMode } from '@/types/blend-modes'
  import { BLEND_MODE_GROUPS, BLEND_MODE_LABELS } from '@/types/blend-modes'
  import type { TransformProperties, CanvasSettings } from '@/types/transform'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import { applyAutoKeyframeOperations, updateItem } from '@/features/editor/deps/timeline-store'
  import { resolveTransform, getSourceDimensions } from '@/features/editor/deps/composition-runtime'
  import {
    getAutoKeyframeOperation,
    type AutoKeyframeOperation,
    resolveAnimatedTransform,
    KeyframeToggle,
  } from '@/features/editor/deps/keyframes'
  import { PropertySection, PropertyRow, NumberInput, SliderInput } from '../components'
  import { applyAutoKeyframedTransformChange } from './auto-keyframe-transform'
  import { useKeyframesByItemId } from './use-keyframes-by-item-id.svelte'
  import { demixValue } from '../utils'

  interface FillSectionProps {
    items: TimelineItem[]
    canvas: CanvasSettings
    onTransformChange: (ids: string[], updates: Partial<TransformProperties>) => void
  }

  type MixedValue = number | 'mixed'

  /**
   * Composite section - opacity, blend mode, and corner radius.
   */
  let { items, canvas, onTransformChange }: FillSectionProps = $props()

  const itemIds = $derived(items.map((item) => item.id))
  const itemsById = $derived(new Map(items.map((item) => [item.id, item])))

  // Get current playhead frame for keyframe animation (throttled to reduce re-renders)
  const currentFrame = useThrottledFrame()

  const keyframesByItemId = useKeyframesByItemId(() => itemIds)

  // Gizmo store for live preview
  const { setTransformPreview, clearPreview } = useGizmoStore.getState()

  // Get current values with keyframe animation applied
  // Opacity is 0-1, display as 0-100%
  const resolvedValues = $derived.by(() => {
    if (items.length === 0) {
      return { opacityRaw: 1 as MixedValue, cornerRadius: 0 as MixedValue }
    }

    const resolved = items.map((item) => {
      const sourceDimensions = getSourceDimensions(item)
      const baseResolved = resolveTransform(item, canvas, sourceDimensions)

      // Apply keyframe animation if item has keyframes
      const itemKeyframes = keyframesByItemId.current.get(item.id) ?? undefined
      if (itemKeyframes) {
        const relativeFrame = currentFrame.current - item.from
        return resolveAnimatedTransform(baseResolved, itemKeyframes, relativeFrame)
      }

      return baseResolved
    })

    const getVal = (getter: (r: ReturnType<typeof resolveTransform>) => number): MixedValue => {
      const values = resolved.map(getter)
      const firstValue = values[0]!
      return values.every((v) => Math.abs(v - firstValue) < 0.01) ? firstValue : 'mixed'
    }

    return {
      opacityRaw: getVal((r) => r.opacity),
      cornerRadius: getVal((r) => r.cornerRadius),
    }
  })
  const opacityRaw = $derived(resolvedValues.opacityRaw)
  const cornerRadius = $derived(resolvedValues.cornerRadius)

  const opacity = $derived(opacityRaw === 'mixed' ? 'mixed' : Math.round(opacityRaw * 100))

  // Helper: Check if opacity has keyframes and auto-keyframe on value change
  const autoKeyframeOpacity = (itemId: string, value: number): AutoKeyframeOperation | null => {
    const item = itemsById.get(itemId)
    if (!item) return null

    const itemKeyframes = keyframesByItemId.current.get(itemId) ?? undefined
    return getAutoKeyframeOperation(item, itemKeyframes, 'opacity', value, currentFrame.current)
  }

  // Helper: Check if cornerRadius has keyframes and auto-keyframe on value change
  const autoKeyframeCornerRadius = (
    itemId: string,
    value: number,
  ): AutoKeyframeOperation | null => {
    const item = itemsById.get(itemId)
    if (!item) return null

    const itemKeyframes = keyframesByItemId.current.get(itemId) ?? undefined
    return getAutoKeyframeOperation(
      item,
      itemKeyframes,
      'cornerRadius',
      value,
      currentFrame.current,
    )
  }

  // Live preview for opacity (during drag)
  const handleOpacityLiveChange = (value: number) => {
    const previews: Record<string, { opacity: number }> = {}
    items.forEach((item) => {
      previews[item.id] = { opacity: value / 100 }
    })
    setTransformPreview(previews)
  }

  // Commit opacity (on mouse up, with auto-keyframe support)
  const handleOpacityChange = (value: number) => {
    const opacityValue = value / 100 // Convert from 0-100 to 0-1

    applyAutoKeyframedTransformChange({
      itemIds,
      updates: { opacity: opacityValue },
      getOperation: (itemId) => autoKeyframeOpacity(itemId, opacityValue),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  // Live preview for corner radius (during drag)
  const handleCornerRadiusLiveChange = (value: number) => {
    const previews: Record<string, { cornerRadius: number }> = {}
    items.forEach((item) => {
      previews[item.id] = { cornerRadius: value }
    })
    setTransformPreview(previews)
  }

  // Commit corner radius (on mouse up, with auto-keyframe support)
  const handleCornerRadiusChange = (value: number) => {
    applyAutoKeyframedTransformChange({
      itemIds,
      updates: { cornerRadius: value },
      getOperation: (itemId) => autoKeyframeCornerRadius(itemId, value),
      applyAutoKeyframeOperations,
      onTransformChange,
    })
    queueMicrotask(() => clearPreview())
  }

  // Get current blend mode (shared across selected items)
  const blendMode = $derived.by((): BlendMode | 'mixed' => {
    if (items.length === 0) return 'normal'
    const first = items[0]!.blendMode ?? 'normal'
    const allSame = items.every((item) => (item.blendMode ?? 'normal') === first)
    return allSame ? first : 'mixed'
  })
  const hasShapeMask = $derived(items.some((item) => item.type === 'shape' && item.isMask))

  // Handle blend mode change
  const handleBlendModeChange = (value: string) => {
    for (const item of items) {
      if (item.type === 'shape' && item.isMask) continue
      updateItem(item.id, { blendMode: value as BlendMode })
    }
  }

  // Reset opacity to 100%
  const handleResetOpacity = () => {
    const tolerance = 0.01
    const needsUpdate = items.some((item) => {
      const sourceDimensions = getSourceDimensions(item)
      const resolved = resolveTransform(item, canvas, sourceDimensions)
      return Math.abs(resolved.opacity - 1) > tolerance
    })
    if (needsUpdate) {
      onTransformChange(itemIds, { opacity: 1 })
    }
  }

  // Reset corner radius to 0
  const handleResetCornerRadius = () => {
    const tolerance = 0.5
    const needsUpdate = items.some((item) => {
      const sourceDimensions = getSourceDimensions(item)
      const resolved = resolveTransform(item, canvas, sourceDimensions)
      return resolved.cornerRadius > tolerance
    })
    if (needsUpdate) {
      onTransformChange(itemIds, { cornerRadius: 0 })
    }
  }
</script>

<PropertySection title={t('editor.fillSection.composite')} icon={Droplet} defaultOpen={true}>
  <!-- Opacity -->
  <PropertyRow label={t('editor.fillSection.opacity')}>
    <div class="flex items-center gap-1 w-full">
      <SliderInput
        value={opacity}
        onChange={handleOpacityChange}
        onLiveChange={handleOpacityLiveChange}
        min={0}
        max={100}
        step={1}
        unit="%"
        class="flex-1 min-w-0"
      />
      <KeyframeToggle {itemIds} property="opacity" currentValue={demixValue(opacityRaw, 1)} />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleResetOpacity}
        title={t('editor.fillSection.resetOpacity')}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>

  <!-- Blend Mode -->
  <PropertyRow label={t('editor.fillSection.blend')}>
    <Select
      value={hasShapeMask ? 'normal' : demixValue(blendMode, undefined)}
      onValueChange={handleBlendModeChange}
      disabled={hasShapeMask}
    >
      <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
        <SelectValue
          placeholder={hasShapeMask || blendMode !== 'mixed'
            ? t('editor.fillSection.blendNormal')
            : t('editor.fillSection.blendMixed')}
        />
      </SelectTrigger>
      <SelectContent>
        {#each BLEND_MODE_GROUPS as group (group.label)}
          <SelectGroup>
            <SelectLabel class="text-[10px] text-muted-foreground">
              {group.label}
            </SelectLabel>
            {#each group.modes as mode (mode)}
              <SelectItem value={mode} class="text-xs">
                {BLEND_MODE_LABELS[mode]}
              </SelectItem>
            {/each}
          </SelectGroup>
        {/each}
      </SelectContent>
    </Select>
  </PropertyRow>

  <!-- Corner Radius -->
  <PropertyRow label={t('editor.fillSection.radius')}>
    <div class="flex items-center gap-1 w-full">
      <NumberInput
        value={cornerRadius}
        onChange={handleCornerRadiusChange}
        onLiveChange={handleCornerRadiusLiveChange}
        min={0}
        max={1000}
        step={1}
        unit="px"
        class="flex-1 min-w-0"
      />
      <KeyframeToggle
        {itemIds}
        property="cornerRadius"
        currentValue={demixValue(cornerRadius, 0)}
      />
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleResetCornerRadius}
        title={t('editor.fillSection.resetRadius')}
      >
        <RotateCcw class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>
</PropertySection>
