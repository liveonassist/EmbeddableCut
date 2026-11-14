// SPDX-License-Identifier: MIT

import { select, shallow } from '$lib/store.svelte'
import { useKeyframesStore } from '@/features/editor/deps/timeline-store'
import type { ItemKeyframes } from '@/types/keyframe'

/**
 * Subscribes to keyframes for `itemIds` and indexes them by item id.
 * Shared by the clip-panel sections (audio / fill / layout) so the store
 * subscription shape stays identical everywhere.
 */
export function useKeyframesByItemId(itemIds: () => string[]): {
  readonly current: Map<string, ItemKeyframes | null>
} {
  const itemKeyframes = $derived(
    select(
      useKeyframesStore,
      (s) => itemIds().map((itemId) => s.keyframesByItemId[itemId] ?? null),
      shallow,
    ),
  )
  const byItemId = $derived.by(() => {
    const ids = itemIds()
    const keyframes = itemKeyframes.current
    const map = new Map<string, ItemKeyframes | null>()
    for (const [index, itemId] of ids.entries()) {
      map.set(itemId, keyframes[index] ?? null)
    }
    return map
  })
  return {
    get current() {
      return byItemId
    },
  }
}
