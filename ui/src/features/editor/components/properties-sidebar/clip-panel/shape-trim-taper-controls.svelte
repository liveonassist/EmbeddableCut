<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { PropertyRow, PropertySliderControl } from '../components'
  import { demixValue } from '../utils'
  import type { SharedShapeValue } from './shape-section-shared-values'
  import type { StrokePathProperty } from './shape-trim-taper-controls-types'

  interface ShapeTrimTaperControlsProps {
    showTrimPaths: boolean
    showTaper: boolean
    trimPathStart: SharedShapeValue<number>
    trimPathEnd: SharedShapeValue<number>
    trimPathOffset: SharedShapeValue<number>
    taperStartWidth: SharedShapeValue<number>
    taperEndWidth: SharedShapeValue<number>
    taperStartLength: SharedShapeValue<number>
    taperEndLength: SharedShapeValue<number>
    /** Shape ids the keyframe toggles attach to. */
    itemIds: string[]
    onPreviewProperty: (property: StrokePathProperty, value: number) => void
    onCommitProperty: (property: StrokePathProperty, value: number) => void
    onResetProperty: (property: StrokePathProperty, value: number) => void
  }

  /** Trim-path and taper sliders, shown only for stroke shapes. */
  let {
    showTrimPaths,
    showTaper,
    trimPathStart,
    trimPathEnd,
    trimPathOffset,
    taperStartWidth,
    taperEndWidth,
    taperStartLength,
    taperEndLength,
    itemIds,
    onPreviewProperty,
    onCommitProperty,
    onResetProperty,
  }: ShapeTrimTaperControlsProps = $props()
</script>

{#snippet sliderRow(
  label: string,
  property: StrokePathProperty,
  value: SharedShapeValue<number>,
  min: number,
  max: number,
  unit: string,
  defaultValue: number,
  liveChangeThrottleMs?: number,
)}
  <PropertyRow {label}>
    <PropertySliderControl
      {value}
      onChange={(next) => onCommitProperty(property, next)}
      onLiveChange={(next) => onPreviewProperty(property, next)}
      {min}
      {max}
      step={1}
      {unit}
      {liveChangeThrottleMs}
      keyframe={{
        itemIds,
        property,
        currentValue: demixValue(value, defaultValue),
      }}
      onReset={() => onResetProperty(property, defaultValue)}
      resetLabel={t('editor.shapeSection.resetToDefault')}
    />
  </PropertyRow>
{/snippet}

{#if showTrimPaths}
  <div class="border-t border-border my-3"></div>

  <div
    class="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
  >
    {t('editor.shapeSection.trimPaths')}
  </div>
  {@render sliderRow(
    t('editor.shapeSection.trimStart'),
    'trimPathStart',
    trimPathStart,
    0,
    100,
    '%',
    0,
  )}
  {@render sliderRow(t('editor.shapeSection.trimEnd'), 'trimPathEnd', trimPathEnd, 0, 100, '%', 100)}
  {@render sliderRow(
    t('editor.shapeSection.trimOffset'),
    'trimPathOffset',
    trimPathOffset,
    -360,
    360,
    '°',
    0,
    0,
  )}
{/if}

{#if showTaper}
  <div class="border-t border-border my-3"></div>

  <div
    class="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
  >
    {t('editor.shapeSection.taper')}
  </div>
  {@render sliderRow(
    t('editor.shapeSection.taperStartWidth'),
    'taperStartWidth',
    taperStartWidth,
    0,
    200,
    '%',
    100,
  )}
  {@render sliderRow(
    t('editor.shapeSection.taperStartLength'),
    'taperStartLength',
    taperStartLength,
    0,
    100,
    '%',
    0,
  )}
  {@render sliderRow(
    t('editor.shapeSection.taperEndWidth'),
    'taperEndWidth',
    taperEndWidth,
    0,
    200,
    '%',
    100,
  )}
  {@render sliderRow(
    t('editor.shapeSection.taperEndLength'),
    'taperEndLength',
    taperEndLength,
    0,
    100,
    '%',
    0,
  )}
{/if}
