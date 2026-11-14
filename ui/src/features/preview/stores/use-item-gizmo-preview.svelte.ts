// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { useStoreSelector } from '../../../runtime/use-sync-external-store.svelte'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'

interface ItemGizmoPreviewOptions {
  /**
   * The item wrapper presents translate deltas directly on its DOM node. In
   * that mode only the interaction boundary is needed, not every pointer
   * position.
   */
  imperativeTranslate?: boolean
}

/** The item's gizmo interaction state; every field is a reactive getter. */
export function useItemGizmoPreview(
  itemId: () => string,
  options: () => ItemGizmoPreviewOptions = () => ({}),
) {
  const activeGizmoMode = useStoreSelector(useGizmoStore, (state) =>
    state.activeGizmo?.itemId === itemId() ? state.activeGizmo.mode : null,
  )
  const previewTransform = useStoreSelector(useGizmoStore, (state) => {
    if (state.activeGizmo?.itemId !== itemId()) return null
    if (options().imperativeTranslate && state.activeGizmo.mode === 'translate') {
      return null
    }
    return state.previewTransform
  })
  const itemPreview = useStoreSelector(useGizmoStore, (state) => state.preview?.[itemId()])
  const activeGizmo = $derived(
    activeGizmoMode.current === null ? null : { itemId: itemId(), mode: activeGizmoMode.current },
  )

  return {
    get activeGizmo() {
      return activeGizmo
    },
    get previewTransform() {
      return previewTransform.current
    },
    get itemPreview() {
      return itemPreview.current
    },
  }
}
