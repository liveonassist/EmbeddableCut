<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useGradeClipboardStore } from '@/shared/state/grade-clipboard'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import {
    copyGradeFromItem,
    itemHasColorGrade,
    pasteGradeToItems,
  } from '@/features/timeline/utils/grade-clipboard-ops'

  /**
   * Copy/paste color grade. Self-contained: reads selection, items, and the
   * grade clipboard directly instead of threading config through the host.
   */
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const hasCopiedGrade = select(
    useGradeClipboardStore,
    (s) => s.grade !== null && s.grade.length > 0,
  )
  const canCopyGradeSelection = $derived.by(() => {
    const ids = selectedItemIds.current
    return select(useItemsStore, (s) => ids.some((itemId) => itemHasColorGrade(s.itemById[itemId])))
  })
  const hasVisualSelectionSelection = $derived.by(() => {
    const ids = selectedItemIds.current
    return select(useItemsStore, (s) =>
      ids.some((itemId) => {
        const item = s.itemById[itemId]
        return item !== undefined && item.type !== 'audio'
      }),
    )
  })
  const canCopyGrade = $derived(canCopyGradeSelection.current)
  const canPasteGrade = $derived(hasCopiedGrade.current && hasVisualSelectionSelection.current)

  function handleCopyGrade() {
    const { itemById } = useItemsStore.getState()
    const sourceId = selectedItemIds.current.find((itemId) => itemHasColorGrade(itemById[itemId]))
    if (sourceId) copyGradeFromItem(sourceId)
  }

  function handlePasteGrade() {
    pasteGradeToItems(selectedItemIds.current)
  }
</script>

{#if canCopyGrade || canPasteGrade}
  {#if canCopyGrade}
    <ContextMenuItem onclick={handleCopyGrade}>{t('timeline.contextMenu.copyGrade')}</ContextMenuItem>
  {/if}
  {#if canPasteGrade}
    <ContextMenuItem onclick={handlePasteGrade}
      >{t('timeline.contextMenu.pasteGrade')}</ContextMenuItem
    >
  {/if}
  <ContextMenuSeparator />
{/if}
