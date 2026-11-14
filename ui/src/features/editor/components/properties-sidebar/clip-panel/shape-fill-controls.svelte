<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import {
    DEFAULT_SHAPE_GRADIENT_ANGLE,
    DEFAULT_SHAPE_GRADIENT_END_COLOR,
  } from '@/shared/graphics/shapes/linear-gradient'
  import type { ShapeStyleFields } from '@/types/timeline'
  import { ColorPicker, PropertyRow, PropertySliderControl } from '../components'
  import type { SharedShapeValue } from './shape-section-shared-values'

  interface ShapeFillControlsProps {
    /** Whether the selection shows a fill at all — hidden for open paths and mask-only selections. */
    visible: boolean
    fillEnabled: SharedShapeValue<boolean>
    fillType: ShapeStyleFields['fillType']
    fillColor: string | undefined
    gradientStartColor: string | undefined
    gradientEndColor: string | undefined
    gradientAngle: SharedShapeValue<number>
    onFillEnabledChange: (enabled: boolean) => void
    onFillTypeChange: (value: string) => void
    onFillColorChange: (value: string) => void
    onFillColorLiveChange: (value: string) => void
    onGradientStartColorChange: (value: string) => void
    onGradientStartColorLiveChange: (value: string) => void
    onGradientEndColorChange: (value: string) => void
    onGradientEndColorLiveChange: (value: string) => void
    onGradientAngleChange: (value: number) => void
    onGradientAngleLiveChange: (value: number) => void
    onSwapGradientColors: () => void
  }

  /** Fill toggle plus the solid / linear color controls it reveals. */
  let {
    visible,
    fillEnabled,
    fillType,
    fillColor,
    gradientStartColor,
    gradientEndColor,
    gradientAngle,
    onFillEnabledChange,
    onFillTypeChange,
    onFillColorChange,
    onFillColorLiveChange,
    onGradientStartColorChange,
    onGradientStartColorLiveChange,
    onGradientEndColorChange,
    onGradientEndColorLiveChange,
    onGradientAngleChange,
    onGradientAngleLiveChange,
    onSwapGradientColors,
  }: ShapeFillControlsProps = $props()
</script>

{#if visible}
  <PropertyRow label={t('editor.shapeSection.fill')}>
    <Button
      variant={fillEnabled === true ? 'secondary' : 'ghost'}
      size="sm"
      class="h-7 text-xs flex-1"
      disabled={fillEnabled === 'mixed'}
      onclick={() => onFillEnabledChange(fillEnabled !== true)}
    >
      {fillEnabled === true ? t('editor.shapeSection.on') : t('editor.shapeSection.off')}
    </Button>
  </PropertyRow>
{/if}

<!-- Fill Color -->
{#if visible && fillEnabled !== false}
  <PropertyRow label={t('editor.shapeSection.fillType')}>
    <Select value={fillType} onValueChange={onFillTypeChange}>
      <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
        <SelectValue placeholder={t('editor.shapeSection.mixed')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="solid">{t('editor.shapeSection.fillTypeSolid')}</SelectItem>
        <SelectItem value="linear">{t('editor.shapeSection.fillTypeLinear')}</SelectItem>
      </SelectContent>
    </Select>
  </PropertyRow>
  {#if fillType === 'linear'}
    <ColorPicker
      label={t('editor.shapeSection.gradientStartColor')}
      color={gradientStartColor ?? fillColor ?? '#3b82f6'}
      onChange={onGradientStartColorChange}
      onLiveChange={onGradientStartColorLiveChange}
      onReset={() => onGradientStartColorChange('#3b82f6')}
      defaultColor="#3b82f6"
    />
    <ColorPicker
      label={t('editor.shapeSection.gradientEndColor')}
      color={gradientEndColor ?? DEFAULT_SHAPE_GRADIENT_END_COLOR}
      onChange={onGradientEndColorChange}
      onLiveChange={onGradientEndColorLiveChange}
      onReset={() => onGradientEndColorChange(DEFAULT_SHAPE_GRADIENT_END_COLOR)}
      defaultColor={DEFAULT_SHAPE_GRADIENT_END_COLOR}
    />
    <PropertyRow label={t('editor.shapeSection.gradientAngle')}>
      <PropertySliderControl
        value={gradientAngle}
        onChange={onGradientAngleChange}
        onLiveChange={onGradientAngleLiveChange}
        min={-180}
        max={180}
        step={1}
        unit="°"
        onReset={() => onGradientAngleChange(DEFAULT_SHAPE_GRADIENT_ANGLE)}
        resetLabel={t('editor.shapeSection.resetToDefault')}
      />
    </PropertyRow>
    <PropertyRow label={t('editor.shapeSection.gradientColors')}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-7 flex-1 text-xs"
        onclick={onSwapGradientColors}
      >
        {t('editor.shapeSection.swapGradientColors')}
      </Button>
    </PropertyRow>
  {:else if fillType === 'solid'}
    <ColorPicker
      label={t('editor.shapeSection.fillColor')}
      color={fillColor ?? '#3b82f6'}
      onChange={onFillColorChange}
      onLiveChange={onFillColorLiveChange}
      onReset={() => onFillColorChange('#3b82f6')}
      defaultColor="#3b82f6"
    />
  {/if}
{/if}
