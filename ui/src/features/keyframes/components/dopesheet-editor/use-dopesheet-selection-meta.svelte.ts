// SPDX-License-Identifier: MIT

/**
 * Dopesheet selection metadata.
 * One pass over the frame-independent sheet structure builds the keyframe
 * meta map; the selection summaries and the KeyframeRef list the action layer
 * needs are derived from it. The meta map is mirrored into a ref so drag
 * handlers can read the latest meta without subscribing to it.
 *
 * The follow-up effect that pushes the selected curve onto the active graph
 * property deliberately stays in the editor: it is the editor's
 * selection→active-property contract.
 */

import type { AnimatableProperty, Keyframe, KeyframeRef } from '@/types/keyframe'
import type { KeyframeMeta } from './dopesheet-types'
import {
  buildSelectedFrameSummary,
  collectSelectedFrames,
  type DopesheetSelectedFrameSummary,
} from './dopesheet-selection-summary'
import type { Ref } from '../ref-state.svelte'

export interface UseDopesheetSelectionMetaOptions {
  sheetRowsStructure: readonly { property: AnimatableProperty; keyframes: Keyframe[] }[]
  selectedKeyframeIds: Set<string>
  currentFrame: number
  globalFrame: number | null
  isPropertyLocked: (property: AnimatableProperty) => boolean
  itemId: string
}

export interface UseDopesheetSelectionMetaReturn {
  readonly keyframeMetaById: Map<string, KeyframeMeta>
  keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>>
  readonly selectedFrameSummary: DopesheetSelectedFrameSummary
  readonly selectedCurveProperty: AnimatableProperty | null
  readonly selectedRefs: KeyframeRef[]
  readonly selectedRefIds: string[]
}

export function useDopesheetSelectionMeta(
  options: () => UseDopesheetSelectionMetaOptions,
): UseDopesheetSelectionMetaReturn {
  const sheetRowsStructure = $derived(options().sheetRowsStructure)
  const selectedKeyframeIds = $derived(options().selectedKeyframeIds)
  const currentFrame = $derived(options().currentFrame)
  const globalFrame = $derived(options().globalFrame)
  const isPropertyLocked = $derived(options().isPropertyLocked)
  const itemId = $derived(options().itemId)

  const keyframeMetaById = $derived.by(() => {
    const map = new Map<string, KeyframeMeta>()
    for (const row of sheetRowsStructure) {
      for (const keyframe of row.keyframes) {
        map.set(keyframe.id, { property: row.property, keyframe })
      }
    }
    return map
  })

  // Handlers read the latest map through the box, without tracking it.
  const keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>> = {
    get current() {
      return keyframeMetaById
    },
    set current(_value) {},
  }

  const selectedFrameSummary = $derived(
    buildSelectedFrameSummary(
      collectSelectedFrames(selectedKeyframeIds, keyframeMetaById),
      globalFrame,
      currentFrame,
    ),
  )
  const selectedCurveProperty = $derived.by(() => {
    let property: AnimatableProperty | null = null

    for (const keyframeId of selectedKeyframeIds) {
      const meta = keyframeMetaById.get(keyframeId)
      if (!meta) {
        continue
      }

      if (property === null) {
        property = meta.property
        continue
      }

      if (property !== meta.property) {
        return null
      }
    }

    return property
  })
  const selectedRefs = $derived.by(() => {
    const refs: KeyframeRef[] = []
    for (const keyframeId of selectedKeyframeIds) {
      const meta = keyframeMetaById.get(keyframeId)
      if (!meta) continue
      if (isPropertyLocked(meta.property)) continue
      refs.push({
        itemId,
        property: meta.property,
        keyframeId,
      })
    }
    return refs
  })
  const selectedRefIds = $derived(selectedRefs.map((ref) => ref.keyframeId))

  return {
    get keyframeMetaById() {
      return keyframeMetaById
    },
    keyframeMetaByIdRef,
    get selectedFrameSummary() {
      return selectedFrameSummary
    },
    get selectedCurveProperty() {
      return selectedCurveProperty
    },
    get selectedRefs() {
      return selectedRefs
    },
    get selectedRefIds() {
      return selectedRefIds
    },
  }
}
