<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Separator } from '@/components/ui/separator'
  import { cn } from '@/shared/ui/cn'
  import { updateItem } from '@/features/editor/deps/timeline-store'
  import type { SubtitleSegmentItem, TextItem } from '@/types/timeline'

  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import CaptionStyleSwatches from '@/components/caption-style-swatches.svelte'
  import { ColorPicker, PropertyRow, SliderInput } from '../components'
  import FontPicker from './font-picker.svelte'
  import { FONT_WEIGHT_OPTIONS } from './text-section-constants'
  import {
    type CaptionStylePreset,
    detectActiveCaptionPreset,
    resolveCaptionStylePatch,
  } from '@/shared/typography/caption-style-presets'

  type CaptionStylableItem = SubtitleSegmentItem | TextItem

  interface CaptionStyleControlsProps {
    /**
     * Items the controls should affect. Typically a single subtitle segment,
     * but the panel handles multi-select by writing the same patch to each.
     */
    items: CaptionStylableItem[]
    canvasWidth: number
    canvasHeight: number
    onApplyPatch?: (patch: Partial<CaptionStylableItem>) => void
  }

  /**
   * Caption / subtitle look-and-feel editor.
   *
   * Surfaces the typography subset shared between `TextItem` (captions)
   * and `SubtitleSegmentItem`: presets, color, font size, vertical
   * position, and a background-box toggle. Designed to be embedded inside a
   * larger section (e.g. `SubtitleSection`).
   */
  let { items, canvasWidth, canvasHeight, onApplyPatch }: CaptionStyleControlsProps = $props()

  const applyPatch = (patch: Partial<CaptionStylableItem>) => {
    if (onApplyPatch) {
      onApplyPatch(patch)
      return
    }
    for (const item of items) updateItem(item.id, patch)
  }

  const applyPreset = (preset: CaptionStylePreset) => {
    // Resolve the preset's canvas-relative layout (font size, transform.y,
    // etc.) into absolute values for THIS canvas, anchored to the
    // first-selected item's existing transform so we preserve x/rotation.
    const baseTransform = items[0]?.transform
    const resolved = resolveCaptionStylePatch(preset, canvasWidth, canvasHeight, baseTransform)
    applyPatch(resolved as Partial<CaptionStylableItem>)
  }

  // Prefer the first item as the canonical sample for displaying current
  // values — multi-select with mismatched values shows the first's value
  // and the user can override it for everyone in one click.
  const sample = $derived(items[0])
  const activePreset = $derived(sample ? detectActiveCaptionPreset(sample) : null)

  const sampleCueText = $derived(
    (sample?.type === 'subtitle' ? sample.cues[0]?.text : undefined) || undefined,
  )
  const sampleColor = $derived(sample?.color ?? '#ffffff')
  const sampleFontSize = $derived(
    sample?.fontSize ?? Math.max(36, Math.round(canvasHeight * 0.045)),
  )
  const sampleTextPadding = $derived(sample?.textPadding ?? 16)
  const verticalY = $derived(Math.round(sample?.transform?.y ?? 0))
  const hasBackground = $derived(!!sample?.backgroundColor)
  const verticalRange = $derived(Math.max(1, Math.round(canvasHeight / 2)))

  const updateVerticalPosition = (value: number) => {
    applyPatch({
      transform: {
        ...(sample?.transform ?? {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: 1,
        }),
        y: value,
      },
    } as Partial<CaptionStylableItem>)
  }
</script>

{#if sample}
  <div class="space-y-1">
    <div>
      <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pb-1.5">
        {t('editor.captionStyleControls.stylePreset')}
      </p>
      <CaptionStyleSwatches selectedId={activePreset?.id ?? null} onSelect={applyPreset} />
    </div>

    <Separator class="my-1" />

    <PropertyRow label={t('editor.captionStyleControls.font')} class="items-start">
      <FontPicker
        value={sample.fontFamily ?? 'Inter'}
        previewText={sampleCueText}
        onValueChange={(fontFamily) => applyPatch({ fontFamily })}
      />
    </PropertyRow>

    <PropertyRow label={t('editor.captionStyleControls.weight')}>
      <Select
        value={sample.fontWeight ?? 'normal'}
        onValueChange={(value) =>
          applyPatch({ fontWeight: value as CaptionStylableItem['fontWeight'] })}
      >
        <SelectTrigger class="h-7 text-xs flex-1 min-w-0">
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
    </PropertyRow>

    <ColorPicker
      label={t('editor.captionStyleControls.color')}
      color={sampleColor}
      onChange={(color) => applyPatch({ color })}
      onLiveChange={(color) => applyPatch({ color })}
      onReset={() => applyPatch({ color: '#ffffff' })}
      defaultColor="#ffffff"
    />

    <PropertyRow label={t('editor.captionStyleControls.size')}>
      <SliderInput
        value={sampleFontSize}
        onChange={(fontSize) => applyPatch({ fontSize })}
        onLiveChange={(fontSize) => applyPatch({ fontSize })}
        min={8}
        max={400}
        step={1}
        unit="px"
        class="flex-1 min-w-0"
      />
    </PropertyRow>

    <PropertyRow label={t('editor.captionStyleControls.vertical')}>
      <SliderInput
        value={verticalY}
        onChange={updateVerticalPosition}
        onLiveChange={updateVerticalPosition}
        min={-verticalRange}
        max={verticalRange}
        step={1}
        unit="px"
        class="flex-1 min-w-0"
      />
    </PropertyRow>

    <PropertyRow label={t('editor.captionStyleControls.background')}>
      <div class="flex flex-1 min-w-0">
        <button
          type="button"
          onclick={() =>
            applyPatch({
              backgroundColor: hasBackground ? undefined : 'rgba(0, 0, 0, 0.55)',
            })}
          class={cn(
            'h-7 w-full rounded border text-xs transition-colors',
            hasBackground
              ? 'border-border/70 bg-secondary/60 text-foreground'
              : 'border-border hover:bg-secondary/40 text-muted-foreground',
          )}
        >
          {hasBackground
            ? t('editor.captionStyleControls.on')
            : t('editor.captionStyleControls.off')}
        </button>
      </div>
    </PropertyRow>

    {#if hasBackground}
      <PropertyRow label={t('editor.captionStyleControls.padding')}>
        <SliderInput
          value={sampleTextPadding}
          onChange={(textPadding) => applyPatch({ textPadding })}
          onLiveChange={(textPadding) => applyPatch({ textPadding })}
          min={0}
          max={80}
          step={1}
          unit="px"
          class="flex-1 min-w-0"
        />
      </PropertyRow>
    {/if}
  </div>
{/if}
