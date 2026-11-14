// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import {
  waveformCache,
  type CachedWaveform,
  type CachedWaveformLevel,
} from '@/features/timeline/services/waveform-cache'
import { chooseDisplayLevelForZoom } from '@/features/timeline/services/waveform-opfs-storage'
import {
  getPreviewStartupDelayMs,
  schedulePreviewWork,
} from '@/features/timeline/hooks/preview-work-budget'
import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('useWaveform')
const RANGE_FIRST_MIN_DURATION_SEC = 5 * 60

interface UseWaveformOptions {
  /** Media ID from the timeline item */
  mediaId: string
  /** Blob URL for the audio file */
  blobUrl: string | null
  /** Whether the clip is currently visible in viewport */
  isVisible: boolean
  /** Whether to enable waveform (allows conditional disabling) */
  enabled?: boolean
  /** Source/media duration used to size the deferred startup budget */
  deferDurationSec?: number
  /**
   * Current timeline zoom (pixels/sec). Selects which downsampled resolution
   * level to render so memory stays bounded regardless of clip length. Omit to
   * render the full-resolution peaks (legacy behavior).
   */
  pixelsPerSecond?: number
  /** Visible source window in seconds, used for range-first generation. */
  visibleSourceStartSec?: number
  visibleSourceEndSec?: number
}

interface UseWaveformResult {
  /** Peak amplitude data (raw mono or stereo-interleaved waveform) */
  readonly peaks: Float32Array | null
  /** Audio duration in seconds */
  readonly duration: number
  /** Samples per second in peaks data */
  readonly sampleRate: number
  /** Number of audio channels */
  readonly channels: number
  /** Whether peak data is stereo interleaved [L0, R0, L1, R1, ...] */
  readonly stereo: boolean
  /** Highest peak observed so far */
  readonly maxPeak: number
  /** Number of decoded peak entries available so far */
  readonly loadedSamples: number
  /** Whether waveform is currently loading */
  readonly isLoading: boolean
  /** Loading progress (0-100) */
  readonly progress: number
  /** Error message if generation failed */
  readonly error: string | null
}

/**
 * Hook for managing waveform data for an audio clip.
 *
 * Rendering source priority:
 * 1. A zoom-appropriate downsampled level from the persisted OPFS
 *    multi-resolution file (small, bounded memory) — preferred when available.
 * 2. The full-resolution peaks (memory cache → IndexedDB/OPFS → worker
 *    generation) — used while a waveform is still being generated, or for media
 *    that has no persisted multi-resolution file yet.
 *
 * Loading a level instead of the full-res peaks keeps only a fraction of the
 * data resident when zoomed out, so a long clip no longer pins tens of MB in
 * memory — and a clip that remounts (e.g. dragged to another track) renders
 * from the synchronously-cached level without a skeleton flash.
 *
 * Each effect reads exactly the dependencies FreeCut's effect lists, then runs
 * its body untracked.
 */
