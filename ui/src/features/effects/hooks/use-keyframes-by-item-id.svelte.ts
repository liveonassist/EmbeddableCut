// SPDX-License-Identifier: MIT

import { select, shallow } from '$lib/store.svelte'
import { useKeyframesStore } from '@/features/effects/deps/timeline-contract'
import type { ItemKeyframes } from '@/types/keyframe'

export function useKeyframesByItemId(itemIds: () => string[]): {
  readonly current: Map<string, ItemKeyframes | null>
} {
  const keyframes = $derived(
    select(
      useKeyframesStore,
      (state) =>
        new Map<string, ItemKeyframes | null>(
          itemIds().map((itemId) => [itemId, state.keyframesByItemId[itemId] ?? null]),
        ),
      shallow,
    ),
  )
  return {
    get current() {
      return keyframes.current
    },
  }
}
