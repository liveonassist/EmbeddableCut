<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { SharedVideoExtractorPool } from '@/features/preview/deps/export'
  import type { TimelineItem } from '@/types/timeline'


  const FALLBACK_CANVAS_WIDTH = 280

  const FALLBACK_CANVAS_HEIGHT = 158

  const STRICT_DECODE_FALLBACK_FAILURES = 2

  const CACHE_TIME_QUANTUM = 1 / 60

  const STRICT_DECODE_SHARED_CACHE_WAIT_MS = 6

  const EDIT_OVERLAY_PREWARM_MAX_TIMESTAMPS = 6

  const SCRUBBING_CACHE_TOLERANCE_FACTOR = 0.9

  let strictDecodeInstanceCounter = 0

  let globalEditOverlayDecoderPool: SharedVideoExtractorPool | null = null

  function getEditOverlayDecoderPool(): SharedVideoExtractorPool {
    if (!globalEditOverlayDecoderPool) {
      globalEditOverlayDecoderPool = new SharedVideoExtractorPool()
    }
    return globalEditOverlayDecoderPool
  }

  function quantizeOverlayCacheTime(sourceTime: number): number {
    return Math.round(sourceTime / CACHE_TIME_QUANTUM) * CACHE_TIME_QUANTUM
  }

  interface VideoFrameProps {
    item: TimelineItem
    sourceTime: number
  }

  interface StrictDecodedVideoFrameProps extends VideoFrameProps {
    onDecodeFailure: () => void
  }
</script>

