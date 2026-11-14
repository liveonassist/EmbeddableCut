<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { KeyframeToggle } from '@/features/editor/deps/keyframes'
  import { ColorPicker, NumberInput, PropertyRow } from '../components'
  import { TEXT_EFFECT_PRESETS } from './text-section-constants'
  import type { SharedTextValue } from './text-section-shared-values'

  interface TextEffectsControlsProps {
    itemIds: string[]
    shadowColor: string | undefined
    shadowOffsetX: SharedTextValue<number>
    shadowOffsetY: SharedTextValue<number>
    shadowBlur: SharedTextValue<number>
    strokeWidth: SharedTextValue<number>
    strokeColor: string | undefined
    /** Committed shadow/stroke values, for the keyframe toggles. */
    shadowOffsetXCurrentValue: number
    shadowOffsetYCurrentValue: number
    shadowBlurCurrentValue: number
    strokeWidthCurrentValue: number
    onApplyPreset: (presetId: (typeof TEXT_EFFECT_PRESETS)[number]['id']) => void
    onShadowColorChange: (value: string) => void
    onShadowColorLiveChange: (value: string) => void
    onShadowOffsetXChange: (value: number) => void
    onShadowOffsetXLiveChange: (value: number) => void
    onShadowOffsetYChange: (value: number) => void
    onShadowOffsetYLiveChange: (value: number) => void
    onShadowBlurChange: (value: number) => void
    onShadowBlurLiveChange: (value: number) => void
    onStrokeWidthChange: (value: number) => void
    onStrokeWidthLiveChange: (value: number) => void
    onStrokeColorChange: (value: string) => void
    onStrokeColorLiveChange: (value: string) => void
  }

  /** Effect presets, shadow controls, and the stroke width/color pair. */
  let {
    itemIds,
    shadowColor,
    shadowOffsetX,
    shadowOffsetY,
    shadowBlur,
    strokeWidth,
    strokeColor,
    shadowOffsetXCurrentValue,
    shadowOffsetYCurrentValue,
    shadowBlurCurrentValue,
    strokeWidthCurrentValue,
    onApplyPreset,
    onShadowColorChange,
    onShadowColorLiveChange,
    onShadowOffsetXChange,
    onShadowOffsetXLiveChange,
    onShadowOffsetYChange,
    onShadowOffsetYLiveChange,
    onShadowBlurChange,
    onShadowBlurLiveChange,
    onStrokeWidthChange,
    onStrokeWidthLiveChange,
    onStrokeColorChange,
    onStrokeColorLiveChange,
  }: TextEffectsControlsProps = $props()
</script>

<PropertyRow label={t('editor.textSection.presets')} class="items-start">
  <div class="grid w-full grid-cols-2 gap-1.5">
    {#each TEXT_EFFECT_PRESETS as preset (preset.id)}
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-[11px]"
        onclick={() => onApplyPreset(preset.id)}
      >
        {t(`editor.textSection.effectPresets.${preset.labelKey}`)}
      </Button>
    {/each}
  </div>
</PropertyRow>

<ColorPicker
  label={t('editor.textSection.shadow')}
  color={shadowColor || '#000000'}
  onChange={onShadowColorChange}
  onLiveChange={onShadowColorLiveChange}
  onReset={() => onShadowColorChange('#000000')}
  defaultColor="#000000"
  allowAlpha
/>

<PropertyRow label={t('editor.textSection.shadowX')}>
  <div class="flex items-center gap-1 min-w-0 w-full">
    <NumberInput
      value={shadowOffsetX}
      onChange={onShadowOffsetXChange}
      onLiveChange={onShadowOffsetXLiveChange}
      min={-100}
      max={100}
      step={1}
      unit="px"
      class="flex-1 min-w-0"
    />
    <KeyframeToggle
      {itemIds}
      property="textShadowOffsetX"
      currentValue={shadowOffsetXCurrentValue}
    />
  </div>
</PropertyRow>

<PropertyRow label={t('editor.textSection.shadowY')}>
  <div class="flex items-center gap-1 min-w-0 w-full">
    <NumberInput
      value={shadowOffsetY}
      onChange={onShadowOffsetYChange}
      onLiveChange={onShadowOffsetYLiveChange}
      min={-100}
      max={100}
      step={1}
      unit="px"
      class="flex-1 min-w-0"
    />
    <KeyframeToggle
      {itemIds}
      property="textShadowOffsetY"
      currentValue={shadowOffsetYCurrentValue}
    />
  </div>
</PropertyRow>

<PropertyRow label={t('editor.textSection.shadowBlur')}>
  <div class="flex items-center gap-1 min-w-0 w-full">
    <NumberInput
      value={shadowBlur}
      onChange={onShadowBlurChange}
      onLiveChange={onShadowBlurLiveChange}
      min={0}
      max={160}
      step={1}
      unit="px"
      class="flex-1 min-w-0"
    />
    <KeyframeToggle {itemIds} property="textShadowBlur" currentValue={shadowBlurCurrentValue} />
  </div>
</PropertyRow>

<PropertyRow label={t('editor.textSection.strokeWidth')}>
  <div class="flex items-center gap-1 min-w-0 w-full">
    <NumberInput
      value={strokeWidth}
      onChange={onStrokeWidthChange}
      onLiveChange={onStrokeWidthLiveChange}
      min={0}
      max={24}
      step={1}
      unit="px"
      class="flex-1 min-w-0"
    />
    <KeyframeToggle {itemIds} property="strokeWidth" currentValue={strokeWidthCurrentValue} />
  </div>
</PropertyRow>

{#if strokeWidth === 'mixed' || strokeWidth > 0}
  <ColorPicker
    label={t('editor.textSection.stroke')}
    color={strokeColor || '#111827'}
    onChange={onStrokeColorChange}
    onLiveChange={onStrokeColorLiveChange}
    onReset={() => onStrokeColorChange('#111827')}
    defaultColor="#111827"
    allowAlpha
  />
{/if}
