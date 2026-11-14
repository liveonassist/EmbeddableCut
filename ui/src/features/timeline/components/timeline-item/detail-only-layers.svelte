<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  interface DetailOnlyLayersProps {
    isCompactShell: boolean
    children: Snippet
  }

  /**
   * Gate for the clip layers that only exist in full-detail shells. Compact shells
   * already suppress rich content, so these regions are skipped outright instead
   * of being rendered and hidden. The density boolean is computed once by the
   * clip and passed down, so every gated region agrees.
   */
  let { isCompactShell, children }: DetailOnlyLayersProps = $props()
</script>

{#if !isCompactShell}
  {@render children()}
{/if}
