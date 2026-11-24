<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import ItemContextMenu from './item-context-menu.svelte'
  import { setEditorUi, type EditorUi } from '$lib/context'

  /** A clip's context menu inside a given editor UI context. */
  let { ui, menu }: { ui: EditorUi; menu: ComponentProps<typeof ItemContextMenu> } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi(ui)
</script>

<ItemContextMenu {...menu} />
