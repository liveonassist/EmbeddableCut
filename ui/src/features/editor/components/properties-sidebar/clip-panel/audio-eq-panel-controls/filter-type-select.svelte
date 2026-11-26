<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { cn } from '@/shared/ui/cn'
  import { AUDIO_EQ_FILTER_TYPE_LABELS } from '../audio-eq-ui'
  import FilterTypeGlyph from './filter-type-glyph.svelte'
  import type { FilterType } from './types'

  let {
    value,
    options,
    onChange,
    portalContainer,
  }: {
    value: FilterType
    options: ReadonlyArray<FilterType>
    onChange: (value: FilterType) => void
    portalContainer?: HTMLElement | null
  } = $props()
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="inline-flex h-6 w-11 items-center justify-center gap-0.5 rounded-[4px] border border-border bg-background px-1 text-muted-foreground transition-colors hover:text-zinc-200"
        title={AUDIO_EQ_FILTER_TYPE_LABELS[value]}
      >
        <FilterTypeGlyph type={value} />
        <ChevronDown class="h-3 w-3 opacity-60" />
      </button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="start"
    side="bottom"
    sideOffset={4}
    container={portalContainer ?? undefined}
    class="z-[80] w-14 min-w-14 rounded-[4px] border-border bg-background p-1"
  >
    {#each options as option (option)}
      <DropdownMenuItem
        class={cn(
          'my-0.5 flex h-7 items-center justify-center rounded-[4px] px-2 text-zinc-300 focus:bg-white/10 focus:text-white',
          option === value && 'bg-white/10 text-white',
        )}
        title={AUDIO_EQ_FILTER_TYPE_LABELS[option]}
        onSelect={() => onChange(option)}
      >
        <FilterTypeGlyph type={option} />
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
