<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste'
  import Copy from 'lucide-svelte/icons/copy'
  import CopyPlus from 'lucide-svelte/icons/copy-plus'
  import Group from 'lucide-svelte/icons/group'
  import Pencil from 'lucide-svelte/icons/pencil'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import Ungroup from 'lucide-svelte/icons/ungroup'
  import { t } from '$lib/i18n.svelte'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'

  interface MotionRowContextMenuProps {
    /** The row the menu opens on; spread `props` onto its root element. */
    children: Snippet<[{ props: Record<string, unknown> }]>
    canGroup?: boolean
    canPaste: boolean
    onOpen: () => void
    onRename: () => void
    onGroup?: () => void
    onUngroup?: () => void
    onDuplicate: () => void
    onCopy: () => void
    onPaste: () => void
    onDelete: () => void
    deleteLabel?: string
  }

  let {
    children,
    canGroup = false,
    canPaste,
    onOpen,
    onRename,
    onGroup,
    onUngroup,
    onDuplicate,
    onCopy,
    onPaste,
    onDelete,
    deleteLabel = 'Delete',
  }: MotionRowContextMenuProps = $props()
</script>

<ContextMenu onOpenChange={(open) => open && onOpen()}>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      {@render children({ props })}
    {/snippet}
  </ContextMenuTrigger>
  <ContextMenuContent class="min-w-48 text-xs">
    <ContextMenuItem onSelect={onRename}>
      <Pencil class="mr-2 h-3.5 w-3.5" />
      Rename
    </ContextMenuItem>
    {#if onGroup}
      <ContextMenuItem onSelect={onGroup} disabled={!canGroup}>
        <Group class="mr-2 h-3.5 w-3.5" />
        {t('editor.compose.groupSelected')}
      </ContextMenuItem>
    {/if}
    {#if onUngroup}
      <ContextMenuItem onSelect={onUngroup}>
        <Ungroup class="mr-2 h-3.5 w-3.5" />
        {t('editor.compose.ungroup')}
      </ContextMenuItem>
    {/if}
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={onDuplicate}>
      <CopyPlus class="mr-2 h-3.5 w-3.5" />
      Duplicate
    </ContextMenuItem>
    <ContextMenuItem onSelect={onCopy}>
      <Copy class="mr-2 h-3.5 w-3.5" />
      Copy
    </ContextMenuItem>
    <ContextMenuItem onSelect={onPaste} disabled={!canPaste}>
      <ClipboardPaste class="mr-2 h-3.5 w-3.5" />
      Paste
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={onDelete} class="text-destructive focus:text-destructive">
      <Trash2 class="mr-2 h-3.5 w-3.5" />
      {deleteLabel}
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
