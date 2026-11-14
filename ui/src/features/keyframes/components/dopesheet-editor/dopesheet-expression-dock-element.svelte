<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * What React's `useDopesheetExpressionDock` returned as an element: the dock
   * layer for the open draft, or nothing when no draft is open. The editor
   * places it where the presentation shell renders `expressionDockElement`.
   */
  import DopesheetExpressionDockLayer from './dopesheet-expression-dock-layer.svelte'
  import type { UseDopesheetExpressionDockReturn } from './use-dopesheet-expression-dock.svelte'

  let { dock }: { dock: UseDopesheetExpressionDockReturn } = $props()
</script>

{#if dock.layerProps}
  <DopesheetExpressionDockLayer {...dock.layerProps} />
{/if}
