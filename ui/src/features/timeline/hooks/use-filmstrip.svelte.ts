// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { shallow } from '$lib/store.svelte'
import {
  filmstripCache,
  type Filmstrip,
  type FilmstripFrame,
} from '@/features/timeline/services/filmstrip-cache'
import {
  getPreviewStartupDelayMs,
  PREVIEW_IMMEDIATE_IDLE_TIMEOUT_MS,
  schedulePreviewWork,
} from '@/features/timeline/hooks/preview-work-budget'

export type { FilmstripFrame }

interface UseFilmstripOptions {
  /** Media ID from the timeline item */
  mediaId: string
  /** Blob URL for the video file */
  blobUrl: string | null
  /** Total source duration in seconds */
  duration: number
  /** Whether the clip is currently visible in viewport */
  isVisible: boolean
  /** Whether to enable filmstrip (allows conditional disabling) */
  enabled?: boolean
  /** Source window to prioritize for extraction (seconds) */
  priorityWindow?: { startTime: number; endTime: number } | null
  /** Approximate number of frames needed for the current viewport */
  targetFrameCount?: number
  /** Exact 1fps frame indices needed for the current viewport */
  targetFrameIndices?: number[]
}

interface UseFilmstripResult {
  /** Array of frames with URLs for img src */
  readonly frames: FilmstripFrame[] | null
  /** Whether filmstrip is currently loading/extracting */
  readonly isLoading: boolean
  /** Whether extraction is complete */
  readonly isComplete: boolean
  /** Loading progress (0-100) */
  readonly progress: number
  /** Error message if generation failed */
  readonly error: string | null
}

/**
 * Hook for managing filmstrip thumbnails for a video clip
 *
 * Returns object URLs for use in <img src> tags.
 * Progressive loading: updates as frames are extracted.
 * Startup is deferred to idle/interaction budget so timeline creation stays responsive.
 *
 * Each effect reads exactly the dependencies FreeCut's effect lists, then runs
 * its body untracked.
 */
