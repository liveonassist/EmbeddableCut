<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import { cn } from '@/shared/ui/cn'

  interface BackgroundTaskProgressProps {
    icon: Snippet
    label: string
    progressAriaLabel: string
    progressPercent?: number | null
    indeterminate?: boolean
    meta?: Snippet
    trailing?: Snippet
    fillClass: string
    /** Optional per-item breakdown revealed via a disclosure toggle on the label. */
    details?: Snippet
    /** Accessible label for the expand/collapse toggle. */
    detailsToggleAriaLabel?: string
  }

  let {
    icon,
    label,
    progressAriaLabel,
    progressPercent = null,
    indeterminate = false,
    meta,
    trailing,
    fillClass,
    details,
    detailsToggleAriaLabel,
  }: BackgroundTaskProgressProps = $props()

  const clampedPercent = $derived(
    progressPercent == null ? null : Math.max(0, Math.min(100, Math.round(progressPercent))),
  )
  let expanded = $state(false)
</script>

<div class="px-3 py-2 border-t border-border flex-shrink-0 bg-panel-bg/50">
  <div class="flex items-center gap-2 text-xs">
    {@render icon()}
    <div class="flex-1 min-w-0">
      <div class="mb-1 flex items-center justify-between gap-2">
        {#if details}
          <button
            type="button"
            onclick={() => (expanded = !expanded)}
            aria-expanded={expanded}
            aria-label={detailsToggleAriaLabel}
            class="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              class={cn('w-3 h-3 flex-shrink-0 transition-transform', expanded && 'rotate-90')}
            />
            <span class="truncate">{label}</span>
          </button>
        {:else}
          <span class="text-muted-foreground truncate">{label}</span>
        {/if}
        {#if meta}
          <div class="flex items-center gap-2 text-muted-foreground">{@render meta()}</div>
        {/if}
      </div>
      <div
        role="progressbar"
        aria-label={progressAriaLabel}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate || clampedPercent == null ? undefined : clampedPercent}
        class="h-1 overflow-hidden rounded-full bg-secondary"
      >
        <div
          class={cn(
            'h-full rounded-full transition-all duration-300',
            fillClass,
            indeterminate && 'w-1/3 animate-pulse',
          )}
          style:width={indeterminate || clampedPercent == null ? undefined : `${clampedPercent}%`}
        ></div>
      </div>
      {#if details && expanded}
        <div class="mt-2 space-y-1">{@render details()}</div>
      {/if}
    </div>
    {@render trailing?.()}
  </div>
</div>
