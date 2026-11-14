// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { select } from '$lib/store.svelte'
import { usePlaybackStore } from '@/shared/state/playback'

interface UseThrottledFrameOptions {
  updateDuringPlayback?: boolean
  updateDuringScrub?: boolean
  throttleMs?: number
}

/** The current frame, for property panels that show animated values. */
export function useThrottledFrame(options: () => UseThrottledFrameOptions = () => ({})): {
  readonly current: number
} {
  void options
  return select(usePlaybackStore, (s) => s.currentFrame)
}
