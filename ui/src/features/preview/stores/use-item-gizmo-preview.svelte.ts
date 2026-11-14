// SPDX-License-Identifier: MIT

import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'

interface ItemGizmoPreviewOptions {
  /**
   * The item wrapper presents translate deltas directly on its DOM node. In
   * that mode React only needs the interaction boundary, not every pointer
   * position.
   */
  imperativeTranslate?: boolean
}

export function useItemGizmoPreview(
  getItemId: () => string,
  getOptions: () => ItemGizmoPreviewOptions = () => ({}),
) {
  const itemId = $derived(getItemId())
  const options = $derived(getOptions())
  const activeGizmoMode = selectDerived(useGizmoStore, (state) =>
    state.activeGizmo?.itemId === itemId ? state.activeGizmo.mode : null,
  )
  const previewTransform = selectDerived(useGizmoStore, (state) => {
    if (state.activeGizmo?.itemId !== itemId) return null
    if (options.imperativeTranslate && state.activeGizmo.mode === 'translate') {
      return null
    }
    return state.previewTransform
  })
  const itemPreview = selectDerived(useGizmoStore, (state) => state.preview?.[itemId])
  const activeGizmo = $derived(
    activeGizmoMode.current === null ? null : { itemId, mode: activeGizmoMode.current },
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
