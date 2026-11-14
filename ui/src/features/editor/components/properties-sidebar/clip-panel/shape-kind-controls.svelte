<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import ChevronUp from 'lucide-svelte/icons/chevron-up'

  // Triangle direction options
  const DIRECTION_OPTIONS: {
    value: 'up' | 'down' | 'left' | 'right'
    labelKey: string
    icon: typeof ChevronUp
  }[] = [
    { value: 'up', labelKey: 'editor.shapeSection.directionUp', icon: ChevronUp },
    { value: 'down', labelKey: 'editor.shapeSection.directionDown', icon: ChevronDown },
    { value: 'left', labelKey: 'editor.shapeSection.directionLeft', icon: ChevronLeft },
    { value: 'right', labelKey: 'editor.shapeSection.directionRight', icon: ChevronRight },
  ]
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import type { ShapeItem } from '@/types/timeline'
  import { NumberInput, PropertyRow, PropertySliderControl } from '../components'
  import type { SharedShapeValue } from './shape-section-shared-values'

  interface ShapeKindControlsProps {
    /** Shared shape type of the selection — each control shows only for the kinds that use it. */
    shapeType: ShapeItem['shapeType'] | undefined
    cornerRadius: SharedShapeValue<number>
    direction: ShapeItem['direction']
    points: SharedShapeValue<number>
    innerRadius: SharedShapeValue<number>
    onCornerRadiusChange: (value: number) => void
    onCornerRadiusLiveChange: (value: number) => void
    onCornerRadiusReset: () => void
    onDirectionChange: (value: 'up' | 'down' | 'left' | 'right') => void
    onPointsChange: (value: number) => void
    onPointsLiveChange: (value: number) => void
    onInnerRadiusChange: (value: number) => void
    onInnerRadiusLiveChange: (value: number) => void
    onInnerRadiusReset: () => void
  }

  /** Geometry knobs only some shape kinds expose: corner radius, direction, points, inner radius. */
  let {
    shapeType,
    cornerRadius,
    direction,
    points,
    innerRadius,
    onCornerRadiusChange,
    onCornerRadiusLiveChange,
    onCornerRadiusReset,
    onDirectionChange,
    onPointsChange,
    onPointsLiveChange,
    onInnerRadiusChange,
    onInnerRadiusLiveChange,
    onInnerRadiusReset,
  }: ShapeKindControlsProps = $props()

  const showCornerRadius = $derived(
    shapeType && ['rectangle', 'triangle', 'star', 'polygon'].includes(shapeType),
  )
  const showDirection = $derived(shapeType === 'triangle')
  const showPoints = $derived(shapeType && ['star', 'polygon'].includes(shapeType))
  const showInnerRadius = $derived(shapeType === 'star')
</script>

<!-- Corner Radius - shown for rectangle, triangle, star, polygon -->
{#if showCornerRadius}
  <PropertyRow label={t('editor.shapeSection.radius')}>
    <PropertySliderControl
      value={cornerRadius}
      onChange={onCornerRadiusChange}
      onLiveChange={onCornerRadiusLiveChange}
      min={0}
      max={100}
      step={1}
      unit="px"
      onReset={onCornerRadiusReset}
      resetLabel={t('editor.shapeSection.resetToDefault')}
    />
  </PropertyRow>
{/if}

<!-- Direction - shown for triangle only -->
{#if showDirection}
  <PropertyRow label={t('editor.shapeSection.direction')}>
    <div class="flex gap-1">
      {#each DIRECTION_OPTIONS as dir (dir.value)}
        <Button
          variant={direction === dir.value ? 'secondary' : 'ghost'}
          size="icon"
          class="h-7 w-7"
          onclick={() => onDirectionChange(dir.value)}
          title={t(dir.labelKey)}
        >
          <dir.icon class="w-3.5 h-3.5" />
        </Button>
      {/each}
    </div>
  </PropertyRow>
{/if}

<!-- Points - shown for star and polygon -->
{#if showPoints}
  <PropertyRow label={t('editor.shapeSection.points')}>
    <NumberInput
      value={points}
      onChange={onPointsChange}
      onLiveChange={onPointsLiveChange}
      min={3}
      max={12}
      step={1}
      class="flex-1 min-w-0"
    />
  </PropertyRow>
{/if}

<!-- Inner Radius - shown for star only -->
{#if showInnerRadius}
  <PropertyRow label={t('editor.shapeSection.innerRadius')}>
    <PropertySliderControl
      value={innerRadius}
      onChange={onInnerRadiusChange}
      onLiveChange={onInnerRadiusLiveChange}
      min={0.1}
      max={0.9}
      step={0.05}
      onReset={onInnerRadiusReset}
      resetLabel={t('editor.shapeSection.resetToDefault')}
    />
  </PropertyRow>
{/if}
