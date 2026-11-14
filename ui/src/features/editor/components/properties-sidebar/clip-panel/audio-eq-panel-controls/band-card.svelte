<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { cn } from '@/shared/ui/cn'
  import BandFilterCell from './band-filter-cell.svelte'
  import BandTitlePill from './band-title-pill.svelte'
  import { BAND_CARD_CHROME, type FilterType } from './types'

  interface BandCardProps {
    title: string
    filterType: FilterType
    filterOptions?: ReadonlyArray<FilterType>
    onFilterTypeChange?: (value: FilterType) => void
    portalContainer?: HTMLElement | null
    compact?: boolean
    active?: boolean
    onToggle?: () => void
    onReset: () => void
    children: Snippet
  }

  let {
    title,
    filterType,
    filterOptions,
    onFilterTypeChange,
    portalContainer,
    compact = false,
    active = true,
    onToggle,
    onReset,
    children,
  }: BandCardProps = $props()

  const chrome = $derived(compact ? BAND_CARD_CHROME.compact : BAND_CARD_CHROME.full)
</script>

<section
  class={cn(
    'flex min-w-0 flex-col rounded-[6px] border border-border bg-secondary/50 transition-opacity',
    !active && onToggle && 'opacity-50',
  )}
>
  <div
    class={cn(
      'grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border',
      chrome.header,
    )}
  >
    <div class={cn('flex min-w-0 items-center overflow-hidden', chrome.titleRow)}>
      <BandTitlePill {title} {active} {onToggle} {compact} />
      <div class="shrink-0">
        <BandFilterCell {filterType} {filterOptions} {onFilterTypeChange} {portalContainer} />
      </div>
    </div>
    <button
      type="button"
      class={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300',
        chrome.resetButton,
      )}
      onclick={onReset}
      aria-label="Reset {title}"
      title="Reset {title}"
    >
      <RotateCcw class={chrome.resetIcon} />
    </button>
  </div>
  <div class={cn('flex flex-1 flex-col', chrome.body)}>{@render children()}</div>
</section>
