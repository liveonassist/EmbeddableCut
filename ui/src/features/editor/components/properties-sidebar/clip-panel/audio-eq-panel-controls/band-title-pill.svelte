<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { BAND_CARD_CHROME } from './types'

  /**
   * Band name pill: a toggle while the band can be switched off, otherwise a
   * static active label.
   */
  let {
    title,
    active,
    onToggle,
    compact,
  }: {
    title: string
    active: boolean
    onToggle?: () => void
    compact: boolean
  } = $props()

  const chrome = $derived(compact ? BAND_CARD_CHROME.compact : BAND_CARD_CHROME.full)
</script>

{#if onToggle}
  <button
    type="button"
    onclick={onToggle}
    class={cn(
      'inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full py-0.5 text-[9px] font-semibold leading-none transition-colors',
      chrome.titleMinWidth,
      active
        ? 'bg-primary text-primary-foreground'
        : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
    )}
  >
    {title}
  </button>
{:else}
  <span
    class={cn(
      'inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary py-0.5 text-[9px] font-semibold leading-none text-primary-foreground',
      chrome.titleMinWidth,
    )}
  >
    {title}
  </span>
{/if}
