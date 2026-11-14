<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { ColorPicker, PropertyRow, PropertySliderControl } from '../../components'
  import { MIN_ENABLED_STROKE_WIDTH, DEFAULT_STROKE_COLOR } from '../shape-section-constants'
  import type { SharedShapeValue } from '../shape-section-shared-values'

  interface ShapeStrokeControlsProps {
    /** Whether the selection can show a stroke at all (mask-only selections hide it). */
    showStroke: boolean
    showNoAppearanceNotice: boolean
    strokeEnabled: SharedShapeValue<boolean>
    strokeWidth: SharedShapeValue<number>
    strokeColor: string | undefined
    onStrokeEnabledChange: (enabled: boolean) => void
    onStrokeWidthChange: (value: number) => void
    onStrokeWidthLiveChange: (value: number) => void
    onStrokeWidthReset: () => void
    onStrokeColorChange: (value: string) => void
    onStrokeColorLiveChange: (value: string) => void
  }

  /** Stroke on/off, the "no visible appearance" nudge, its width, and its color. */
  let {
    showStroke,
    showNoAppearanceNotice,
    strokeEnabled,
    strokeWidth,
    strokeColor,
    onStrokeEnabledChange,
    onStrokeWidthChange,
    onStrokeWidthLiveChange,
    onStrokeWidthReset,
    onStrokeColorChange,
    onStrokeColorLiveChange,
  }: ShapeStrokeControlsProps = $props()
</script>

{#if showStroke}
  <PropertyRow label={t('editor.shapeSection.stroke')}>
    <Button
      variant={strokeEnabled === true ? 'secondary' : 'ghost'}
      size="sm"
      class="h-7 text-xs flex-1"
      disabled={strokeEnabled === 'mixed'}
      onclick={() => onStrokeEnabledChange(strokeEnabled !== true)}
    >
      {strokeEnabled === true ? t('editor.shapeSection.on') : t('editor.shapeSection.off')}
    </Button>
  </PropertyRow>
{/if}

{#if showNoAppearanceNotice}
  <div
    class="mx-1 my-1 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
  >
    <span class="min-w-0 flex-1 text-[10px] leading-4 text-muted-foreground">
      {t('editor.shapeSection.noVisibleAppearance')}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="h-6 flex-shrink-0 px-2 text-[10px]"
      onclick={() => onStrokeEnabledChange(true)}
    >
      {t('editor.shapeSection.enableStroke')}
    </Button>
  </div>
{/if}

<!-- Stroke Width -->
{#if showStroke && strokeEnabled !== false}
  <PropertyRow label={t('editor.shapeSection.strokeWidth')}>
    <PropertySliderControl
      value={strokeWidth}
      onChange={onStrokeWidthChange}
      onLiveChange={onStrokeWidthLiveChange}
      min={MIN_ENABLED_STROKE_WIDTH}
      max={50}
      step={1}
      unit="px"
      onReset={onStrokeWidthReset}
      resetLabel={t('editor.shapeSection.resetToDefault')}
    />
  </PropertyRow>
{/if}

<!-- Stroke Color - only show when stroke width > 0 -->
{#if showStroke && strokeEnabled !== false && (strokeWidth === 'mixed' || strokeWidth > 0)}
  <ColorPicker
    label={t('editor.shapeSection.strokeColor')}
    color={strokeColor || DEFAULT_STROKE_COLOR}
    onChange={onStrokeColorChange}
    onLiveChange={onStrokeColorLiveChange}
    onReset={() => onStrokeColorChange('')}
    defaultColor=""
  />
{/if}
