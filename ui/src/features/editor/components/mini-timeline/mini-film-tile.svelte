<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { MINI_FILM_TILE_HEIGHT, MINI_FILM_TILE_WIDTH } from './constants'

  interface MiniFilmTileProps {
    index: number
    label: string
    trackName: string
    timecodeText: string
    thumbnailUrl?: string
    selected: boolean
    onSelect: () => void
    testId?: string
    dataClipId?: string
    /** Inline style string for the thumbnail (React's `imageStyle` object). */
    imageStyle?: string
    imageDataAttributes?: Record<string, string | undefined>
    overlay?: Snippet
  }

  /**
   * Presentational film tile: numbered badge + timecode + track name header, a
   * thumbnail body, and a label footer. The Color workspace layers its baked-grade
   * thumbnail + grade indicator on top via `overlay`/`imageDataAttributes`; the
   * Animate workspace uses it bare. Selection/click behavior is delegated.
   */
  let {
    index,
    label,
    trackName,
    timecodeText,
    thumbnailUrl,
    selected,
    onSelect,
    testId,
    dataClipId,
    imageStyle,
    imageDataAttributes,
    overlay,
  }: MiniFilmTileProps = $props()

  const clipNumber = $derived(String(index + 1).padStart(2, '0'))
</script>

<button
  type="button"
  data-testid={testId}
  data-clip-id={dataClipId}
  class={`group grid shrink-0 grid-rows-[20px_1fr_16px] overflow-hidden rounded-[3px] border bg-[#17181d] text-left shadow-sm transition-colors ${
    selected ? 'border-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_65%,transparent)]' : 'border-zinc-700 hover:border-zinc-500'
  }`}
  style:width="{MINI_FILM_TILE_WIDTH}px"
  style:height="{MINI_FILM_TILE_HEIGHT}px"
  onclick={(event) => {
    // Mouse clicks are already handled by onpointerdown; only act on
    // keyboard activation (Enter/Space), which fires click with detail === 0.
    if (event.detail !== 0) return
    onSelect()
  }}
  onpointerdown={(event) => {
    event.stopPropagation()
    if (event.button !== 0) return
    onSelect()
  }}
  title={label}
>
  <span
    class="flex min-w-0 items-center gap-1 border-b border-black/40 bg-strip px-1.5 text-[10px] font-semibold text-zinc-200"
  >
    <span
      class={`rounded-[2px] border px-1 leading-3 ${
        selected ? 'border-lime-300/80 bg-indigo-700 text-lime-200' : 'border-indigo-400/70 bg-zinc-800 text-zinc-200'
      }`}
    >
      {clipNumber}
    </span>
    <span class="font-mono">{timecodeText}</span>
    <span class="ml-auto text-[9px] text-zinc-400">{trackName}</span>
  </span>

  <span class="relative block min-h-0 overflow-hidden bg-preview-letterbox">
    {#if thumbnailUrl}
      <img src={thumbnailUrl} alt="" class="h-full w-full object-cover" style={imageStyle} {...imageDataAttributes} />
    {:else}
      <span class="block h-full w-full bg-preview-letterbox" style={imageStyle}></span>
    {/if}
    {@render overlay?.()}
  </span>

  <span class="truncate border-t border-black/40 bg-strip-muted px-1.5 text-[10px] font-medium text-zinc-300">
    {label}
  </span>
</button>
