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
  import type { ShapeItem } from '@/types/timeline'
  import { PropertyRow, PropertySliderControl } from '../components'
  import type { SharedShapeValue } from './shape-section-shared-values'

  interface ShapeMaskControlsProps {
    isMask: SharedShapeValue<boolean>
    maskType: ShapeItem['maskType']
    maskFeather: SharedShapeValue<number>
    maskOpacity: SharedShapeValue<number>
    maskInvert: SharedShapeValue<boolean>
    onIsMaskChange: (checked: boolean) => void
    onMaskTypeChange: (value: string) => void
    onMaskFeatherChange: (value: number) => void
    onMaskFeatherLiveChange: (value: number) => void
    onMaskFeatherReset: () => void
    onMaskOpacityChange: (value: number) => void
    onMaskOpacityLiveChange: (value: number) => void
    onMaskOpacityReset: () => void
    onMaskInvertChange: (checked: boolean) => void
  }

  /** The "use as mask" toggle and the mask type / feather / opacity / invert settings it reveals. */
  let {
    isMask,
    maskType,
    maskFeather,
    maskOpacity,
    maskInvert,
    onIsMaskChange,
    onMaskTypeChange,
    onMaskFeatherChange,
    onMaskFeatherLiveChange,
    onMaskFeatherReset,
    onMaskOpacityChange,
    onMaskOpacityLiveChange,
    onMaskOpacityReset,
    onMaskInvertChange,
  }: ShapeMaskControlsProps = $props()
</script>

<!-- Mask Section Divider -->
<div class="border-t border-border my-3"></div>

<!-- Use as Mask Toggle -->
<PropertyRow label={t('editor.shapeSection.useAsMask')}>
  <Button
    variant={isMask === true ? 'secondary' : 'ghost'}
    size="sm"
    class="h-7 text-xs flex-1 min-w-0"
    onclick={() => onIsMaskChange(isMask !== true)}
    disabled={isMask === 'mixed'}
  >
    {isMask === 'mixed'
      ? t('editor.shapeSection.mixed')
      : isMask
        ? t('editor.shapeSection.on')
        : t('editor.shapeSection.off')}
  </Button>
</PropertyRow>

<!-- Mask settings - only show when isMask is true -->
{#if isMask === true || isMask === 'mixed'}
  <!-- Mask Type -->
  <PropertyRow label={t('editor.shapeSection.maskType')}>
    <Select value={maskType} onValueChange={onMaskTypeChange} disabled={isMask !== true}>
      <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
        <SelectValue
          placeholder={maskType === undefined
            ? t('editor.shapeSection.mixed')
            : t('editor.shapeSection.selectType')}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="clip" class="text-xs">
          {t('editor.shapeSection.maskTypeClip')}
        </SelectItem>
        <SelectItem value="alpha" class="text-xs">
          {t('editor.shapeSection.maskTypeAlpha')}
        </SelectItem>
      </SelectContent>
    </Select>
  </PropertyRow>

  <!-- Feather - only show for alpha mask type -->
  {#if maskType === 'alpha'}
    <PropertyRow label={t('editor.shapeSection.feather')}>
      <PropertySliderControl
        value={maskFeather}
        onChange={onMaskFeatherChange}
        onLiveChange={onMaskFeatherLiveChange}
        min={0}
        max={100}
        step={1}
        unit="px"
        onReset={onMaskFeatherReset}
        resetLabel={t('editor.shapeSection.resetToDefault')}
      />
    </PropertyRow>
  {/if}

  <PropertyRow label={t('editor.fillSection.opacity')}>
    <PropertySliderControl
      value={maskOpacity}
      onChange={onMaskOpacityChange}
      onLiveChange={onMaskOpacityLiveChange}
      min={0}
      max={100}
      step={1}
      unit="%"
      onReset={onMaskOpacityReset}
      resetLabel={t('editor.shapeSection.resetToDefault')}
    />
  </PropertyRow>

  <!-- Invert Mask -->
  <PropertyRow label={t('editor.shapeSection.invert')}>
    <Button
      variant={maskInvert === true ? 'secondary' : 'ghost'}
      size="sm"
      class="h-7 text-xs flex-1 min-w-0"
      onclick={() => onMaskInvertChange(maskInvert !== true)}
      disabled={isMask !== true || maskInvert === 'mixed'}
    >
      {maskInvert === 'mixed'
        ? t('editor.shapeSection.mixed')
        : maskInvert
          ? t('editor.shapeSection.on')
          : t('editor.shapeSection.off')}
    </Button>
  </PropertyRow>
{/if}
