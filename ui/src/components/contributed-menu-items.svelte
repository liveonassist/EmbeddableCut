<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" generics="M extends keyof MenuTargets">
  import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
  import { findEditorUi } from '$lib/context'
  import type { MenuTargets } from '../extensions/contributions'
  import ContributionIcon from './contribution-icon.svelte'

  /** What hosts and extensions add to a context menu, for what it was opened on. */
  let { menu, target }: { menu: M; target: MenuTargets[M] } = $props()

  const editorUi = findEditorUi()
  const entries = $derived(editorUi?.contributions.menu(menu, target) ?? [])
</script>

{#if editorUi && entries.length > 0}
  {#each entries as entry (entry.id)}
    <ContextMenuItem
      onclick={() => entry.onSelect({ editor: editorUi.editor, ...target })}
      data-contribution-id={entry.id}
    >
      {#if entry.icon}<ContributionIcon icon={entry.icon} class="w-3 h-3 mr-2" />{/if}
      {entry.label}
    </ContextMenuItem>
  {/each}
  <ContextMenuSeparator />
{/if}
