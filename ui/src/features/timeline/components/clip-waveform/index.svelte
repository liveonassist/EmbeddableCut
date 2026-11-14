<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('ClipWaveform')

  // Continuous filled-path waveform styling (NLE-style)
  const WAVEFORM_VERTICAL_PADDING_PX = 3
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import WaveformSkeleton from './waveform-skeleton.svelte'
  import VisibleWaveformCanvas from './visible-waveform-canvas.svelte'
  import { useWaveform } from '../../hooks/use-waveform.svelte'
  import { importMediaLibraryService } from '@/features/timeline/deps/media-library-service'
  import { resolveMediaUrl } from '@/features/timeline/deps/media-library-resolver'
  import { useMediaBlobUrl } from '../../hooks/use-media-blob-url.svelte'
  import {
    needsCustomAudioDecoder,
    startPreviewAudioConform,
    startPreviewAudioStartupWarm,
  } from '@/features/timeline/deps/composition-runtime'
  import { WAVEFORM_FILL_COLOR, WAVEFORM_STROKE_COLOR } from '@/features/timeline/constants'
  import { computeWaveformRenderWindow } from './render-window'
  import { computeWaveformAmplitude } from './amplitude'
  import { observeParentElementHeight } from '../measure-parent-height'
  import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { CLIP_VISIBILITY_PREFETCH_MARGIN_PX } from '../../hooks/use-clip-visibility.svelte'
  import { select } from '$lib/store.svelte'

  interface ClipWaveformProps {
    /** Media ID from the timeline item */
    mediaId: string
    /** Visible width of the clip in pixels */
    clipWidth: number
    /** Optional overscan width used to hide trailing-edge width commit lag */
    renderWidth?: number
    /** Source start time in seconds (for trimmed clips) */
    sourceStart: number
    /** Source end time in seconds (for trimmed clips) */
    sourceEnd?: number
    /** Total source duration in seconds */
    sourceDuration: number
    /** Trim start in seconds (how much trimmed from beginning) */
    trimStart: number
    /** Playback speed multiplier */
    speed: number
    /** Whether the clip plays source media in reverse */
    isReversed?: boolean
    /** Frames per second */
    fps: number
    /** Whether the clip is visible (from IntersectionObserver) */
    isVisible: boolean
    /** Visible horizontal range within this clip (0-1 ratios) */
    visibleStartRatio?: number
    visibleEndRatio?: number
    /** Pixels per second from parent (avoids redundant zoom subscription) */
    pixelsPerSecond: number
    /** Track the main timeline's live zoom while parent geometry stays settled. */
    liveTimelineZoom?: boolean
  }

  /**
   * Clip Waveform Component
   *
   * Renders audio waveform as a symmetrical mirrored visualization for timeline clips.
   * Uses tiled canvas for large clips and shows skeleton while loading.
   */
  let {
    mediaId,
    clipWidth,
    renderWidth,
    sourceStart,
    sourceEnd,
    sourceDuration,
    trimStart,
    speed,
    isReversed = false,
    isVisible,
    visibleStartRatio = 0,
    visibleEndRatio = 1,
    pixelsPerSecond,
    liveTimelineZoom = false,
  }: ClipWaveformProps = $props()

  // Effects keyed on these must rerun only when the value changes (React's
  // dependency comparison), not whenever the parent re-evaluates the prop.
  const trackedMediaId = $derived(mediaId)
  const trackedIsVisible = $derived(isVisible)

  let container = $state<HTMLDivElement | null>(null)
  let amplitudesBuffer = new Float32Array(0)
  let height = $state(0)
  const viewportWidth = select(useTimelineViewportStore, (state) => state.viewportWidth)
  let conformStarted = false
  const mediaBlob = useMediaBlobUrl(() => mediaId)

  // Measure container height once the element is mounted, before paint: when a
  // clip remounts under a new track (moving a segment across tracks), height
  // would otherwise start at 0 for one painted frame and flash the loading
  // skeleton even though peaks are cached.
  $effect(() => {
    return untrack(() => observeParentElementHeight(container, (next) => (height = next)))
  })

  // Track if audio codec is supported for waveform generation
  let audioCodecSupported = $state(true)
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
  // The bounded canvas owns live timeline zoom imperatively. Keep the component
  // on the settled scale so a wheel burst cannot enqueue one update per visible
  // waveform and repeatedly restart the content-zoom transition.
  const renderPixelsPerSecond = $derived(pixelsPerSecond)
  const clipTimelineDuration = $derived(visibleClipWidth / Math.max(1, pixelsPerSecond))
  const visibleSourceWindow = $derived.by(() => {
    const effectiveStart = Math.max(0, sourceStart + trimStart)
    const effectiveEnd = Math.min(
      sourceDuration,
      Math.max(
        effectiveStart,
        sourceEnd ?? effectiveStart + (visibleClipWidth / Math.max(1, pixelsPerSecond)) * speed,
      ),
    )
    const visibleStartX = visibleClipWidth * Math.max(0, Math.min(1, visibleStartRatio))
    const visibleEndX = visibleClipWidth * Math.max(0, Math.min(1, visibleEndRatio))
    const startOffset = (visibleStartX / Math.max(1, pixelsPerSecond)) * speed
    const endOffset = (visibleEndX / Math.max(1, pixelsPerSecond)) * speed
    const sourceA = isReversed ? effectiveEnd - endOffset : effectiveStart + startOffset
    const sourceB = isReversed ? effectiveEnd - startOffset : effectiveStart + endOffset
    const padSeconds = Math.max(
      2,
      ((visibleEndX - visibleStartX) / Math.max(1, pixelsPerSecond)) * 0.25,
    )

    return {
      start: Math.max(0, Math.min(sourceA, sourceB) - padSeconds),
      end: Math.min(sourceDuration, Math.max(sourceA, sourceB) + padSeconds),
    }
  })

  $effect(() => {
    void trackedMediaId
    conformStarted = false
  })

  // Load blob URL for the media when visible, including post-invalidation retries.
  $effect(() => {
    const id = trackedMediaId
    const visible = trackedIsVisible
    void mediaBlob.blobUrlVersion
    return untrack(() => {
      // Skip if already started loading (prevents re-triggering on visibility changes)
      if (mediaBlob.hasStartedLoadingRef.current) {
        return
      }

      // Only start loading when visible
      if (!visible || !id) {
        return
      }

      mediaBlob.hasStartedLoadingRef.current = true
      let mounted = true

      const loadBlobUrl = async () => {
        try {
          // First check if audio codec is supported
          const { mediaLibraryService } = await importMediaLibraryService()
          const media = await mediaLibraryService.getMedia(id)
          if (!mounted) return

          // A video clip with no audio track has no waveform to draw. Skip generation
          // entirely — otherwise we'd request a pointless decode of a silent clip, which
          // also trips a worker source error. (Audio-type media always has audio.)
          const isAudioMedia = media?.mimeType.startsWith('audio/') ?? false
          if (media && !isAudioMedia && media.audioCodec == null) {
            audioCodecSupported = false
            return
          }

          // AC-3/E-AC-3 can still generate waveform via mediabunny even if old metadata
          // marked codec unsupported before custom decode was added.
          const previewAudioCodec = isAudioMedia
            ? media?.codec
            : (media?.audioCodec ?? media?.codec)
          const requiresCustomDecode = needsCustomAudioDecoder(previewAudioCodec)
          const codecSupported = media
            ? media.audioCodecSupported !== false || requiresCustomDecode
            : true
          audioCodecSupported = codecSupported

          if (!codecSupported) {
            // Skip waveform generation for unsupported codecs
            return
          }

          const url = await resolveMediaUrl(id)
          if (mounted && url) {
            mediaBlob.setBlobUrl(url)
            if (requiresCustomDecode && !conformStarted) {
              conformStarted = true
              const startupWarmup = startPreviewAudioStartupWarm(id, url).catch((error) => {
                logger.warn('Failed to warm preview startup audio from waveform load:', error)
              })
              void startupWarmup.finally(() => {
                void startPreviewAudioConform(id, url).catch((error) => {
                  logger.warn('Failed to start preview audio conform from waveform load:', error)
                })
              })
            }
          }
        } catch (error) {
          logger.error('Failed to load media blob URL:', error)
        }
      }

      void loadBlobUrl()

      return () => {
        mounted = false
      }
    })
  })

  // It can hydrate persisted waveforms before blobUrl is available; blobUrl is
  // only required when the cache has to generate.
  const waveform = useWaveform(() => ({
    mediaId,
    blobUrl: mediaBlob.blobUrl,
    isVisible,
    enabled: audioCodecSupported,
    deferDurationSec: sourceDuration,
    pixelsPerSecond,
    visibleSourceStartSec: visibleSourceWindow.start,
    visibleSourceEndSec: visibleSourceWindow.end,
  }))
  const normalizationPeak = $derived(waveform.maxPeak > 0 ? waveform.maxPeak : 1)
  const peakSampleCount = $derived.by(() => {
    const peaks = waveform.peaks
    return peaks ? (waveform.stereo ? Math.floor(peaks.length / 2) : peaks.length) : 0
  })

  // Render one final amplitude column per visible timeline pixel. The callback
  // is rebuilt only when its inputs change (its identity is part of the canvas
  // redraw check); zoom redraws go through versioning.
  // Each input is its own derived, so the callback is rebuilt only when a value
  // actually changes, as with React's useCallback dependencies.
  const drawPeaks = $derived(waveform.peaks)
  const drawDuration = $derived(waveform.duration)
  const drawSampleRate = $derived(waveform.sampleRate)
  const drawStereo = $derived(waveform.stereo)
  const drawSourceStart = $derived(sourceStart)
  const drawSourceEnd = $derived(sourceEnd)
  const drawTrimStart = $derived(trimStart)
  const drawSpeed = $derived(speed)
  const drawIsReversed = $derived(isReversed)
  const drawSourceDuration = $derived(sourceDuration)
  const drawLiveTimelineZoom = $derived(liveTimelineZoom)

  const renderWindow = $derived.by(() => {
    const peaks = drawPeaks
    const sampleCount = peakSampleCount
    const duration = drawDuration
    const sampleRate = drawSampleRate
    const start = drawSourceStart
    const end = drawSourceEnd
    const trim = drawTrimStart
    const rate = drawSpeed
    const reversed = drawIsReversed
    const totalDuration = drawSourceDuration
    const canvasHeight = height
    const peakNormalization = normalizationPeak
    const stereo = drawStereo
    const live = drawLiveTimelineZoom
    const timelineDuration = clipTimelineDuration

    return (ctx: CanvasRenderingContext2D, windowOffset: number, windowWidth: number) => {
      if (!peaks || sampleCount === 0 || duration === 0) {
        return
      }

      const effectiveStart = start + trim
      // An edge canvas can grow imperatively before the cadence-limited
      // waveform state commits. Sample the live store for that redraw so its
      // new pixels map to the same zoom geometry that was just measured.
      const currentPps = Math.max(
        1,
        live ? useZoomStore.getState().pixelsPerSecond : renderPixelsPerSecond,
      )
      const effectiveEnd = Math.min(
        totalDuration,
        Math.max(effectiveStart, end ?? effectiveStart + timelineDuration * rate),
      )
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

      for (let x = 0; x < amplitudeCount; x++) {
        const timelinePosition = (windowOffset + x) / currentPps
        const sourceOffset = timelinePosition * rate
        const sourceTime = reversed ? effectiveEnd - sourceOffset : effectiveStart + sourceOffset

        if (sourceTime < 0 || sourceTime > totalDuration || sampleRate <= 0) {
          continue
        }

        const peakIndex = Math.min(sampleCount - 1, Math.floor(sourceTime * sampleRate))
        if (peakIndex < 0 || peakIndex >= sampleCount) {
          continue
        }

        // Window sampling to avoid aliasing
        const pointWindowSeconds = Math.max(1 / sampleRate, (1 / currentPps) * rate * 0.5)
        const samplesPerPoint = Math.max(1, Math.ceil(pointWindowSeconds * sampleRate))
        const halfWindow = Math.floor(samplesPerPoint / 2)
        const windowStart = Math.max(0, peakIndex - halfWindow)
        const windowEnd = Math.min(sampleCount, peakIndex + halfWindow + 1)

        let windowPeak = 0
        let windowSum = 0
        let windowSampleCount = 0
        for (let i = windowStart; i < windowEnd; i++) {
          const value = stereo
            ? Math.max(peaks[i * 2] ?? 0, peaks[i * 2 + 1] ?? 0)
            : (peaks[i] ?? 0)
          if (value > windowPeak) {
            windowPeak = value
          }
          windowSum += value
          windowSampleCount++
        }

        if (windowSampleCount === 0) {
          continue
        }

        amplitudes[x] =
          computeWaveformAmplitude(windowPeak, windowSum, windowSampleCount, peakNormalization) *
          maxWaveHeight
      }

      for (let x = 0; x < amplitudeCount; x++) {
        ctx.lineTo(x, centerY - amplitudes[x]!)
      }
      for (let x = amplitudeCount - 1; x >= 0; x--) {
        ctx.lineTo(x, centerY + amplitudes[x]!)
      }
      ctx.closePath()

      ctx.fillStyle = WAVEFORM_FILL_COLOR
      ctx.fill()

      // Thin stroke along the top contour for definition
      ctx.strokeStyle = WAVEFORM_STROKE_COLOR
      ctx.lineWidth = 0.75
      ctx.stroke()
    }
  })

  const renderVersion = $derived(
    `${waveform.loadedSamples}:${height}:e${Math.round(
      renderPixelsPerSecond * 1000,
    )}:w${Math.round(settledRenderClipWidth)}`,
  )
