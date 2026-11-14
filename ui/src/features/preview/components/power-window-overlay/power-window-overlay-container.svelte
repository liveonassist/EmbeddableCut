<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { select } from '$lib/store.svelte'
  import { useSelectionStore } from '@/shared/state/selection'
  import type { ItemEffect } from '@/types/effects'
  import type { TimelineItem } from '@/types/timeline'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import { usePowerWindowEditorStore } from '@/features/preview/stores/power-window-editor-store'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import type { CoordinateParams } from '@/features/preview/types/gizmo'
  import PowerWindowOverlay from './power-window-overlay.svelte'

  interface PowerWindowOverlayContainerProps {
    containerRect: DOMRect | null
    playerSize: { width: number; height: number }
    projectSize: { width: number; height: number }
    zoom: number
  }

  function findPowerWindowEffect(item: TimelineItem, effectId: string): ItemEffect | null {
    return (
      (item.effects ?? []).find(
        (entry) =>
          entry.id === effectId &&
          entry.enabled &&
          entry.effect.type === 'gpu-effect' &&
          entry.effect.gpuEffectType === 'gpu-power-window',
      ) ?? null
    )
  }
</script>

<script lang="ts">
  let { containerRect, playerSize, projectSize, zoom }: PowerWindowOverlayContainerProps = $props()
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const items = select(useItemsStore, (s) => s.items)
  const isEditing = select(usePowerWindowEditorStore, (s) => s.isEditing)
  const editingItemId = select(usePowerWindowEditorStore, (s) => s.editingItemId)
  const editingEffectId = select(usePowerWindowEditorStore, (s) => s.editingEffectId)
  const stopEditing = usePowerWindowEditorStore.getState().stopEditing
  const clearPreviewForItems = useGizmoStore.getState().clearPreviewForItems

  const editingItem = $derived.by(() => {
    if (!isEditing.current || !editingItemId.current || !selectedItemIds.current.includes(editingItemId.current)) return null
    return items.current.find((item) => item.id === editingItemId.current) ?? null
  })

  const editedEffect = $derived(editingItem && editingEffectId.current !== null
      ? findPowerWindowEffect(editingItem, editingEffectId.current)
      : null)
  const coordParams = $derived.by((): CoordinateParams | null => {
    if (!containerRect) return null
    return { containerRect, playerSize, projectSize, zoom }
  })
  $effect(() => {
    if (!isEditing.current) return
    if (!editingItem || !editedEffect) {
      if (editingItemId.current) clearPreviewForItems([editingItemId.current])
      stopEditing()
    }
  })

  $effect(() => {
    if (!isEditing.current) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (editingItemId.current) clearPreviewForItems([editingItemId.current])
      stopEditing()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })
</script>

{#if !(!coordParams || !editingItem || !editedEffect)}
  <PowerWindowOverlay
    coordParams={coordParams}
    effect={editedEffect}
    item={editingItem}
    playerSize={playerSize}
   />
{/if}
