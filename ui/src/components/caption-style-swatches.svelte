<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import {
    CAPTION_STYLE_PRESETS,
    type CaptionStylePreset,
  } from '@/shared/typography/caption-style-presets'
  import { ensureFontsLoaded, FONT_WEIGHT_MAP } from '@/shared/typography/fonts'

  interface CaptionStyleSwatchesProps {
    /** The highlighted preset, or null when the current look matches none. */
    selectedId: string | null
    onSelect: (preset: CaptionStylePreset) => void
    disabled?: boolean
  }

  /**
   * The caption presets drawn as they render: each swatch sets its sample in
   * the preset's own font, color, outline and box over a frame-black tile, so
   * a look is picked by eye rather than by name.
   */
  let { selectedId, onSelect, disabled = false }: CaptionStyleSwatchesProps = $props()

  $effect(() => {
    const families = [...new Set(CAPTION_STYLE_PRESETS.map((preset) => preset.patch.fontFamily))]
    const weights = [
      ...new Set(
        CAPTION_STYLE_PRESETS.map((preset) => FONT_WEIGHT_MAP[preset.patch.fontWeight ?? 'normal']),
      ),
    ]
    void ensureFontsLoaded(
      families.filter((family): family is string => !!family),
      weights.filter((weight): weight is number => weight !== undefined),
    ).catch(() => {})
  })

  function sampleStyle(preset: CaptionStylePreset): string {
    const { patch } = preset
    // Halved throughout: the presets are sized for a 1080p frame, the sample for a swatch.
    const shadow = patch.textShadow
      ? [
          `${patch.textShadow.offsetX / 2}px`,
          `${patch.textShadow.offsetY / 2}px`,
          `${patch.textShadow.blur / 2}px`,
          patch.textShadow.color,
        ].join(' ')
      : 'none'
    return [
      `font-family: '${patch.fontFamily ?? 'Inter'}', sans-serif`,
      `font-weight: ${FONT_WEIGHT_MAP[patch.fontWeight ?? 'normal'] ?? 400}`,
      `color: ${patch.color ?? '#ffffff'}`,
      `letter-spacing: ${(patch.letterSpacing ?? 0) / 2}px`,
      `text-shadow: ${shadow}`,
      patch.stroke ? `-webkit-text-stroke: ${patch.stroke.width / 2}px ${patch.stroke.color}` : '',
      patch.stroke ? 'paint-order: stroke fill' : '',
      patch.backgroundColor ? `background-color: ${patch.backgroundColor}` : '',
      patch.backgroundColor ? `border-radius: ${(patch.backgroundRadius ?? 0) / 2}px` : '',
      patch.backgroundColor ? 'padding: 1px 6px' : '',
    ]
      .filter(Boolean)
      .join('; ')
  }
</script>

<div
  class="grid grid-cols-3 gap-1.5"
  role="radiogroup"
  aria-label={t('editor.captionStyleControls.stylePreset')}
>
  {#each CAPTION_STYLE_PRESETS as preset (preset.id)}
    {@const selected = selectedId === preset.id}
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={preset.label}
      title={t(preset.hintKey)}
      {disabled}
      onclick={() => onSelect(preset)}
      class={cn(
        'group flex flex-col overflow-hidden rounded border text-left transition-colors disabled:opacity-50',
        // Neutral, like the rest of the caption controls: orange stays for focus and playback.
        selected ? 'border-foreground/70' : 'border-border hover:border-muted-foreground/60',
      )}
    >
      <span
        class="flex h-11 items-center justify-center bg-preview-letterbox px-1 text-[15px] leading-none"
      >
        <span class="truncate" style={sampleStyle(preset)}>Aa Bb</span>
      </span>
      <span
        class={cn(
          'truncate px-1.5 py-1 text-[10px]',
          selected ? 'bg-secondary/60 text-foreground' : 'text-muted-foreground',
        )}
      >
        {preset.label}
      </span>
    </button>
  {/each}
</div>
