<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import MaskEditorOverlay from './mask-editor-overlay.svelte'
  import type { CoordinateParams, Transform } from '@/features/preview/types/gizmo'
  import { useVisualTransforms } from '../hooks/use-visual-transform.svelte'
  import ErrorBoundary from '@/components/error-boundary.svelte'

  interface MaskEditorContainerProps {
    containerRect: DOMRect | null
    playerSize: { width: number; height: number }
    projectSize: { width: number; height: number }
    zoom: number
  }

  let { containerRect, playerSize, projectSize, zoom }: MaskEditorContainerProps = $props()
  const isEditing = select(useMaskEditorStore, (s) => s.isEditing)
  const editingItemId = select(useMaskEditorStore, (s) => s.editingItemId)
  const shapePenMode = select(useMaskEditorStore, (s) => s.shapePenMode)

  const editingItem = selectDerived(useItemsStore, (s) => (editingItemId.current ? (s.itemById[editingItemId.current] ?? null) : null))
  const visualTransforms = useVisualTransforms(() => editingItem.current ? [editingItem.current] : [], () => projectSize)

  const coordParams = $derived.by((): CoordinateParams | null => {
    if (!containerRect) return null
    return { containerRect, playerSize, projectSize, zoom }
  })

  const itemTransform = $derived.by((): Transform | null => {
    // Shape pen mode: use full canvas as the coordinate space
    if (shapePenMode.current) {
      return {
        x: 0,
        y: 0,
        width: projectSize.width,
        height: projectSize.height,
        rotation: 0,
        opacity: 1,
        cornerRadius: 0,
      }
    }
    if (!editingItem.current) return null
    const resolved = visualTransforms.current.get(editingItem.current.id)
    if (!resolved) return null
    return {
      x: resolved.x,
      y: resolved.y,
      width: resolved.width,
      height: resolved.height,
      rotation: resolved.rotation,
      opacity: resolved.opacity,
      cornerRadius: resolved.cornerRadius,
    }
  })
</script>

{#if !(!isEditing.current || !coordParams || !itemTransform)}
  <ErrorBoundary level="component">
    <MaskEditorOverlay
      coordParams={coordParams}
      playerSize={playerSize}
      itemTransform={itemTransform}
     />
  </ErrorBoundary>
{/if}
