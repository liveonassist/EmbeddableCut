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
  import type { TextItem } from '@/types/timeline'
  import { TEXT_STYLE_PRESETS, type TextStylePresetId } from '../text-style-presets'

  interface TextLayoutControlsProps {
    /** Whether the selection is already split into spans. */
    hasStructuredSpans: boolean
    /** Span count of the selection, which marks the active layout button. */
    activeSpanCount: number
    presetId: TextItem['textStylePresetId']
    onApplyLayout: (layout: 'single' | 'two' | 'three') => void
    onApplyStylePreset: (presetId: TextStylePresetId) => void
  }

  /** Layout switch (single / two / three spans) plus the style-preset picker. */
  let {
    hasStructuredSpans,
    activeSpanCount,
    presetId,
    onApplyLayout,
    onApplyStylePreset,
  }: TextLayoutControlsProps = $props()
</script>

<div class="grid w-full grid-cols-3 gap-1.5">
  <Button
    variant={hasStructuredSpans ? 'outline' : 'secondary'}
    size="sm"
    class="h-7 text-[11px]"
    onclick={() => onApplyLayout('single')}
  >
    {t('editor.textSection.single')}
  </Button>
  <Button
    variant={activeSpanCount === 2 ? 'secondary' : 'outline'}
    size="sm"
    class="h-7 text-[11px]"
    onclick={() => onApplyLayout('two')}
  >
    {t('editor.textSection.twoSpans')}
  </Button>
  <Button
    variant={activeSpanCount >= 3 ? 'secondary' : 'outline'}
    size="sm"
    class="h-7 text-[11px]"
    onclick={() => onApplyLayout('three')}
  >
    {t('editor.textSection.threeSpans')}
  </Button>
</div>
<Select
  value={presetId}
  onValueChange={(value) => onApplyStylePreset(value as TextStylePresetId)}
>
  <SelectTrigger class="h-7 text-xs w-full">
    <SelectValue
      placeholder={presetId === undefined
        ? t('editor.textSection.mixedNone')
        : t('editor.textSection.selectPreset')}
    />
  </SelectTrigger>
  <SelectContent>
    {#each TEXT_STYLE_PRESETS as preset (preset.id)}
      <SelectItem value={preset.id} class="text-xs">
        {preset.label}
      </SelectItem>
    {/each}
  </SelectContent>
</Select>
