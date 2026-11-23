<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { cn } from '@/shared/ui/cn'
  import { PropertyRow } from '../components'
  import {
    CANVAS_ASPECTS,
    CANVAS_RESOLUTIONS,
    aspectOf,
    canvasSize,
    resolutionOf,
  } from './canvas-presets'

  /** Shape and resolution presets over the canvas's width and height. */
  let {
    width,
    height,
    onSizeChange,
  }: {
    width: number
    height: number
    onSizeChange: (size: { width: number; height: number }) => void
  } = $props()

  const CUSTOM = 'custom'
  const aspect = $derived(aspectOf({ width, height }))
  const resolution = $derived(resolutionOf({ width, height }))
  const shortSide = $derived(Math.min(width, height))

  function selectResolution(id: string) {
    const next = CANVAS_RESOLUTIONS.find((option) => option.id === id)
    // A canvas of its own shape keeps it.
    if (next) onSizeChange(canvasSize(aspect ?? { width, height }, next.shortSide))
  }
</script>

<div class="space-y-2">
  <div
    class="grid grid-cols-4 gap-1"
    role="group"
    aria-label={t('editor.canvasPanel.aspectRatio')}
  >
    {#each CANVAS_ASPECTS as option (option.id)}
      {@const selected = aspect?.id === option.id}
      <button
        type="button"
        aria-pressed={selected}
        class={cn(
          'flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-[10px] tabular-nums transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          selected
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
        onclick={() => onSizeChange(canvasSize(option, shortSide))}
      >
        <span
          class="block rounded-[2px] border border-current"
          style:width="{(16 * option.width) / Math.max(option.width, option.height)}px"
          style:height="{(16 * option.height) / Math.max(option.width, option.height)}px"
          aria-hidden="true"
        ></span>
        {option.id}
      </button>
    {/each}
  </div>

  <PropertyRow label={t('editor.canvasPanel.resolution')}>
    <Select value={resolution?.id ?? CUSTOM} onValueChange={selectResolution}>
      <SelectTrigger class="h-7 text-xs" aria-label={t('editor.canvasPanel.resolution')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {#each CANVAS_RESOLUTIONS as option (option.id)}
          <SelectItem value={option.id} class="text-xs">{option.id}</SelectItem>
        {/each}
        {#if !resolution}
          <SelectItem value={CUSTOM} class="text-xs">{t('editor.canvasPanel.custom')}</SelectItem>
        {/if}
      </SelectContent>
    </Select>
  </PropertyRow>
</div>
