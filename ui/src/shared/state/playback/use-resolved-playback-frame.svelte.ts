// SPDX-License-Identifier: MIT

import { createSubscriber } from 'svelte/reactivity'
import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { getResolvedPlaybackFrame } from '@/shared/state/playback/frame-resolution'

function getResolvedPlaybackFrameSnapshot(): number {
  const playback = usePlaybackStore.getState()
  if (playback.compositionVisualFrozen) return playback.currentFrame
  return getResolvedPlaybackFrame({
    currentFrame: playback.currentFrame,
    previewFrame: playback.previewFrame,
    displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
    isPlaying: playback.isPlaying,
    currentFrameEpoch: playback.currentFrameEpoch,
    previewFrameEpoch: playback.previewFrameEpoch,
  })
}

/**
 * Subscribe to the resolved visible frame as one scalar snapshot. Requested
 * scrub frames do not re-render gizmos while the fast overlay is still
 * presenting an older `displayedFrame`. Readers re-run only when the resolved
 * frame itself changes.
 */
export function useResolvedPlaybackFrame(enabled: () => boolean = () => true): {
  readonly current: number
} {
  let last = getResolvedPlaybackFrameSnapshot()
  const track = createSubscriber((update) => {
    last = getResolvedPlaybackFrameSnapshot()
    const onStoreChange = () => {
      const next = getResolvedPlaybackFrameSnapshot()
      if (next !== last) {
        last = next
        update()
      }
    }
    const unsubscribePlayback = usePlaybackStore.subscribe(onStoreChange)
    const unsubscribePreviewBridge = usePreviewBridgeStore.subscribe(onStoreChange)
    return () => {
      unsubscribePlayback()
      unsubscribePreviewBridge()
    }
  })

  return {
    get current() {
      if (!enabled()) return 0
      track()
      // Outside an effect nothing keeps `last` fresh, so read through.
      return $effect.tracking() ? last : getResolvedPlaybackFrameSnapshot()
    },
  }
}
