// SPDX-License-Identifier: MIT

/**
 * Context for VideoSourcePool: provides the video source pool to components
 * that need to acquire/release video elements for playback.
 */

import { getContext, setContext } from 'svelte'
import type { VideoSourcePool } from '@/runtime/player/video/VideoSourcePool'
import { getGlobalVideoSourcePool } from '@/runtime/player/video/VideoSourcePool'

const VIDEO_SOURCE_POOL_KEY = Symbol('embeddablecut.video-source-pool')

export function setVideoSourcePool(pool: VideoSourcePool): void {
  setContext(VIDEO_SOURCE_POOL_KEY, pool)
}

/**
 * Access the VideoSourcePool from context.
 * Falls back to global pool if no provider is found.
 */
export function useVideoSourcePool(): VideoSourcePool {
  const contextPool = getContext<VideoSourcePool | undefined>(VIDEO_SOURCE_POOL_KEY)
  return contextPool ?? getGlobalVideoSourcePool()
}
