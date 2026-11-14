<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { getSpatialPointEffectConfig } from '@/infrastructure/gpu-effects/spatial-point-editor'
  import type { ItemEffect } from '@/types/effects'
  import type { TimelineItem } from '@/types/timeline'


  interface SpatialEffectPointOverlayContainerProps {
    containerRect: DOMRect | null
    playerSize: { width: number; height: number }
    projectSize: { width: number; height: number }
    zoom: number
  }

  function findSpatialEffect(item: TimelineItem, effectId: string): ItemEffect | null {
    const effect = (item.effects ?? []).find((entry) => entry.id === effectId)
    if (!effect?.enabled || effect.effect.type !== 'gpu-effect') return null
    return getSpatialPointEffectConfig(effect.effect.gpuEffectType) ? effect : null
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import { useSpatialEffectEditorStore } from '@/features/preview/stores/spatial-effect-editor-store'
  import type { CoordinateParams } from '@/features/preview/types/gizmo'
  import SpatialEffectPointOverlay from './spatial-effect-point-overlay.svelte'
  let { containerRect, playerSize, projectSize, zoom }: SpatialEffectPointOverlayContainerProps = $props()
  const items = select(useItemsStore, (s) => s.items)
  const isEditing = select(useSpatialEffectEditorStore, (s) => s.isEditing)
  const editingItemId = select(useSpatialEffectEditorStore, (s) => s.editingItemId)
  const editingEffectId = select(useSpatialEffectEditorStore, (s) => s.editingEffectId)
  const stopEditing = useSpatialEffectEditorStore.getState().stopEditing
  const clearPreviewForItems = useGizmoStore.getState().clearPreviewForItems

  const editingItem = $derived.by(() => {
    if (!isEditing.current || !editingItemId.current) return null
    return items.current.find((item) => item.id === editingItemId.current) ?? null
  })
  const editedEffect = $derived(editingItem && editingEffectId.current ? findSpatialEffect(editingItem, editingEffectId.current) : null)
  const config = $derived(editedEffect?.effect.type === 'gpu-effect'
      ? getSpatialPointEffectConfig(editedEffect.effect.gpuEffectType)
      : null)
  const coordParams = $derived.by((): CoordinateParams | null => {
    if (!containerRect) return null
    return { containerRect, playerSize, projectSize, zoom }
  })

  $effect(() => {
    if (!isEditing.current || (editingItem && editedEffect && config)) return
    if (editingItemId.current) clearPreviewForItems([editingItemId.current])
    stopEditing()
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

{#if !(!coordParams || !editingItem || !editedEffect || !config)}
  <SpatialEffectPointOverlay
    coordParams={coordParams}
    playerSize={playerSize}
    item={editingItem}
    effect={editedEffect}
    xParam={config.xParam}
    yParam={config.yParam}
   />
{/if}
