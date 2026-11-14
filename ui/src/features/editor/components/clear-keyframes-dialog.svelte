<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select, shallow } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import {
    removeKeyframesForItem,
    removeKeyframesForProperty,
  } from '@/features/editor/deps/timeline-store'
  import { PROPERTY_LABELS } from '@/types/keyframe'
  import { useClearKeyframesDialogStore } from '@/shared/state/clear-keyframes-dialog'

  /**
   * Confirmation dialog for clearing keyframes from selected items.
   * Triggered by Shift+A hotkey or context menu actions.
   */
  const isOpen = select(useClearKeyframesDialogStore, (s) => s.isOpen)
  const itemIds = select(useClearKeyframesDialogStore, (s) => s.itemIds, shallow)
  const property = select(useClearKeyframesDialogStore, (s) => s.property)

  function handleConfirm() {
    const { itemIds: ids, property: target, close } = useClearKeyframesDialogStore.getState()
    if (target) {
      // Clear keyframes for specific property
      for (const itemId of ids) {
        removeKeyframesForProperty(itemId, target)
      }
    } else {
      // Clear all keyframes
      for (const itemId of ids) {
        removeKeyframesForItem(itemId)
      }
    }
    close()
  }

  const itemCount = $derived(itemIds.current.length)
  const propertyLabel = $derived(property.current ? PROPERTY_LABELS[property.current] : null)

  const title = $derived(
    property.current
      ? t('editor.clearKeyframesDialog.titleProperty', { property: propertyLabel })
      : t('editor.clearKeyframesDialog.titleAll'),
  )
  const description = $derived(
    property.current
      ? t('editor.clearKeyframesDialog.descriptionProperty', {
          property: propertyLabel,
          count: itemCount,
        })
      : t('editor.clearKeyframesDialog.descriptionAll', { count: itemCount }),
  )
</script>

<AlertDialog
  bind:open={
    () => isOpen.current,
    (open) => {
      if (!open) useClearKeyframesDialogStore.getState().close()
    }
  }
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>
        {description}
        <br />
        <span class="text-muted-foreground text-xs mt-1 block">
          {t('editor.clearKeyframesDialog.undoHint')}
        </span>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
      <AlertDialogAction onclick={handleConfirm}>
        {t('editor.clearKeyframesDialog.confirm')}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
