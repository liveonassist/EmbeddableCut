<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import { cn } from '@/shared/ui/cn'

  interface PropertyRowProps {
    label: string
    children: Snippet
    tooltip?: string
    class?: string
  }

  /**
   * Consistent two-column layout for property controls.
   * Label on left, control on right.
   */
  let { label, children, tooltip, class: className }: PropertyRowProps = $props()
</script>

<div class={cn('flex items-center justify-between gap-2 min-w-0 py-1', className)}>
  {#if tooltip}
    <Tooltip>
      <TooltipTrigger>
        {#snippet child({ props })}
          <span {...props} class="text-xs text-muted-foreground min-w-[56px]">{label}</span>
        {/snippet}
      </TooltipTrigger>
      <TooltipContent side="left" class="max-w-[200px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  {:else}
    <span class="text-xs text-muted-foreground min-w-[56px]">{label}</span>
  {/if}
  <div class="flex-1 min-w-0 flex items-center">{@render children()}</div>
</div>
