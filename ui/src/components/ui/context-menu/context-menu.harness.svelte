<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuTrigger,
  } from '.'

  let { onSelect }: { onSelect?: () => void } = $props()
</script>

<ContextMenu>
  <ContextMenuTrigger>Clip</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuLabel>Clip</ContextMenuLabel>
    <ContextMenuItem {onSelect}>Split</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
