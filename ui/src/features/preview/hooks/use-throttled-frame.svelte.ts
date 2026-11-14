// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { usePlaybackStore } from '@/shared/state/playback'

interface UseThrottledFrameOptions {
  updateDuringPlayback?: boolean
  updateDuringScrub?: boolean
  throttleMs?: number
}

/** The current frame, read through; the real hook throttles it during playback. */
export function useThrottledFrame(_options: () => UseThrottledFrameOptions = () => ({})): {
  readonly current: number
} {
  return {
    get current() {
      return usePlaybackStore.getState().currentFrame
    },
  }
}
