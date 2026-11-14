// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { gifFrameCache, type CachedGifFrames } from '@/features/timeline/services/gif-frame-cache'

interface UseGifFramesOptions {
  /** Media ID from the timeline item */
  mediaId: string
  /** Blob URL for the GIF file */
  blobUrl: string | null
  /** Whether the clip is currently visible in viewport */
  isVisible: boolean
  /** Whether to enable GIF frames (allows conditional disabling) */
  enabled?: boolean
  /** Image format — determines extraction method ('gif' = gifuct-js, 'webp' = ImageDecoder) */
  format?: 'gif' | 'webp'
}

interface UseGifFramesResult {
  /** Array of ImageBitmap frames (null if loading or not available) */
  readonly frames: ImageBitmap[] | null
  /** Frame durations in milliseconds */
  readonly durations: number[] | null
  /** Total animation duration in milliseconds */
  readonly totalDuration: number | null
  /** Whether GIF frames are currently loading */
  readonly isLoading: boolean
  /** Whether all frames have been extracted */
  readonly isComplete: boolean
  /** Loading progress (0-100) */
  readonly progress: number
  /** Error message if extraction failed */
  readonly error: string | null
  /** Get frame at specific time (ms) - O(1) via binary search */
  getFrameAtTime: (timeMs: number) => ImageBitmap | null
}

/**
 * Hook for managing pre-extracted GIF frames for a clip
 *
 * - Pre-extracts all frames using gifuct-js
 * - O(1) frame lookup via binary search on cumulative delays
 * - Caches results in memory + IndexedDB for reuse
 * - Progressive loading: updates as frames become available
 */
export function useGifFrames(options: () => UseGifFramesOptions): UseGifFramesResult {
  const mediaId = $derived(options().mediaId)
  const blobUrl = $derived(options().blobUrl)
  const isVisible = $derived(options().isVisible)
  const enabled = $derived(options().enabled ?? true)
  const format = $derived(options().format ?? 'gif')

  // State for GIF frame data
  let gifData = $state.raw<CachedGifFrames | null>(null)
  let isLoading = $state(false)
  let progress = $state(0)
  let error = $state<string | null>(null)

  // Ref to track if extraction is in progress
  const isExtractingRef = { current: false }

  const onProgress = (p: number) => {
    progress = p
  }

  // Subscribe to progressive updates
  $effect(() => {
    void [mediaId, enabled, blobUrl]
    return untrack(() => {
      if (!enabled || !blobUrl) {
        return
      }

      // Subscribe to GIF frame updates for progressive loading
      return gifFrameCache.subscribe(mediaId, (updated) => {
        gifData = updated
        if (updated.isComplete) {
          isLoading = false
          progress = 100
        }
      })
    })
  })

  const gifDataIsComplete = $derived(gifData?.isComplete)

  // Load GIF frames when visible and conditions are met
  $effect(() => {
    void [mediaId, blobUrl, isVisible, enabled, format, gifDataIsComplete]
    untrack(() => {
      // Skip if not enabled or missing required data
      if (!enabled || !blobUrl) {
        return
      }

      // Skip if not visible and not already extracting
      if (!isVisible && !isExtractingRef.current) {
        return
      }

      // Skip if already have complete data
      if (gifData?.isComplete) {
        return
      }

      // Mark as extracting
      isExtractingRef.current = true
      isLoading = true
      progress = 0
      error = null

      // Request frames from cache (which will extract if needed)
      const framePromise =
        format === 'webp'
          ? gifFrameCache.getWebpFrames(mediaId, blobUrl, onProgress)
          : gifFrameCache.getGifFrames(mediaId, blobUrl, onProgress)

      framePromise
        .then((result) => {
          gifData = result
          isLoading = false
          progress = 100
        })
        .catch((err) => {
          // Don't set error for aborted requests
          if (err.message !== 'Aborted') {
            error = err.message || 'Failed to extract GIF frames'
          }
          isLoading = false
        })
        .finally(() => {
          isExtractingRef.current = false
        })

      // Don't abort on effect re-runs - let extraction continue in background
    })
  })

  const getFrameAtTime = (timeMs: number): ImageBitmap | null => {
    const data = gifData
    if (!data || !data.frames || data.frames.length === 0) {
      return null
    }
    try {
      return gifFrameCache.getFrameAtTime(data, timeMs).frame
    } catch {
      return null
    }
  }

  return {
    get frames() {
      return gifData?.frames ?? null
    },
    get durations() {
      return gifData?.durations ?? null
    },
    get totalDuration() {
      return gifData?.totalDuration ?? null
    },
    get isLoading() {
      return isLoading
    },
    get isComplete() {
      return gifData?.isComplete ?? false
    },
    get progress() {
      return progress
    },
    get error() {
      return error
    },
    getFrameAtTime,
  }
}
