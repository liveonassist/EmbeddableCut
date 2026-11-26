<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { Button } from '@/components/ui/button'
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
  import { cn } from '@/shared/ui/cn'
  import type { TimelineTrack } from '@/types/timeline'

  let { kind, label, selectedTrackId, options, onSelectTrack }: {
    kind: 'video' | 'audio'
    label: string
    selectedTrackId: string | null
    options: TimelineTrack[]
    onSelectTrack: (trackId: string | null) => void
  } = $props()
  const kindLabel = $derived(kind === 'video' ? 'Video' : 'Audio')
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props}
        variant="ghost"
        size="sm"
        class={cn(
          'h-6 min-w-15 justify-between gap-1 px-1.5 font-mono text-[10px]',
          !selectedTrackId && 'text-muted-foreground',
        )}
        aria-label={`Choose ${kindLabel.toLowerCase()} source patch destination`}
      >
        <span class="truncate">
          {label}
        </span>
        <ChevronDown class="h-3 w-3 shrink-0 opacity-70" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="w-40">
    <DropdownMenuLabel class="font-mono text-[10px] uppercase tracking-normal">
      {kindLabel}
      destination
    </DropdownMenuLabel>
    <DropdownMenuItem
      class={cn(
        'font-mono text-xs',
        selectedTrackId === null && 'bg-accent text-accent-foreground',
      )}
      onSelect={() => onSelectTrack(null)}
    >
      Auto
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    {#if options.length > 0}
      {#each options as track (track.id)}
        <DropdownMenuItem
          class={cn(
            'font-mono text-xs',
            selectedTrackId === track.id && 'bg-accent text-accent-foreground',
          )}
          onSelect={() => onSelectTrack(track.id)}
        >
          {track.name}
        </DropdownMenuItem>
      {/each}
    {:else}
      <DropdownMenuItem disabled class="font-mono text-xs">
        Create on edit
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
