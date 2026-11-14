// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import type { ShapeItem, TimelineItem } from '@/types/timeline'
import { useKeyframesStore } from '@/features/editor/deps/timeline-store'
import { hasPathVertexKeyframes } from '@/features/editor/deps/keyframes'
import {
  getShapeSectionControlVisibility,
  type ShapeSectionControlVisibility,
} from './shape-section-visibility'
import { getSharedShapeValues, type ShapeSharedValues } from './shape-section-shared-values'

export interface ShapeSectionSelectionParams {
  items: TimelineItem[]
  /** Mask-editor state that decides whether the path editor is open. */
  isEditing: boolean
  editingItemId: string | null
  penMode: boolean
}

export interface ShapeSectionSelection {
  readonly shapeItems: ShapeItem[]
  /** Ids of {@link shapeItems}, stable while the selection is unchanged. */
  readonly itemIds: string[]
  readonly sharedValues: ShapeSharedValues | null
  /** The single selected path shape, if the selection is exactly one path. */
  readonly singlePathShape: ShapeItem | null
  readonly pathTopologyLocked: boolean
  readonly isEditingPathShape: boolean
  readonly controlVisibility: ShapeSectionControlVisibility
}

/** Everything the shape inspector derives from the current selection. */
export function useShapeSectionSelection(
  params: () => ShapeSectionSelectionParams,
): ShapeSectionSelection {
  // Filter to only shape items
  const shapeItems = $derived(
    params().items.filter((item): item is ShapeItem => item.type === 'shape'),
  )

  const itemIds = $derived(shapeItems.map((item) => item.id))

  // Get shared values across selected shape items
  const sharedValues = $derived(getSharedShapeValues(shapeItems))

  const singlePathShape = $derived(
    shapeItems.length === 1 && shapeItems[0]?.shapeType === 'path' ? shapeItems[0] : null,
  )
  const singlePathKeyframes = $derived(
    select(useKeyframesStore, (state) =>
      singlePathShape ? state.keyframesByItemId[singlePathShape.id] : undefined,
    ),
  )
  const pathTopologyLocked = $derived(hasPathVertexKeyframes(singlePathKeyframes.current))
  const isEditingPathShape = $derived.by(() => {
    const { isEditing, penMode, editingItemId } = params()
    return !!singlePathShape && isEditing && !penMode && editingItemId === singlePathShape.id
  })
  const controlVisibility = $derived(getShapeSectionControlVisibility(shapeItems))

  return {
    get shapeItems() {
      return shapeItems
    },
    get itemIds() {
      return itemIds
    },
    get sharedValues() {
      return sharedValues
    },
    get singlePathShape() {
      return singlePathShape
    },
    get pathTopologyLocked() {
      return pathTopologyLocked
    },
    get isEditingPathShape() {
      return isEditingPathShape
    },
    get controlVisibility() {
      return controlVisibility
    },
  }
}
