<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('CompoundClipWaveform')
  const WAVEFORM_VERTICAL_PADDING_PX = 3
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import WaveformSkeleton from './waveform-skeleton.svelte'
  import VisibleWaveformCanvas from './visible-waveform-canvas.svelte'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import { resolveMediaUrl } from '@/features/timeline/deps/media-library-resolver'
  import type { SubComposition } from '@/features/timeline/stores/compositions-store'
  import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
  import { waveformCache, type CachedWaveform } from '@/features/timeline/services/waveform-cache'
  import { WAVEFORM_FILL_COLOR, WAVEFORM_STROKE_COLOR } from '@/features/timeline/constants'
  import { getCompositionOwnedAudioSources } from '@/features/timeline/utils/composition-clip-summary'
  import { mixCompoundClipWaveformPeaks } from '@/features/timeline/utils/compound-clip-waveform'
  import { computeWaveformRenderWindow } from './render-window'
  import { computeWaveformAmplitude } from './amplitude'
  import {
    getPreviewStartupDelayMs,
    schedulePreviewWork,
  } from '@/features/timeline/hooks/preview-work-budget'
  import { observeParentElementHeight } from '../measure-parent-height'
  import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { CLIP_VISIBILITY_PREFETCH_MARGIN_PX } from '../../hooks/use-clip-visibility.svelte'
  import { select } from '$lib/store.svelte'

  interface CompoundClipWaveformProps {
    composition: SubComposition
    clipWidth: number
    renderWidth?: number
    sourceStart: number
    sourceDuration: number
    isVisible: boolean
    visibleStartRatio?: number
    visibleEndRatio?: number
  }

  let {
    composition,
    clipWidth,
    renderWidth,
    sourceStart,
    sourceDuration,
    isVisible,
    visibleStartRatio = 0,
    visibleEndRatio = 1,
  }: CompoundClipWaveformProps = $props()

  let container = $state<HTMLDivElement | null>(null)
  let requestToken = 0
  let amplitudesBuffer = new Float32Array(0)
  let height = $state(0)
  const viewportWidth = select(useTimelineViewportStore, (state) => state.viewportWidth)
  let waveformsByMediaId = $state.raw<Map<string, CachedWaveform>>(new Map())
  let isLoading = $state(false)
  let hasError = $state(false)
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)
  const compositionById = select(useCompositionsStore, (s) => s.compositionById)

  $effect(() => {
    return untrack(() => observeParentElementHeight(container, (next) => (height = next)))
  })

  const mediaFpsById = $derived.by<Record<string, number | undefined>>(() => {
    const byId: Record<string, number | undefined> = {}
    for (const [mediaId, media] of Object.entries(mediaById.current)) {
      byId[mediaId] = media?.fps
    }
    return byId
  })

  // One derived per input, so the owned sources (and the load effect keyed on
  // them) recompute only on the fields React's useMemo listed, not on every
  // new composition object.
  const compositionItems = $derived(composition.items)
  const compositionTracks = $derived(composition.tracks)
  const compositionFps = $derived(composition.fps)
  const compositionDurationInFrames = $derived(composition.durationInFrames)
  const trackedIsVisible = $derived(isVisible)
  const trackedSourceDuration = $derived(sourceDuration)

  const ownedAudioSources = $derived(
    getCompositionOwnedAudioSources({
      items: compositionItems,
      tracks: compositionTracks,
      fps: compositionFps,
      mediaFpsById,
      compositionById: compositionById.current,
    }),
  )
  const mediaIds = $derived(
    Array.from(new Set(ownedAudioSources.map((source) => source.mediaId))).sort(),
  )
  const mediaIdsKey = $derived(mediaIds.join('|'))
  const visibleClipWidth = $derived(clipWidth)
  const settledRenderClipWidth = $derived(
    Math.max(visibleClipWidth, renderWidth ?? visibleClipWidth),
  )
  const maxWaveformWindowWidth = $derived(
    viewportWidth.current > 0
      ? viewportWidth.current + CLIP_VISIBILITY_PREFETCH_MARGIN_PX * 2
      : undefined,
  )
  const settledRenderWindow = $derived(
    computeWaveformRenderWindow({
      renderWidth: settledRenderClipWidth,
      visibleWidth: visibleClipWidth,
      visibleStartRatio,
      visibleEndRatio,
      maxWindowWidth: maxWaveformWindowWidth,
    }),
  )

  $effect(() => {
    const visible = trackedIsVisible
    const ids = mediaIds
    void mediaIdsKey
    const duration = trackedSourceDuration

    return untrack(() => {
      requestToken += 1
      const currentRequestToken = requestToken

      if (!visible || ids.length === 0) {
        waveformsByMediaId = new Map()
        isLoading = false
        hasError = false
        return
      }

      const cachedEntries = ids.flatMap((mediaId) => {
        const cached = waveformCache.getFromMemoryCacheSync(mediaId)
        return cached ? [[mediaId, cached] as const] : []
      })
      const cachedMap = new Map<string, CachedWaveform>(cachedEntries)
      waveformsByMediaId = cachedMap

      const missingIds = ids.filter((mediaId) => !cachedMap.has(mediaId))
      if (missingIds.length === 0) {
        isLoading = false
        hasError = false
        return
      }

      let cancelled = false
      isLoading = true
      hasError = false

      const cancelScheduledStart = schedulePreviewWork(
        () => {
          void Promise.allSettled(
            missingIds.map(async (mediaId) => {
              const blobUrl = await resolveMediaUrl(mediaId)
              if (!blobUrl) {
                throw new Error(`Missing blob URL for ${mediaId}`)
              }
              const waveform = await waveformCache.getWaveform(mediaId, blobUrl)
              return [mediaId, waveform] as const
            }),
          ).then((results) => {
            if (cancelled || currentRequestToken !== requestToken) {
              return
            }

            const resolved = new Map(cachedMap)
            let hadFailure = false
            for (const result of results) {
              if (result.status === 'fulfilled') {
                resolved.set(result.value[0], result.value[1])
              } else {
                hadFailure = true
                logger.warn('Failed to load compound waveform source', result.reason)
              }
            }

            waveformsByMediaId = resolved
            hasError = hadFailure && resolved.size === 0
            isLoading = false
          })
        },
        {
          delayMs: getPreviewStartupDelayMs(duration),
        },
      )

      return () => {
        cancelled = true
        cancelScheduledStart()
      }
    })
  })

  const mixedWaveform = $derived.by(() => {
    if (ownedAudioSources.length === 0 || waveformsByMediaId.size === 0) {
      return null
    }

    return mixCompoundClipWaveformPeaks({
      sources: ownedAudioSources,
      waveformsByMediaId,
      durationInFrames: compositionDurationInFrames,
      fps: compositionFps,
    })
  })

  const peaks = $derived(mixedWaveform?.peaks ?? null)
  const sampleRate = $derived(mixedWaveform?.sampleRate ?? 0)
  const normalizationPeak = $derived.by(() => {
    if (!peaks || peaks.length === 0) return 1
    let maxPeak = 0
    for (let i = 0; i < peaks.length; i += 1) {
      const value = peaks[i] ?? 0
      if (value > maxPeak) {
        maxPeak = value
      }
    }
    return maxPeak > 0 ? maxPeak : 1
  })

  // Rebuilt only when its inputs change: its identity is part of the canvas
  // redraw check.
  const drawSourceStart = $derived(sourceStart)

  const renderWindow = $derived.by(() => {
    const currentPeaks = peaks
    const currentSampleRate = sampleRate
    const totalDuration = trackedSourceDuration
    const start = drawSourceStart
    const canvasHeight = height
    const peakNormalization = normalizationPeak

    return (ctx: CanvasRenderingContext2D, windowOffset: number, windowWidth: number) => {
      if (
        !currentPeaks ||
        currentPeaks.length === 0 ||
        currentSampleRate <= 0 ||
        totalDuration <= 0
      ) {
        return
      }

      // The visible canvas can grow imperatively at a clip edge before the
      // cadence-limited redraw. Use the same live zoom value as the DOM
      // measurement so newly exposed pixels are drawn at the correct scale.
      const currentPps = Math.max(1, useZoomStore.getState().pixelsPerSecond)
      const centerY = canvasHeight / 2
      const maxWaveHeight = Math.max(1, canvasHeight / 2 - WAVEFORM_VERTICAL_PADDING_PX)
      const amplitudeCount = windowWidth + 1
      if (amplitudesBuffer.length < amplitudeCount) {
        amplitudesBuffer = new Float32Array(amplitudeCount)
      }
      const amplitudes = amplitudesBuffer
      amplitudes.fill(0, 0, amplitudeCount)

      ctx.beginPath()
      ctx.moveTo(0, centerY)

      for (let x = 0; x < amplitudeCount; x += 1) {
        const timelinePosition = (windowOffset + x) / currentPps
        const compoundTime = start + timelinePosition

        if (compoundTime < 0 || compoundTime > totalDuration) {
          continue
        }

        const peakIndex = Math.floor(compoundTime * currentSampleRate)
        if (peakIndex < 0 || peakIndex >= currentPeaks.length) {
          continue
        }

        const pointWindowSeconds = Math.max(1 / currentSampleRate, (1 / currentPps) * 0.5)
        const samplesPerPoint = Math.max(1, Math.ceil(pointWindowSeconds * currentSampleRate))
        const halfWindow = Math.floor(samplesPerPoint / 2)
        const windowStart = Math.max(0, peakIndex - halfWindow)
        const windowEnd = Math.min(currentPeaks.length, peakIndex + halfWindow + 1)

        let windowPeak = 0
        let windowSum = 0
        let sampleCount = 0
        for (let i = windowStart; i < windowEnd; i += 1) {
          const value = currentPeaks[i] ?? 0
          if (value > windowPeak) {
            windowPeak = value
          }
          windowSum += value
          sampleCount += 1
        }

        if (sampleCount === 0) {
          continue
        }

        amplitudes[x] =
          computeWaveformAmplitude(windowPeak, windowSum, sampleCount, peakNormalization) *
          maxWaveHeight
      }

      for (let x = 0; x < amplitudeCount; x += 1) {
        ctx.lineTo(x, centerY - amplitudes[x]!)
      }
      for (let x = amplitudeCount - 1; x >= 0; x -= 1) {
        ctx.lineTo(x, centerY + amplitudes[x]!)
      }
      ctx.closePath()
      ctx.fillStyle = WAVEFORM_FILL_COLOR
      ctx.fill()
      ctx.strokeStyle = WAVEFORM_STROKE_COLOR
      ctx.lineWidth = 0.75
      ctx.stroke()
    }
  })

  // Live timeline canvases redraw imperatively from the current zoom store.
  // Keeping adaptive zoom state here would only rerender this subtree; content
  // and geometry revisions already cover every required canvas draw.
  const renderVersion = $derived(
    `${peaks?.length ?? 0}:${height}:${waveformsByMediaId.size}:w${Math.round(
      settledRenderClipWidth,
    )}`,
  )