export function useWaveform(options: () => UseWaveformOptions): UseWaveformResult {
  const mediaId = $derived(options().mediaId)
  const blobUrl = $derived(options().blobUrl)
  const isVisible = $derived(options().isVisible)
  const enabled = $derived(options().enabled ?? true)
  const deferDurationSec = $derived(options().deferDurationSec ?? 0)
  const pixelsPerSecond = $derived(options().pixelsPerSecond)
  const visibleSourceStartSec = $derived(options().visibleSourceStartSec)
  const visibleSourceEndSec = $derived(options().visibleSourceEndSec)

  // Which downsampled level the current zoom wants. When pixelsPerSecond is
  // omitted, force the full-res path by treating the level as unavailable.
  const useLevels = $derived(pixelsPerSecond !== undefined)
  const levelIndex = $derived(chooseDisplayLevelForZoom(pixelsPerSecond ?? 0))

  const initialMediaId = untrack(() => mediaId)
  const initialLevel = untrack(() =>
    useLevels && enabled ? waveformCache.getDisplayLevelSync(mediaId, levelIndex) : null,
  )

  // Preferred display source: a single downsampled level. Seeded synchronously
  // so a remount with an already-loaded level shows no skeleton.
  let displayLevel = $state.raw<CachedWaveformLevel | null>(initialLevel)
  // Whether we've checked OPFS for a persisted level for the current media.
  // Generation is gated on this so we never regenerate a clip that already has
  // a persisted multi-resolution file.
  let levelProbed = $state(untrack(() => !useLevels || (enabled && initialLevel !== null)))

  // Full-resolution fallback state (generation + progressive streaming).
  let waveform = $state.raw<CachedWaveform | null>(
    waveformCache.getFromMemoryCacheSync(initialMediaId),
  )
  let isLoading = $state(false)
  let progress = $state(waveformCache.getFromMemoryCacheSync(initialMediaId)?.isComplete ? 100 : 0)
  let error = $state<string | null>(null)

  // Refs to avoid duplicate starts when visibility/layout churns.
  const isGeneratingRef = { current: false }
  const ownsGenerationRef = { current: false }
  const hasPendingStartRef = { current: false }
  const rangeRequestKeyRef = { current: null } as { current: string | null }
  const lastMediaIdRef = { current: initialMediaId }

  // Reset state when mediaId changes (e.g., after relinking orphaned clip)
  $effect(() => {
    void [mediaId, useLevels, enabled, levelIndex]
    untrack(() => {
      if (lastMediaIdRef.current !== mediaId) {
        lastMediaIdRef.current = mediaId
        isGeneratingRef.current = false
        ownsGenerationRef.current = false
        hasPendingStartRef.current = false
        rangeRequestKeyRef.current = null
        waveform = waveformCache.getFromMemoryCacheSync(mediaId)
        isLoading = false
        progress = waveformCache.getFromMemoryCacheSync(mediaId)?.isComplete ? 100 : 0
        error = null
        const seededLevel =
          useLevels && enabled ? waveformCache.getDisplayLevelSync(mediaId, levelIndex) : null
        displayLevel = seededLevel
        levelProbed = !useLevels || seededLevel !== null
      }
    })
  })

  // Load the zoom-appropriate display level. Re-runs when the level changes
  // (zoom crossing a resolution threshold). The previous level stays visible
  // until the new one loads, so zooming never flashes a skeleton.
  $effect(() => {
    void [mediaId, levelIndex, isVisible, enabled, useLevels]
    return untrack(() => {
      if (!useLevels || !enabled || !isVisible) {
        return
      }

      const sync = waveformCache.getDisplayLevelSync(mediaId, levelIndex)
      if (sync) {
        displayLevel = sync
        levelProbed = true
        return
      }

      let cancelled = false
      const requestMediaId = mediaId
      waveformCache
        .getDisplayLevel(requestMediaId, levelIndex)
        .then((level) => {
          if (cancelled || lastMediaIdRef.current !== requestMediaId) return
          // A null result means this zoom's level isn't persisted: clear any
          // previously-shown (now stale) level so `needsFullRes` flips true and
          // the full-resolution generation path takes over. Leaving a stale
          // coarser level in place would keep `needsFullRes` false forever and
          // permanently strand the clip on the wrong level's peaks.
          displayLevel = level
          levelProbed = true
        })
        .catch((err) => {
          if (cancelled || lastMediaIdRef.current !== requestMediaId) return
          logger.warn(`Failed to load waveform display level for ${requestMediaId}`, err)
          levelProbed = true
        })

      return () => {
        cancelled = true
      }
    })
  })

  const onProgress = (nextProgress: number) => {
    progress = nextProgress
  }

  // Subscribe to progressive updates and storage hydration. This intentionally
  // does not require blobUrl: persisted waveforms can hydrate before the media
  // source is resolved.
  $effect(() => {
    void [mediaId, enabled]
    return untrack(() => {
      if (!enabled) {
        return
      }

      return waveformCache.subscribe(mediaId, (updated) => {
        waveform = updated
        if (updated.isComplete) {
          isLoading = false
          progress = 100
        }
      })
    })
  })

  // Generate the full-resolution waveform — only when no persisted display
  // level exists (levelProbed && !displayLevel) or when levels are disabled.
  // A clip with a persisted multi-resolution file renders from its level and
  // never reaches this path, so its full-res peaks stay off the heap.
  const needsFullRes = $derived(!useLevels || (levelProbed && !displayLevel))
  const canUseVisibleRange = $derived(
    useLevels &&
      enabled &&
      isVisible &&
      !!blobUrl &&
      needsFullRes &&
      deferDurationSec >= RANGE_FIRST_MIN_DURATION_SEC &&
      typeof visibleSourceStartSec === 'number' &&
      typeof visibleSourceEndSec === 'number' &&
      Number.isFinite(visibleSourceStartSec) &&
      Number.isFinite(visibleSourceEndSec) &&
      visibleSourceEndSec > visibleSourceStartSec,
  )
  const waveformIsComplete = $derived(waveform?.isComplete)

  $effect(() => {
    void [
      mediaId,
      blobUrl,
      canUseVisibleRange,
      visibleSourceStartSec,
      visibleSourceEndSec,
      pixelsPerSecond,
      levelIndex,
      deferDurationSec,
      waveform,
    ]
    return untrack(() => {
      if (!canUseVisibleRange || !blobUrl) {
        return
      }

      if (waveform?.isComplete) {
        return
      }

      const requestStart = Math.max(0, visibleSourceStartSec as number)
      const requestEnd = Math.max(requestStart + 0.25, visibleSourceEndSec as number)
      const requestKey = `${mediaId}:${levelIndex}:${Math.floor(requestStart * 10)}:${Math.ceil(
        requestEnd * 10,
      )}`
      if (rangeRequestKeyRef.current === requestKey && waveform) {
        return
      }

      rangeRequestKeyRef.current = requestKey
      isLoading = true
      error = null

      let cancelled = false
      const requestMediaId = mediaId
      const requestBlobUrl = blobUrl
      const requestPixelsPerSecond = pixelsPerSecond ?? 0
      const cancelScheduledStart = schedulePreviewWork(
        () => {
          waveformCache
            .prepareVisibleWaveformRange(
              requestMediaId,
              requestBlobUrl,
              requestStart,
              requestEnd,
              requestPixelsPerSecond,
              onProgress,
            )
            .then((result) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              if (!result) {
                isLoading = false
                return
              }
              waveform = result
              isLoading = false
              progress = 100
            })
            .catch((err) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              logger.warn(`Visible waveform range failed for ${requestMediaId}`, err)
              error = err.message || 'Failed to generate waveform range'
              isLoading = false
            })
        },
        {
          delayMs: getPreviewStartupDelayMs(deferDurationSec),
        },
      )

      return () => {
        cancelled = true
        cancelScheduledStart()
      }
    })
  })

  $effect(() => {
    void [
      mediaId,
      blobUrl,
      isVisible,
      enabled,
      waveformIsComplete,
      deferDurationSec,
      needsFullRes,
      canUseVisibleRange,
    ]
    return untrack(() => {
      if (!enabled || !needsFullRes) {
        return
      }

      if (canUseVisibleRange) {
        return
      }

      if (isGeneratingRef.current || hasPendingStartRef.current) {
        return
      }

      if (!isVisible) {
        return
      }

      if (waveform?.isComplete) {
        return
      }

      hasPendingStartRef.current = true
      isLoading = true
      error = null

      let cancelled = false
      const requestMediaId = mediaId
      const requestBlobUrl = blobUrl
      const cancelScheduledStart = schedulePreviewWork(
        () => {
          if (cancelled || lastMediaIdRef.current !== requestMediaId) {
            hasPendingStartRef.current = false
            return
          }

          hasPendingStartRef.current = false
          isGeneratingRef.current = true
          ownsGenerationRef.current = false

          waveformCache
            .getCachedWaveform(requestMediaId)
            .then((result) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return null
              }
              if (result?.isComplete) {
                waveform = result
                isLoading = false
                progress = 100
                return null
              }
              if (result) {
                waveform = result
              }
              if (!requestBlobUrl) {
                isLoading = false
                progress = 0
                return null
              }

              progress = 0
              ownsGenerationRef.current = !waveformCache.hasPendingGeneration(requestMediaId)
              return waveformCache.getWaveform(requestMediaId, requestBlobUrl, onProgress)
            })
            .then((result) => {
              if (!result || cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              waveform = result
              isLoading = false
              progress = 100
            })
            .catch((err) => {
              if (cancelled || lastMediaIdRef.current !== requestMediaId) {
                return
              }
              if (err.message !== 'Aborted') {
                logger.warn(`Waveform generation failed for ${requestMediaId}`, err)
                error = err.message || 'Failed to generate waveform'
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
          delayMs: getPreviewStartupDelayMs(deferDurationSec),
        },
      )

      // Don't abort on effect re-runs - let generation continue in background.
      // The cache will hold the result for when we need it.
      return () => {
        cancelled = true
        if (!isGeneratingRef.current) {
          hasPendingStartRef.current = false
        }
        cancelScheduledStart()
      }
    })
  })

  // Cleanup on unmount
  $effect(() => {
    const currentMediaId = mediaId
    return () => {
      if (ownsGenerationRef.current) {
        waveformCache.abort(currentMediaId)
      }
    }
  })

  // Prefer the downsampled display level; fall back to full-resolution peaks
  // while generating or for media without a persisted multi-resolution file.
  // With no level yet, show full-res if present, otherwise report loading
  // until the OPFS probe (and any generation) resolves.
  const result = $derived.by((): UseWaveformResult => {
    if (displayLevel) {
      return {
        peaks: displayLevel.peaks,
        duration: displayLevel.duration,
        sampleRate: displayLevel.sampleRate,
        channels: displayLevel.channels,
        stereo: displayLevel.stereo,
        maxPeak: displayLevel.maxPeak,
        loadedSamples: displayLevel.loadedSamples,
        isLoading: false,
        progress: 100,
        error: null,
      }
    }

    const loadingUntilResolved = useLevels && !levelProbed && isVisible && enabled && !waveform
    return {
      peaks: waveform?.peaks ?? null,
      duration: waveform?.duration || 0,
      sampleRate: waveform?.sampleRate || 100,
      channels: waveform?.channels || 1,
      stereo: waveform?.stereo ?? false,
      maxPeak: waveform?.maxPeak ?? 1,
      loadedSamples: waveform?.loadedSamples ?? 0,
      isLoading: isLoading || loadingUntilResolved,
      progress,
      error,
    }
  })

  return {
    get peaks() {
      return result.peaks
    },
    get duration() {
      return result.duration
    },
    get sampleRate() {
      return result.sampleRate
    },
    get channels() {
      return result.channels
    },
    get stereo() {
      return result.stereo
    },
    get maxPeak() {
      return result.maxPeak
    },
    get loadedSamples() {
      return result.loadedSamples
    },
    get isLoading() {
      return result.isLoading
    },
    get progress() {
      return result.progress
    },
    get error() {
      return result.error
    },
  }
}
