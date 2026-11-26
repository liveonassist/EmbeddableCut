<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import { select } from '$lib/store.svelte'
  import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store'

  /**
   * Breadcrumb navigation for the drill-in path within the active tab. The trail
   * root (`breadcrumbs[0]`) is the tab itself — the Main timeline or a standalone
   * sequence — so it reads "Main > Compound Clip" on the Main tab and
   * "Sequence 1 > Compound Clip" on a sequence tab. Renders nothing at a tab root
   * (no drill-in), where the sequence tab bar already shows where you are.
   */
  const breadcrumbs = select(useCompositionNavigationStore, (s) => s.breadcrumbs)
  const navigateTo = select(useCompositionNavigationStore, (s) => s.navigateTo)
</script>

<!-- Nothing to show until there is a drill-in below the current tab root. -->
{#if breadcrumbs.current.length > 1}
  <div
    class="flex items-center gap-1 px-3 py-1.5 bg-background/80 backdrop-blur-sm border-b border-border text-xs"
  >
    {#each breadcrumbs.current as crumb, index (crumb.compositionId ?? 'root')}
      {@const isLast = index === breadcrumbs.current.length - 1}
      <span class="flex items-center gap-1">
        {#if index > 0}
          <ChevronRight class="h-3 w-3 text-muted-foreground" />
        {/if}
        {#if isLast}
          <span class="text-foreground font-medium">{crumb.label}</span>
        {:else}
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onclick={() => navigateTo.current(index)}
          >
            {crumb.label}
          </button>
        {/if}
      </span>
    {/each}
  </div>
{/if}
