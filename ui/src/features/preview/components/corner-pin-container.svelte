<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useCornerPinStore } from '@/features/preview/stores/corner-pin-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import CornerPinOverlay from './corner-pin-overlay.svelte'
  import type { CoordinateParams, Transform } from '@/features/preview/types/gizmo'
  import { resolveTransform, getSourceDimensions } from '@/features/preview/deps/composition-runtime'

  interface CornerPinContainerProps {
    containerRect: DOMRect | null
    playerSize: { width: number; height: number }
    projectSize: { width: number; height: number }
    zoom: number
  }

  let { containerRect, playerSize, projectSize, zoom }: CornerPinContainerProps = $props()
  const isEditing = select(useCornerPinStore, (s) => s.isEditing)
  const editingItemId = select(useCornerPinStore, (s) => s.editingItemId)
  const stopEditing = useCornerPinStore.getState().stopEditing

  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const items = select(useItemsStore, (s) => s.items)

  // Stop editing when the edited item is deselected
  $effect(() => {
    if (isEditing.current && editingItemId.current && !selectedItemIds.current.includes(editingItemId.current)) {
      stopEditing()
    }
  })

  const editingItem = $derived.by(() => (editingItemId.current ? items.current.find((i) => i.id === editingItemId.current) : null))

  const coordParams = $derived.by((): CoordinateParams | null => {
    if (!containerRect) return null
    return { containerRect, playerSize, projectSize, zoom }
  })

  const itemTransform = $derived.by((): Transform | null => {
    if (!editingItem) return null
    const canvas = { width: projectSize.width, height: projectSize.height, fps: 30 }
    const resolved = resolveTransform(editingItem, canvas, getSourceDimensions(editingItem))
    return {
      x: resolved.x,
      y: resolved.y,
      width: resolved.width,
      height: resolved.height,
      anchorX: resolved.anchorX,
      anchorY: resolved.anchorY,
      rotation: resolved.rotation,
      opacity: resolved.opacity,
      cornerRadius: resolved.cornerRadius,
    }
  })
</script>

{#if !(!isEditing.current || !coordParams || !itemTransform)}
  <CornerPinOverlay
    coordParams={coordParams}
    playerSize={playerSize}
    itemTransform={itemTransform}
   />
{/if}