export function useFilmstrip(options: () => UseFilmstripOptions): UseFilmstripResult {
  const mediaId = $derived(options().mediaId)
  const blobUrl = $derived(options().blobUrl)
  const duration = $derived(options().duration)
  const isVisible = $derived(options().isVisible)
  const enabled = $derived(options().enabled ?? true)
  const priorityWindow = $derived(options().priorityWindow ?? null)
  const targetFrameCount = $derived(options().targetFrameCount)
  const targetFrameIndices = $derived(options().targetFrameIndices)

  const initialMediaId = untrack(() => mediaId)
  const initialCached = filmstripCache.getFromCacheSync(initialMediaId)

  // Initialize from cache to avoid flash on remount
  let filmstrip = $state.raw<Filmstrip | null>(initialCached)
  let isLoading = $state(false)
  let progress = $state(initialCached?.isComplete ? 100 : (initialCached?.progress ?? 0))
  let error = $state<string | null>(null)

  const isGeneratingRef = { current: false }
  const ownsGenerationRef = { current: false }
  const hasPendingStartRef = { current: false }
  const lastMediaIdRef = { current: initialMediaId }

  // Reset state when mediaId changes (e.g., after relinking orphaned clip)
  $effect(() => {
    void mediaId
    untrack(() => {
      if (lastMediaIdRef.current !== mediaId) {
        lastMediaIdRef.current = mediaId
        isGeneratingRef.current = false
        ownsGenerationRef.current = false
        hasPendingStartRef.current = false
        const cached = filmstripCache.getFromCacheSync(mediaId)
        filmstrip = cached
        isLoading = false
        progress = cached?.isComplete ? 100 : (cached?.progress ?? 0)
        error = null
      }
    })
  })

  const onProgress = (nextProgress: number) => {
    progress = nextProgress
  }

  // Abort any in-flight extraction when this consumer goes away or switches media.
  $effect(() => {
    const currentMediaId = mediaId
    return () => {
      if (ownsGenerationRef.current) {
        filmstripCache.abort(currentMediaId)
      }
    }
  })

  // Filmstrip extraction runs at 1fps, so quantize the requested source
  // window to frame indices before passing it to the cache.
  // The range and indices below keep their last value while it's unchanged: the
  // windows they come from move on every scroll tick, and the load effect keyed
  // on them would otherwise re-run, postponing extraction while the user scrolls.
  let lastPriorityRange: { startIndex: number; endIndex: number } | null = null
  const priorityRange = $derived.by(() => {
    if (!priorityWindow) return null

    const startIndex = Math.max(0, Math.floor(priorityWindow.startTime))
    const endIndex = Math.max(startIndex + 1, Math.ceil(priorityWindow.endTime))
    const next = { startIndex, endIndex }
    if (!shallow(next, lastPriorityRange)) lastPriorityRange = next
    return lastPriorityRange
  })

  const normalizedTargetFrameCount = $derived.by(() => {
    if (
      typeof targetFrameCount !== 'number' ||
      !Number.isFinite(targetFrameCount) ||
      targetFrameCount <= 0
    ) {
      return undefined
    }
    return Math.max(1, Math.ceil(targetFrameCount))
  })

  let lastTargetFrameIndices: number[] | undefined
  const normalizedTargetFrameIndices = $derived.by(() => {
    if (!Array.isArray(targetFrameIndices) || targetFrameIndices.length === 0) {
      return undefined
    }

    const indices = new Set<number>()
    for (const index of targetFrameIndices) {
      if (typeof index !== 'number' || !Number.isFinite(index)) {
        continue
      }
      indices.add(Math.max(0, Math.round(index)))
    }

    const normalized = Array.from(indices).sort((a, b) => a - b)
    if (normalized.length === 0) return undefined
    if (!shallow(normalized, lastTargetFrameIndices)) lastTargetFrameIndices = normalized
    return lastTargetFrameIndices
  })

  // Subscribe to progressive updates. Intentionally does not require blobUrl —
  // cached filmstrip frames live on disk and can be displayed before the source
  // video blob URL resolves.
  $effect(() => {
    void [mediaId, enabled, duration]
    return untrack(() => {
      if (!enabled || !duration || duration <= 0) {
        return
      }

      return filmstripCache.subscribe(mediaId, (updated) => {
        filmstrip = updated
        progress = updated.progress
        isLoading = updated.isExtracting
      })
    })
  })

  // Hydrate from persisted storage as soon as we know the clip exists — does
  // not wait for the source blob URL or for visibility. Disk reads are cheap
  // and parallel, so prefetching off-viewport clips lets them paint instantly
  // when scrolled into view. The extraction effect below still no-ops when it
  // finds a complete cache.
  const hasInMemoryFrames = $derived((filmstrip?.frames?.length ?? 0) > 0)
  const filmstripIsComplete = $derived(filmstrip?.isComplete)
  const filmstripFrameCount = $derived(filmstrip?.frames?.length)
  $effect(() => {
    void [mediaId, enabled, duration, filmstripIsComplete, hasInMemoryFrames]
    untrack(() => {
      if (!enabled || !duration || duration <= 0) return
      if (filmstrip?.isComplete) return
      // Frames already live in the (singleton) in-memory cache, so re-reading
      // every tile from disk on remount would only re-mint identical object URLs
      // and thrash OPFS — which is exactly what happens while scrolling an
      // incomplete (long-video) filmstrip in and out of view. The live extraction
      // path keeps the in-memory cache current via notifyUpdate, and a fully
      // evicted entry resets this to 0 (so a genuine reload still runs), so
      // skipping here is safe.
      if (hasInMemoryFrames) return

      void filmstripCache.loadFromDisk(mediaId, duration).catch(() => {
        // Swallow: extraction path below is the fallback once blobUrl arrives.
      })
    })
  })

  // Once a clip leaves the active workset, stop spending background decode time on it.
  $effect(() => {
    void [mediaId, enabled, blobUrl, duration, isVisible]
    untrack(() => {
      if (enabled && blobUrl && duration > 0 && isVisible) {
        return
      }

      if (ownsGenerationRef.current) {
        filmstripCache.abort(mediaId)
        ownsGenerationRef.current = false
      }
      isGeneratingRef.current = false
      hasPendingStartRef.current = false
      isLoading = false
    })
  })

  // Load filmstrip when visible
  $effect(() => {
    void [
      mediaId,
      blobUrl,
      duration,
      isVisible,
      enabled,
      filmstripFrameCount,
      filmstripIsComplete,
      priorityRange,
      normalizedTargetFrameCount,
      normalizedTargetFrameIndices,
    ]
    return untrack(() => {
      if (!enabled || !blobUrl || !duration || duration <= 0) {
        return
      }

      if (!isVisible && !isGeneratingRef.current && !hasPendingStartRef.current) {
        return
      }

      const needsPriorityRefinement = filmstripCache.needsPriorityRefinement(
        mediaId,
        duration,
        priorityRange,
        normalizedTargetFrameCount,
        normalizedTargetFrameIndices,
      )

      if (filmstrip?.isComplete && !needsPriorityRefinement) {
        return
      }

      if (isGeneratingRef.current || hasPendingStartRef.current) {
        return
      }

      hasPendingStartRef.current = true
      isLoading = true
      error = null

      let cancelled = false
      const requestMediaId = mediaId
      const requestBlobUrl = blobUrl
      const requestDuration = duration
      const requestPriorityRange = priorityRange
      const requestTargets = {
        targetFrameCount: normalizedTargetFrameCount,
        targetFrameIndices: normalizedTargetFrameIndices,
      }
      const shouldStartImmediately = !filmstrip?.frames?.length
      const cancelScheduledStart = schedulePreviewWork(
        () => {
          if (cancelled || lastMediaIdRef.current !== requestMediaId) {
            hasPendingStartRef.current = false
            return
          }

          hasPendingStartRef.current = false
          isGeneratingRef.current = true
          ownsGenerationRef.current = !filmstripCache.hasPendingExtraction(requestMediaId)

          filmstripCache
            .getFilmstrip(
              requestMediaId,
              requestBlobUrl,
              requestDuration,
              onProgress,
              requestPriorityRange ?? undefined,
              requestTargets,
            )
            .then((result) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              filmstrip = result
              progress = result.progress
              isLoading = result.isExtracting
            })
            .catch((err) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              if (err.message !== 'Aborted') {
                error = err.message || 'Failed to generate filmstrip'
              }
              isLoading = false
            })
            .finally(() => {
              if (lastMediaIdRef.current === requestMediaId) {
                isGeneratingRef.current = false
                ownsGenerationRef.current = false
                hasPendingStartRef.current = false
              }
            })
        },
        {
          delayMs: shouldStartImmediately ? 0 : getPreviewStartupDelayMs(requestDuration),
          // Cold-start (no frames yet): don't let extraction sit waiting for an
          // idle slot for over a second. After this window, fire anyway.
          idleTimeoutMs: shouldStartImmediately ? PREVIEW_IMMEDIATE_IDLE_TIMEOUT_MS : undefined,
          ignoreAudioStartupHold: true,
        },
      )

      return () => {
        cancelled = true
        if (!isGeneratingRef.current) {
          hasPendingStartRef.current = false
        }
        cancelScheduledStart()
      }
    })
  })

  return {
    get frames() {
      return filmstrip?.frames || null
    },
    get isLoading() {
      return isLoading || (filmstrip?.isExtracting ?? false)
    },
    get isComplete() {
      return filmstrip?.isComplete ?? false
    },
    get progress() {
      return progress
    },
    get error() {
      return error
    },
  }
}
