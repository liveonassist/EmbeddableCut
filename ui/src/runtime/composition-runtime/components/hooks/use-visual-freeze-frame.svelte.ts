// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select } from '$lib/store.svelte'
import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'

/**
 * Returns the frame the DOM composition tree should use for *visual* derivation
 * (transforms, masks, text layout, fades).
 *
 * During overlay playback the GPU fast-scrub overlay composites the actual
 * frames on top of the (now occluded) DOM composition. Re-deriving per-item
 * visual styles on every clock tick is wasted work behind the overlay, so while
 * `compositionVisualFrozen` is set we hold the last frame seen before the freeze
 * began. Callers must derive their visual values from the returned value, so a
 * frozen frame keeps those derivations cached.
 *
 * Mount/visibility and video element sync intentionally keep reading the live
 * sequence frame elsewhere — only the occluded visual styling is frozen here.
 *
 * On unfreeze (playback stop), the held value snaps back to the live frame and
 * the visual derivations recompute once to land on the exact paused frame.
 */
export function useVisualFreezeFrame(liveFrame: () => number): { readonly current: number } {
  const frozen = select(usePlaybackStore, (s) => s.compositionVisualFrozen)
  let heldFrame = untrack(liveFrame)
  const frame = $derived.by(() => {
    const live = liveFrame()
    // Track the live frame whenever we're not frozen so the freeze always
    // starts from the most recent frame.
    if (!frozen.current) {
      heldFrame = live
      return live
    }
    return heldFrame
  })
  return {
    get current() {
      return frame
    },
  }
}
