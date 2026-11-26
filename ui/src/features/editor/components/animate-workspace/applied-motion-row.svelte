<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import X from '@lucide/svelte/icons/x'

  let {
    label,
    detail,
    removeLabel,
    onRemove,
    onNavigate,
  }: {
    label: string
    detail: string
    removeLabel?: string
    onRemove?: () => void
    onNavigate?: () => void
  } = $props()
</script>

{#snippet content()}
  <div class="truncate text-[11px] font-medium text-foreground">{label}</div>
  <div class="truncate text-[10px] text-muted-foreground">{detail}</div>
{/snippet}

<div class="flex min-w-0 items-center rounded-md border border-border/60 bg-background/50">
  {#if onNavigate}
    <button
      type="button"
      class="min-w-0 flex-1 rounded-l-md px-2 py-1.5 text-left hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      onclick={onNavigate}
    >
      {@render content()}
    </button>
  {:else}
    <div class="min-w-0 flex-1 px-2 py-1.5">{@render content()}</div>
  {/if}
  {#if onRemove && removeLabel}
    <button
      type="button"
      aria-label={removeLabel}
      class="mr-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
      onclick={onRemove}
    >
      <X class="h-3 w-3" />
    </button>
  {/if}
</div>