</script>

{#if !audioCodecSupported || !!waveform.error}
  <!-- Show empty state for unsupported/failed waveforms (no infinite skeleton). -->
  <div bind:this={container} class="absolute inset-0 flex items-center">
    <!-- Flat line to indicate no waveform available -->
    <div class="w-full h-[1px] bg-foreground/20" style:margin-top="0"></div>
  </div>
{:else if !waveform.peaks || waveform.peaks.length === 0 || height === 0}
  <!-- Show skeleton only while actively loading. -->
  {#if !waveform.isLoading && height > 0}
    <div bind:this={container} class="absolute inset-0 flex items-center">
      <div class="w-full h-[1px] bg-foreground/20" style:margin-top="0"></div>
    </div>
  {:else}
    <div bind:this={container} class="absolute inset-0">
      <WaveformSkeleton {clipWidth} height={height || 24} />
    </div>
  {/if}
{:else}
  <div bind:this={container} class="absolute inset-0">
    <VisibleWaveformCanvas
      width={settledRenderClipWidth}
      {height}
      contentVersion={waveform.loadedSamples}
      liveTimelineViewport={liveTimelineZoom}
      liveViewportOverscanPx={CLIP_VISIBILITY_PREFETCH_MARGIN_PX}
      {renderWindow}
      version={renderVersion}
      visibleStartPx={settledRenderWindow.visibleStartPx}
      visibleEndPx={settledRenderWindow.visibleEndPx}
      viewportVersion={`${viewportWidth.current}:${visibleStartRatio.toFixed(4)}:${visibleEndRatio.toFixed(4)}`}
    />
  </div>
{/if}