<script lang="ts">
  import { type VideoFrameSource } from '@/features/preview/deps/export'
  import { untrack } from 'svelte'
  import { backgroundBatchPreseek, backgroundPreseek, getCachedPredecodedBitmap, waitForInflightPredecodedBitmap } from '@/features/preview/utils/decoder-prewarm'
  import { getCachedEditOverlayFrame, getEditOverlayFrameCacheKey, hasCachedEditOverlayFrame, putCachedEditOverlayFrame } from '@/features/preview/utils/edit-overlay-frame-cache'
  import { collectEditOverlayDirectionalPrewarmTimes } from '@/features/preview/utils/edit-overlay-prewarm-plan'
  import { getActivePreviewScrubbingCache, getActivePreviewVideoFrameEntry } from '@/features/preview/utils/preview-scrubbing-cache-bridge'
  import { useResolvedVideoBlobUrl } from './use-resolved-video-blob-url.svelte'
  let { item, sourceTime, onDecodeFailure }: StrictDecodedVideoFrameProps = $props()
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const decoderPoolRef = { current: getEditOverlayDecoderPool() }
  const decodeLaneRef: { current: string } = { current: `edit-preview-strict-${++strictDecodeInstanceCounter}` }
  const prewarmFps = $derived(Math.max(1, Math.round(item.sourceFps ?? 60)))
  const extractorRef: { current: VideoFrameSource | null } = { current: null }
  const mountedRef = { current: true }
  const decoderReadyRef = { current: false }
  const renderInFlightRef = { current: false }
  const pendingTimeRef: { current: number | null } = { current: null }
  const consecutiveDecodeFailuresRef = { current: 0 }
  const latestTargetTimeRef = { current: Math.max(0, sourceTime) }
  const resolvedBlobUrl = useResolvedVideoBlobUrl(() => item.mediaId)
  const blobUrl = $derived(resolvedBlobUrl.current)
  const contextRef: { current: CanvasRenderingContext2D | null } = { current: null }
  const decoderItemId = $derived(`${item.id}:${decodeLaneRef.current}`)
  const prewarmInFlightRef = { current: false }
  const queuedPrewarmTimesRef: { current: number[] } = { current: [] }
  const prewarmAnchorFrameRef: { current: number | null } = { current: null }

  $effect(() => untrack(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      prewarmInFlightRef.current = false
      queuedPrewarmTimesRef.current = []
      prewarmAnchorFrameRef.current = null
    }
  }))

  const pumpDirectionalPrewarm = () => {
    if (
      prewarmInFlightRef.current ||
      !decoderReadyRef.current ||
      !mountedRef.current ||
      pendingTimeRef.current !== null
    ) {
      return
    }

    if (!blobUrl) {
      queuedPrewarmTimesRef.current = []
      return
    }

    const timestamps = queuedPrewarmTimesRef.current
    if (timestamps.length === 0) {
      return
    }

    prewarmInFlightRef.current = true
    queuedPrewarmTimesRef.current = []

    const run = async () => {
      try {
        await backgroundBatchPreseek(blobUrl, timestamps)
      } finally {
        prewarmInFlightRef.current = false
        if (
          mountedRef.current &&
          pendingTimeRef.current === null &&
          queuedPrewarmTimesRef.current.length > 0
        ) {
          queueMicrotask(() => {
            if (!mountedRef.current) return
            pumpDirectionalPrewarm()
          })
        }
      }
    }

    void run()
  }

  const queueDirectionalPrewarm = (targetTime: number) => {
      const extractor = extractorRef.current
      if (!extractor || !decoderReadyRef.current || pendingTimeRef.current !== null || !blobUrl) {
        return
      }

      const result = collectEditOverlayDirectionalPrewarmTimes({
        targetTime,
        duration: extractor.getDuration(),
        fps: prewarmFps,
        previousAnchorFrame: prewarmAnchorFrameRef.current,
        quantumSeconds: CACHE_TIME_QUANTUM,
        maxTimestamps: EDIT_OVERLAY_PREWARM_MAX_TIMESTAMPS,
        isCached: (time) => {
          const overlayCacheKey = getEditOverlayFrameCacheKey(blobUrl, time, CACHE_TIME_QUANTUM)
          return (
            hasCachedEditOverlayFrame(overlayCacheKey) ||
            getCachedPredecodedBitmap(blobUrl, time, CACHE_TIME_QUANTUM) !== null
          )
        },
      })

      prewarmAnchorFrameRef.current = result.targetFrame
      queuedPrewarmTimesRef.current = result.times
      pumpDirectionalPrewarm()
    }

  const drawFrame = async (targetTime: number) => {
      const extractor = extractorRef.current
      const canvas = canvasRef.current
      if (!extractor || !canvas) return false

      let ctx = contextRef.current
      if (!ctx) {
        ctx = canvas.getContext('2d')
        if (!ctx) return false
        contextRef.current = ctx
      }

      const { width: decodedWidth, height: decodedHeight } = extractor.getDimensions()
      const targetWidth = Math.max(1, Math.round(decodedWidth || FALLBACK_CANVAS_WIDTH))
      const targetHeight = Math.max(1, Math.round(decodedHeight || FALLBACK_CANVAS_HEIGHT))

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      const cacheKey = blobUrl
        ? getEditOverlayFrameCacheKey(blobUrl, targetTime, CACHE_TIME_QUANTUM)
        : null
      const quantizedTargetTime = quantizeOverlayCacheTime(targetTime)
      const drawBitmap = (bitmap: CanvasImageSource) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      }
      const populateSharedScrubCache = (source: ImageBitmap, resolvedSourceTime: number) => {
        const scrubbingCache = getActivePreviewScrubbingCache()
        if (!scrubbingCache) {
          return
        }
        void createImageBitmap(source)
          .then((bitmap) => {
            scrubbingCache.putVideoFrame(
              item.id,
              bitmap,
              quantizeOverlayCacheTime(resolvedSourceTime),
            )
          })
          .catch(() => {
            // Shared scrub cache population is best-effort only.
          })
      }

      if (cacheKey) {
        const sharedCachedFrame = getCachedEditOverlayFrame(cacheKey)
        if (sharedCachedFrame) {
          drawBitmap(sharedCachedFrame)
          populateSharedScrubCache(sharedCachedFrame, targetTime)
          return true
        }
      }

      const scrubbingCacheTolerance = Math.max(
        CACHE_TIME_QUANTUM / 2,
        SCRUBBING_CACHE_TOLERANCE_FACTOR / prewarmFps / 2,
      )
      const scrubCachedFrame = getActivePreviewVideoFrameEntry(
        item.id,
        quantizedTargetTime,
        scrubbingCacheTolerance,
      )
      if (scrubCachedFrame) {
        drawBitmap(scrubCachedFrame.frame)
        return true
      }

      if (blobUrl) {
        const predecodedBitmap = getCachedPredecodedBitmap(blobUrl, targetTime, CACHE_TIME_QUANTUM)
        if (predecodedBitmap) {
          drawBitmap(predecodedBitmap)
          populateSharedScrubCache(predecodedBitmap, targetTime)
          return true
        }

        const inflightBitmap = await waitForInflightPredecodedBitmap(
          blobUrl,
          targetTime,
          CACHE_TIME_QUANTUM,
          STRICT_DECODE_SHARED_CACHE_WAIT_MS,
        ).catch(() => null)
        if (inflightBitmap) {
          drawBitmap(inflightBitmap)
          populateSharedScrubCache(inflightBitmap, targetTime)
          return true
        }
      }

      const drawResult = await extractor.drawFrameWithCapture(
        ctx,
        Math.max(0, targetTime),
        0,
        0,
        canvas.width,
        canvas.height,
      )
      if (!drawResult.success) return false

      const scrubbingCache = getActivePreviewScrubbingCache()
      if (scrubbingCache && drawResult.capturedFrame) {
        scrubbingCache.putVideoFrame(item.id, drawResult.capturedFrame, quantizedTargetTime)
      }

      if (cacheKey) {
        try {
          const bitmap = await createImageBitmap(canvas)
          putCachedEditOverlayFrame(cacheKey, bitmap)
        } catch {
          // Shared overlay cache population is best-effort only.
        }
      }

      return true
    }

  const pumpLatestFrame = () => {
    if (renderInFlightRef.current) return
    renderInFlightRef.current = true

    const run = async () => {
      try {
        while (decoderReadyRef.current && pendingTimeRef.current !== null && mountedRef.current) {
          const targetTime = pendingTimeRef.current
          pendingTimeRef.current = null

          const didDraw = await drawFrame(targetTime).catch(() => false)
          if (didDraw) {
            consecutiveDecodeFailuresRef.current = 0
            queueDirectionalPrewarm(targetTime)
            continue
          }

          const failureKind = extractorRef.current?.getLastFailureKind() ?? 'decode-error'
          if (failureKind === 'decode-error') {
            consecutiveDecodeFailuresRef.current += 1
            if (consecutiveDecodeFailuresRef.current >= STRICT_DECODE_FALLBACK_FAILURES) {
              onDecodeFailure()
              return
            }
          }
        }
      } finally {
        renderInFlightRef.current = false
        if (decoderReadyRef.current && pendingTimeRef.current !== null && mountedRef.current) {
          queueMicrotask(() => {
            if (!mountedRef.current) return
            pumpLatestFrame()
          })
        }
      }
    }

    void run()
  }

  $effect(() => {
    decoderReadyRef.current = false
    extractorRef.current = null
    pendingTimeRef.current = null
    consecutiveDecodeFailuresRef.current = 0
    contextRef.current = null
    prewarmInFlightRef.current = false
    queuedPrewarmTimesRef.current = []
    prewarmAnchorFrameRef.current = null

    if (!blobUrl) return

    const pool = decoderPoolRef.current
    const extractor = pool.getOrCreateItemExtractor(decoderItemId, blobUrl)
    extractorRef.current = extractor

    let cancelled = false
    void extractor
      .init()
      .then((ready) => {
        if (cancelled || !mountedRef.current) return
        if (!ready) {
          onDecodeFailure()
          return
        }
        decoderReadyRef.current = true
        pendingTimeRef.current = latestTargetTimeRef.current
        pumpLatestFrame()
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return
        onDecodeFailure()
      })

    return () => {
      cancelled = true
      decoderReadyRef.current = false
      extractorRef.current = null
      pendingTimeRef.current = null
      pool.releaseItem(decoderItemId)
    }
  })

  $effect(() => {
    const targetTime = Math.max(0, sourceTime)
    latestTargetTimeRef.current = targetTime
    pendingTimeRef.current = targetTime

    if (blobUrl) {
      void backgroundPreseek(blobUrl, targetTime).catch(() => null)
    }

    if (decoderReadyRef.current) {
      pumpLatestFrame()
    }
  })
</script>

<canvas
  bind:this={canvasRef.current}
  class="w-full h-full object-contain"
  style:image-rendering="auto"
></canvas>