</script>

{#if hasError}
  <div bind:this={container} class="absolute inset-0 flex items-center">
    <div class="w-full h-[1px] bg-foreground/20" style:margin-top="0"></div>
  </div>
{:else if !peaks || peaks.length === 0 || height === 0}
  {#if !isLoading && height > 0}
    <div bind:this={container} class="absolute inset-0 flex items-center">
      <div class="w-full h-[1px] bg-foreground/20" style:margin-top="0"></div>
    </div>
  {:else}
    <div bind:this={container} class="absolute inset-0">
      <WaveformSkeleton clipWidth={visibleClipWidth} height={height || 24} />
    </div>
  {/if}
{:else}
  <div bind:this={container} class="absolute inset-0">
    <VisibleWaveformCanvas
      width={settledRenderClipWidth}
      {height}
      contentVersion={`${peaks?.length ?? 0}:${waveformsByMediaId.size}`}
      liveTimelineViewport
      liveViewportOverscanPx={CLIP_VISIBILITY_PREFETCH_MARGIN_PX}
      {renderWindow}
      version={renderVersion}
      visibleStartPx={settledRenderWindow.visibleStartPx}
      visibleEndPx={settledRenderWindow.visibleEndPx}
      viewportVersion={`${viewportWidth.current}:${visibleStartRatio.toFixed(4)}:${visibleEndRatio.toFixed(4)}`}
    />
  </div>
{/if}
