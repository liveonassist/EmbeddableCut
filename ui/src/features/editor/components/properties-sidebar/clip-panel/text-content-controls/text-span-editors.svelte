<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import { t } from '$lib/i18n.svelte'
  import Italic from 'lucide-svelte/icons/italic'
  import Underline from 'lucide-svelte/icons/underline'
  import { Button } from '@/components/ui/button'
  import { Textarea } from '@/components/ui/textarea'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { TextItem, TextSpan } from '@/types/timeline'
  import { ColorPicker, NumberInput, PropertyGroupHeader } from '../../components'
  import FontPicker from '../font-picker.svelte'
  import { FONT_WEIGHT_OPTIONS } from '../text-section-constants'
  import {
    getSpanEditorConfigs,
    getSpanEditorEmphasis,
    getSpanEditorTypography,
  } from '../text-section-utils'

  interface TextSpanEditorsProps {
    spans: TextSpan[]
    /** First selected item, whose style fills in whatever a span leaves unset. */
    fallbackItem: TextItem
    onSpanTextChange: (index: number, value: string) => void
    onSpanFontFamilyChange: (index: number, value: string) => void
    onSpanFontSizeChange: (index: number, value: number) => void
    onSpanFontSizeLiveChange: (index: number, value: number) => void
    onSpanWeightChange: (index: number, value: string) => void
    onSpanLetterSpacingChange: (index: number, value: number) => void
    onSpanLetterSpacingLiveChange: (index: number, value: number) => void
    onSpanColorChange: (index: number, value: string) => void
    onSpanColorLiveChange: (index: number, value: string) => void
    onSpanItalicToggle: (index: number) => void
    onSpanUnderlineToggle: (index: number) => void
  }

  /** One editor card per span (eyebrow / headline / subtitle) of a structured text item. */
  let {
    spans,
    fallbackItem,
    onSpanTextChange,
    onSpanFontFamilyChange,
    onSpanFontSizeChange,
    onSpanFontSizeLiveChange,
    onSpanWeightChange,
    onSpanLetterSpacingChange,
    onSpanLetterSpacingLiveChange,
    onSpanColorChange,
    onSpanColorLiveChange,
    onSpanItalicToggle,
    onSpanUnderlineToggle,
  }: TextSpanEditorsProps = $props()

  const spanEditorConfigs = $derived(getSpanEditorConfigs(spans.length, t as unknown as TFunction))
</script>

<div class="space-y-2">
  {#each spans as span, index (index)}
    {@const config = spanEditorConfigs[index] ?? {
      label: t('editor.textSection.span', { count: index + 1 }),
      placeholder: t('editor.textSection.spanText', { count: index + 1 }),
      rows: 2,
      allowItalic: true,
    }}
    {@const typography = getSpanEditorTypography(span, fallbackItem)}
    {@const emphasis = getSpanEditorEmphasis(span, fallbackItem)}
    <div class="rounded-md border border-border/70 p-2">
      <PropertyGroupHeader class="pb-2">{config.label}</PropertyGroupHeader>
      <Textarea
        value={span.text}
        oninput={(e) => onSpanTextChange(index, e.currentTarget.value)}
        placeholder={config.placeholder}
        class="min-h-[52px] text-xs"
        rows={config.rows}
      />
      <div class="mt-2">
        <FontPicker
          value={typography.fontFamily}
          placeholder={t('editor.textSection.selectFont')}
          previewText={span.text || config.label}
          onValueChange={(value) => onSpanFontFamilyChange(index, value)}
        />
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <NumberInput
          label={t('editor.textSection.size')}
          value={typography.fontSize}
          onChange={(value) => onSpanFontSizeChange(index, value)}
          onLiveChange={(value) => onSpanFontSizeLiveChange(index, value)}
          min={8}
          max={500}
          step={1}
          unit="px"
          class="min-w-0"
        />
        <Select
          value={typography.fontWeight}
          onValueChange={(value) => onSpanWeightChange(index, value)}
        >
          <SelectTrigger class="h-7 text-xs min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {#each FONT_WEIGHT_OPTIONS as weight (weight.value)}
              <SelectItem value={weight.value} class="text-xs">
                {t(`editor.textSection.fontWeights.${weight.labelKey}`)}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>
      <div class="mt-2">
        <NumberInput
          label={t('editor.textSection.spacing')}
          value={typography.letterSpacing}
          onChange={(value) => onSpanLetterSpacingChange(index, value)}
          onLiveChange={(value) => onSpanLetterSpacingLiveChange(index, value)}
          min={-20}
          max={100}
          step={1}
          unit="px"
          class="min-w-0"
        />
      </div>
      <div class="mt-2 flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <ColorPicker
            color={emphasis.color}
            onChange={(value) => onSpanColorChange(index, value)}
            onLiveChange={(value) => onSpanColorLiveChange(index, value)}
            allowAlpha
          />
        </div>
        {#if config.allowItalic}
          <Button
            variant={emphasis.isItalic ? 'secondary' : 'ghost'}
            size="icon"
            class="h-7 w-7"
            onclick={() => onSpanItalicToggle(index)}
            title={t('editor.textSection.italicSpan', {
              label: config.label,
            })}
          >
            <Italic class="w-3.5 h-3.5" />
          </Button>
        {/if}
        <Button
          variant={(span.underline ?? fallbackItem.underline ?? false) ? 'secondary' : 'ghost'}
          size="icon"
          class="h-7 w-7"
          onclick={() => onSpanUnderlineToggle(index)}
          title={t('editor.textSection.underlineSpan', {
            label: config.label,
          })}
        >
          <Underline class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  {/each}
</div>
