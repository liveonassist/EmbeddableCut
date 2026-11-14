// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { usePlaybackStore } from '@/shared/state/playback'

interface UseThrottledFrameOptions {
  updateDuringPlayback?: boolean
  updateDuringScrub?: boolean
  throttleMs?: number
}

/** The playhead frame, updated while paused (the preview port provides the throttled hook). */
export function useThrottledFrame(_options: () => UseThrottledFrameOptions = () => ({})): {
  readonly current: number
} {
  let frame = $state(usePlaybackStore.getState().currentFrame)
  $effect(() =>
    usePlaybackStore.subscribe((state) => {
      if (!state.isPlaying) frame = state.currentFrame
    }),
  )
  return {
    get current() {
      return frame
    },
  }
}
