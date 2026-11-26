<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import Bold from '@lucide/svelte/icons/bold'
  import Italic from '@lucide/svelte/icons/italic'
  import Underline from '@lucide/svelte/icons/underline'
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { TextItem } from '@/types/timeline'
  import { KeyframeToggle } from '@/features/editor/deps/keyframes'
  import { NumberInput, PropertyRow } from '../components'
  import FontPicker from './font-picker.svelte'
  import type { FontWeightOption } from './text-section-constants'
  import type { SharedTextValue } from './text-section-shared-values'

  interface TextTypographyControlsProps {
    /** Structured spans replace the whole-selection controls with per-span ones. */
    enabled: boolean
    fontFamily: string | undefined
    fontSize: SharedTextValue<number>
    fontWeight: TextItem['fontWeight']
    fontStyle: TextItem['fontStyle']
    underline: TextItem['underline']
    /** Text the font picker renders in each face. */
    fontPreviewText: string
    supportedFontWeightOptions: readonly FontWeightOption[]
    itemIds: string[]
    /** Committed font size, for the keyframe toggle. */
    fontSizeCurrentValue: number
    onFontFamilyChange: (value: string) => void
    onFontSizeChange: (value: number) => void
    onFontSizeLiveChange: (value: number) => void
    onFontWeightChange: (value: string) => void
    onBoldToggle: () => void
    onItalicToggle: () => void
    onUnderlineToggle: () => void
  }

  /** Font, size, weight, and the bold/italic/underline toggles for an unstyled selection. */
  let {
    enabled,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    underline,
    fontPreviewText,
    supportedFontWeightOptions,
    itemIds,
    fontSizeCurrentValue,
    onFontFamilyChange,
    onFontSizeChange,
    onFontSizeLiveChange,
    onFontWeightChange,
    onBoldToggle,
    onItalicToggle,
    onUnderlineToggle,
  }: TextTypographyControlsProps = $props()

  const isBoldActive = $derived(fontWeight === 'bold')
  const canUseBold = $derived(supportedFontWeightOptions.some((weight) => weight.value === 'bold'))
  const isItalicActive = $derived(fontStyle === 'italic')
  const isUnderlineActive = $derived(underline === true)
</script>

{#if enabled}
  <PropertyRow label={t('editor.textSection.font')} class="items-start">
    <FontPicker
      value={fontFamily}
      placeholder={fontFamily === undefined
        ? t('editor.textSection.mixed')
        : t('editor.textSection.selectFont')}
      previewText={fontPreviewText}
      onValueChange={onFontFamilyChange}
    />
  </PropertyRow>

  <PropertyRow label={t('editor.textSection.size')}>
    <div class="flex items-center gap-1 min-w-0 w-full">
      <NumberInput
        value={fontSize}
        onChange={onFontSizeChange}
        onLiveChange={onFontSizeLiveChange}
        min={8}
        max={500}
        step={1}
        unit="px"
        class="flex-1 min-w-0"
      />
      <KeyframeToggle {itemIds} property="fontSize" currentValue={fontSizeCurrentValue} />
    </div>
  </PropertyRow>

  <PropertyRow label={t('editor.textSection.weight')}>
    <Select value={fontWeight} onValueChange={onFontWeightChange}>
      <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
        <SelectValue
          placeholder={fontWeight === undefined
            ? t('editor.textSection.mixed')
            : t('editor.textSection.selectWeight')}
        />
      </SelectTrigger>
      <SelectContent>
        {#each supportedFontWeightOptions as weight (weight.value)}
          <SelectItem value={weight.value} class="text-xs">
            {t(`editor.textSection.fontWeights.${weight.labelKey}`)}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </PropertyRow>

  <PropertyRow label={t('editor.textSection.style')}>
    <div class="flex gap-1">
      <Button
        variant={isBoldActive ? 'secondary' : 'ghost'}
        size="icon"
        class="h-7 w-7"
        onclick={onBoldToggle}
        title={canUseBold ? t('editor.textSection.bold') : t('editor.textSection.boldUnavailable')}
        aria-label={t('editor.textSection.bold')}
        aria-pressed={isBoldActive}
        disabled={!canUseBold}
      >
        <Bold class="w-3.5 h-3.5" />
      </Button>
      <Button
        variant={isItalicActive ? 'secondary' : 'ghost'}
        size="icon"
        class="h-7 w-7"
        onclick={onItalicToggle}
        title={t('editor.textSection.italic')}
        aria-label={t('editor.textSection.italic')}
        aria-pressed={isItalicActive}
      >
        <Italic class="w-3.5 h-3.5" />
      </Button>
      <Button
        variant={isUnderlineActive ? 'secondary' : 'ghost'}
        size="icon"
        class="h-7 w-7"
        onclick={onUnderlineToggle}
        title={t('editor.textSection.underline')}
        aria-label={t('editor.textSection.underline')}
        aria-pressed={isUnderlineActive}
      >
        <Underline class="w-3.5 h-3.5" />
      </Button>
    </div>
  </PropertyRow>
{/if}
