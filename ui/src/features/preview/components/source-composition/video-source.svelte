<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { SharedVideoExtractorPool } from '@/features/preview/deps/export'
  import { resolveProxyUrl } from '@/features/preview/utils/media-resolver'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useMediaLibraryStore } from '@/features/preview/deps/media-library'


  let sourceMonitorVideoInstanceCounter = 0

  let sourceMonitorStrictDecodeInstanceCounter = 0

  let globalSourceMonitorDecoderPool: SharedVideoExtractorPool | null = null

  const SOURCE_MONITOR_STRICT_DECODE_FALLBACK_FAILURES = 2

  const SOURCE_MONITOR_FRAME_CACHE_MAX = 90

  const SOURCE_MONITOR_CACHE_TIME_QUANTUM = 1 / 60

  const SOURCE_MONITOR_PREWARM_MAX_TIMESTAMPS = 6

  const SOURCE_MONITOR_PREWARM_FORWARD_STEPS = 4

  const SOURCE_MONITOR_PREWARM_BACKWARD_STEPS = 6

  const SOURCE_MONITOR_PREWARM_OPPOSITE_STEPS = 2

  const SOURCE_MONITOR_PREWARM_NEUTRAL_RADIUS = 2

  const SOURCE_MONITOR_SHARED_CACHE_WAIT_MS = 4

  function getSourceMonitorDecoderPool(): SharedVideoExtractorPool {
    if (!globalSourceMonitorDecoderPool) {
      globalSourceMonitorDecoderPool = new SharedVideoExtractorPool()
    }
    return globalSourceMonitorDecoderPool
  }

  function quantizeSourceMonitorTime(time: number): number {
    return Math.round(time / SOURCE_MONITOR_CACHE_TIME_QUANTUM) * SOURCE_MONITOR_CACHE_TIME_QUANTUM
  }

  function useSourceMonitorVideoSrc(getMediaId: () => string | undefined, getSrc: () => string): { readonly current: string } {
    const mediaId = $derived(getMediaId())
    const src = $derived(getSrc())
    const useProxy = select(usePlaybackStore, (s) => s.useProxy)
    const proxyStatus = selectDerived(useMediaLibraryStore, (s) =>
      mediaId ? (s.proxyStatus.get(mediaId) ?? null) : null)

    const result = $derived.by(() => {
      void proxyStatus.current
      if (!src) return ''
      if (useProxy.current && mediaId) {
        return resolveProxyUrl(mediaId) || src
      }
      return src
    })
    return {
      get current() {
        return result
      },
    }
  }
</script>

<script lang="ts">
  import { type VideoFrameSource } from '@/features/preview/deps/export'
  import { untrack } from 'svelte'
  import { AbsoluteFill } from '@/features/preview/deps/player-core'
  import { useClock, useClockIsPlaying, useClockPlaybackRate, useVideoConfig } from '@/features/preview/deps/player-context'
  import { getBrowserMediaPlaybackRate } from '@/shared/state/playback/shuttle'
  import { getGlobalVideoSourcePool } from '@/features/preview/deps/player-pool'
  import { backgroundBatchPreseek, getCachedPredecodedBitmap, waitForInflightPredecodedBitmap } from '@/features/preview/utils/decoder-prewarm'
  import { getDirectionalPrewarmOffsets } from '@/features/preview/utils/fast-scrub-prewarm'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import { shouldSeekPlayingMedia } from '@/features/preview/utils/source-media-sync'
  let { mediaId, src, pausedFrameSource, forceFastScrub }: {
    mediaId?: string
    src: string
    pausedFrameSource: 'clock' | 'source-player'
    forceFastScrub: boolean
  } = $props()
  const activeSrc = useSourceMonitorVideoSrc(() => mediaId, () => src)
  const clock = useClock()
  const playing = useClockIsPlaying()
  const playbackRate = useClockPlaybackRate()
  const isReverseShuttle = $derived(playbackRate.current < 0)
  const mediaPlaybackRate = $derived(getBrowserMediaPlaybackRate(1, playbackRate.current))
  const followSourcePlayerFrames = $derived(pausedFrameSource === 'source-player')
  const sourcePlayerPreviewScrubbing = selectDerived(useSourcePlayerStore, (s) => followSourcePlayerFrames && s.previewSourceFrame !== null)
  const isPreviewScrubbing = $derived(forceFastScrub || sourcePlayerPreviewScrubbing.current)
  const videoContainerRef: { current: HTMLDivElement | null } = { current: null }
  const videoRef: { current: HTMLVideoElement | null } = { current: null }
  const audioRef: { current: HTMLAudioElement | null } = { current: null }
  const poolRef = { current: getGlobalVideoSourcePool() }
  const poolClipIdRef: { current: string } = { current: `source-monitor-${++sourceMonitorVideoInstanceCounter}` }
  const decoderPoolRef = { current: getSourceMonitorDecoderPool() }
  const decodeLaneRef: { current: string } = { current: `source-monitor-strict-${++sourceMonitorStrictDecodeInstanceCounter}` }
  const extractorRef: { current: VideoFrameSource | null } = { current: null }
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const contextRef: { current: CanvasRenderingContext2D | null } = { current: null }
  const mountedRef = { current: true }
  const decoderReadyRef = { current: false }
  const renderInFlightRef = { current: false }
  const pendingTimeRef: { current: number | null } = { current: null }
  const latestTargetTimeRef = { current: 0 }
  const consecutiveDecodeFailuresRef = { current: 0 }
  const frameCacheRef: { current: Map<number, ImageBitmap> } = { current: new Map() }
  const frameCacheOrderRef: { current: number[] } = { current: [] }
  const prewarmInFlightRef = { current: false }
  const queuedPrewarmTimesRef: { current: number[] } = { current: [] }
  const prewarmAnchorFrameRef: { current: number | null } = { current: null }
  const videoConfig = useVideoConfig()
  const { fps } = $derived(videoConfig)
  const lastFrameRef = { current: clock.currentFrame }
  const playingRef = { current: playing.current }
  const currentSourceFrameRef: { current: number } = { current: useSourcePlayerStore.getState().currentSourceFrame }
  const previewSourceFrameRef: { current: number | null } = { current: useSourcePlayerStore.getState().previewSourceFrame }
  const pausedRenderTargetKeyRef: { current: number | null } = { current: null }
  const decoderItemId = $derived(`${mediaId ?? 'source-monitor'}:${decodeLaneRef.current}`)
  let useLegacyPausedSeek = $state.raw(false)
  const setUseLegacyPausedSeek = (next: typeof useLegacyPausedSeek | ((prev: typeof useLegacyPausedSeek) => typeof useLegacyPausedSeek)) => {
    useLegacyPausedSeek = typeof next === 'function' ? (next as (prev: typeof useLegacyPausedSeek) => typeof useLegacyPausedSeek)(untrack(() => useLegacyPausedSeek)) : next
  }
  let strictDecodeReady = $state.raw(false)
  const setStrictDecodeReady = (next: typeof strictDecodeReady | ((prev: typeof strictDecodeReady) => typeof strictDecodeReady)) => {
    strictDecodeReady = typeof next === 'function' ? (next as (prev: typeof strictDecodeReady) => typeof strictDecodeReady)(untrack(() => strictDecodeReady)) : next
  }
  let hasDecodedFrame = $state.raw(false)
  const setHasDecodedFrame = (next: typeof hasDecodedFrame | ((prev: typeof hasDecodedFrame) => typeof hasDecodedFrame)) => {
    hasDecodedFrame = typeof next === 'function' ? (next as (prev: typeof hasDecodedFrame) => typeof hasDecodedFrame)(untrack(() => hasDecodedFrame)) : next
  }
  let decodedFrameKey = $state.raw<number | null>(null)
  const setDecodedFrameKey = (next: number | null | ((prev: number | null) => number | null)) => {
    decodedFrameKey = typeof next === 'function' ? (next as (prev: number | null) => number | null)(untrack(() => decodedFrameKey)) : next
  }
  const shouldUseDecodedScrubFrame = $derived(forceFastScrub && strictDecodeReady && !useLegacyPausedSeek)

  $effect(() => {
    playingRef.current = playing.current
  })

  $effect(() => {
    if (!followSourcePlayerFrames) {
      currentSourceFrameRef.current = clock.currentFrame
      previewSourceFrameRef.current = null
      return
    }

    return useSourcePlayerStore.subscribe((state) => {
      currentSourceFrameRef.current = state.currentSourceFrame
      previewSourceFrameRef.current = state.previewSourceFrame
    })
  })

  const getResolvedPausedSourceFrame = () => {
    if (!followSourcePlayerFrames) {
      return clock.currentFrame
    }

    const previewFrame = previewSourceFrameRef.current
    if (previewFrame !== null) {
      return previewFrame
    }

    return currentSourceFrameRef.current
  }

  $effect(() => untrack(() => {
    const frameCache = frameCacheRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const bitmap of frameCache.values()) {
        bitmap.close()
      }
      frameCache.clear()
      frameCacheOrderRef.current = []
      prewarmInFlightRef.current = false
      queuedPrewarmTimesRef.current = []
      prewarmAnchorFrameRef.current = null
    }
  }))

  $effect(() => {
    void [activeSrc.current, mediaId]

    setUseLegacyPausedSeek(false)
    setHasDecodedFrame(false)
    setDecodedFrameKey(null)
    pausedRenderTargetKeyRef.current = null
    prewarmInFlightRef.current = false
    queuedPrewarmTimesRef.current = []
    prewarmAnchorFrameRef.current = null
  })

  const pumpDirectionalPrewarm = () => {
    if (
      prewarmInFlightRef.current ||
      !decoderReadyRef.current ||
      !mountedRef.current ||
      playingRef.current ||
      pendingTimeRef.current !== null
    ) {
      return
    }

    if (!activeSrc.current) {
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
        await backgroundBatchPreseek(activeSrc.current, timestamps)
      } finally {
        prewarmInFlightRef.current = false
        if (
          mountedRef.current &&
          !playingRef.current &&
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
      if (
        !extractor ||
        !decoderReadyRef.current ||
        playingRef.current ||
        pendingTimeRef.current !== null
      ) {
        return
      }

      const duration = extractor.getDuration()
      if (!Number.isFinite(duration) || duration <= 0) {
        return
      }

      const targetFrame = Math.max(0, Math.round(targetTime * fps))
      const previousAnchorFrame = prewarmAnchorFrameRef.current
      const direction: -1 | 0 | 1 =
        previousAnchorFrame === null || previousAnchorFrame === targetFrame
          ? 0
          : targetFrame > previousAnchorFrame
            ? 1
            : -1
      prewarmAnchorFrameRef.current = targetFrame

      const offsets = getDirectionalPrewarmOffsets(direction, {
        forwardSteps: SOURCE_MONITOR_PREWARM_FORWARD_STEPS,
        backwardSteps: SOURCE_MONITOR_PREWARM_BACKWARD_STEPS,
        oppositeSteps: SOURCE_MONITOR_PREWARM_OPPOSITE_STEPS,
        neutralRadius: SOURCE_MONITOR_PREWARM_NEUTRAL_RADIUS,
      })

      const maxFrame = Math.max(0, Math.floor(duration * fps) - 1)
      const cache = frameCacheRef.current
      const nextPrewarmTimes: number[] = []
      const seen = new Set<number>()

      for (const offset of offsets) {
        const prewarmFrame = targetFrame + offset
        if (prewarmFrame < 0 || prewarmFrame > maxFrame) continue
        const prewarmTime = quantizeSourceMonitorTime(prewarmFrame / fps)
        if (prewarmTime === quantizeSourceMonitorTime(targetTime)) continue
        if (cache.has(prewarmTime) || seen.has(prewarmTime)) continue
        seen.add(prewarmTime)
        nextPrewarmTimes.push(prewarmTime)
        if (nextPrewarmTimes.length >= SOURCE_MONITOR_PREWARM_MAX_TIMESTAMPS) {
          break
        }
      }

      queuedPrewarmTimesRef.current = nextPrewarmTimes
      pumpDirectionalPrewarm()
    }

  const drawDecodedFrame = async (targetTime: number) => {
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
      const targetWidth = Math.max(1, Math.round(decodedWidth || 640))
      const targetHeight = Math.max(1, Math.round(decodedHeight || 360))

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      const cacheKey = quantizeSourceMonitorTime(targetTime)
      const markDecodedFrame = () => {
        setHasDecodedFrame(true)
        setDecodedFrameKey((prev) => (prev === cacheKey ? prev : cacheKey))
      }
      const cache = frameCacheRef.current
      const cacheOrder = frameCacheOrderRef.current
      const cached = cache.get(cacheKey)
      if (cached) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(cached, 0, 0, canvas.width, canvas.height)
        const cacheIndex = cacheOrder.indexOf(cacheKey)
        if (cacheIndex !== -1) {
          cacheOrder.splice(cacheIndex, 1)
          cacheOrder.push(cacheKey)
        }
        markDecodedFrame()
        return true
      }

      const drawSharedBitmap = (bitmap: ImageBitmap): boolean => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        return true
      }

      if (activeSrc.current) {
        const sharedBitmap = getCachedPredecodedBitmap(
          activeSrc.current,
          Math.max(0, targetTime),
          SOURCE_MONITOR_CACHE_TIME_QUANTUM,
        )
        if (sharedBitmap && drawSharedBitmap(sharedBitmap)) {
          markDecodedFrame()
          return true
        }

        const inflightBitmap = await waitForInflightPredecodedBitmap(
          activeSrc.current,
          Math.max(0, targetTime),
          SOURCE_MONITOR_CACHE_TIME_QUANTUM,
          SOURCE_MONITOR_SHARED_CACHE_WAIT_MS,
        ).catch(() => null)
        if (inflightBitmap && drawSharedBitmap(inflightBitmap)) {
          markDecodedFrame()
          return true
        }
      }

      const didDraw = await extractor.drawFrame(
        ctx,
        Math.max(0, targetTime),
        0,
        0,
        canvas.width,
        canvas.height,
      )
      if (!didDraw) return false

      try {
        const bitmap = await createImageBitmap(canvas)
        cache.set(cacheKey, bitmap)
        cacheOrder.push(cacheKey)
        while (cacheOrder.length > SOURCE_MONITOR_FRAME_CACHE_MAX) {
          const evictKey = cacheOrder.shift()
          if (evictKey === undefined) break
          const evicted = cache.get(evictKey)
          if (!evicted) continue
          evicted.close()
          cache.delete(evictKey)
        }
      } catch {
        // Cache population is best-effort only.
      }

      markDecodedFrame()
      return true
    }

  const pumpLatestDecodedFrame = () => {
    if (renderInFlightRef.current) return
    renderInFlightRef.current = true

    const run = async () => {
      try {
        while (
          decoderReadyRef.current &&
          pendingTimeRef.current !== null &&
          mountedRef.current &&
          !playingRef.current
        ) {
          const targetTime = pendingTimeRef.current
          pendingTimeRef.current = null

          const didDraw = await drawDecodedFrame(targetTime).catch(() => false)
          if (didDraw) {
            consecutiveDecodeFailuresRef.current = 0
            queueDirectionalPrewarm(targetTime)
            continue
          }

          const failureKind = extractorRef.current?.getLastFailureKind() ?? 'decode-error'
          if (failureKind === 'decode-error') {
            consecutiveDecodeFailuresRef.current += 1
            if (
              consecutiveDecodeFailuresRef.current >= SOURCE_MONITOR_STRICT_DECODE_FALLBACK_FAILURES
            ) {
              decoderReadyRef.current = false
              setStrictDecodeReady(false)
              setUseLegacyPausedSeek((prev) => (prev ? prev : true))
              return
            }
          }
        }
      } finally {
        renderInFlightRef.current = false
        if (
          decoderReadyRef.current &&
          pendingTimeRef.current !== null &&
          mountedRef.current &&
          !playingRef.current
        ) {
          queueMicrotask(() => {
            if (!mountedRef.current) return
            pumpLatestDecodedFrame()
          })
        }
      }
    }

    void run()
  }

  // Acquire/release pooled element when source changes.
  $effect(() => {
    if (!activeSrc.current) return

    const pool = poolRef.current
    const clipId = poolClipIdRef.current

    pool.preloadSource(activeSrc.current).catch(() => {})
    const video = pool.acquireForClip(clipId, activeSrc.current)
    if (!video) return

    video.muted = true
    video.volume = 0
    video.playsInline = true
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'contain'
    video.style.display = 'block'
    video.style.position = 'absolute'
    video.style.top = '0'
    video.style.left = '0'

    const container = videoContainerRef.current
    if (container && video.parentElement !== container) {
      container.appendChild(video)
    }

    videoRef.current = video

    return () => {
      video.pause()
      if (video.parentElement) {
        video.parentElement.removeChild(video)
      }
      pool.releaseClip(clipId)
      videoRef.current = null
    }
  })

  $effect(() => {
    decoderReadyRef.current = false
    setStrictDecodeReady(false)
    setHasDecodedFrame(false)
    extractorRef.current = null
    pendingTimeRef.current = null
    consecutiveDecodeFailuresRef.current = 0
    contextRef.current = null
    prewarmInFlightRef.current = false
    queuedPrewarmTimesRef.current = []
    prewarmAnchorFrameRef.current = null

    for (const bitmap of frameCacheRef.current.values()) {
      bitmap.close()
    }
    frameCacheRef.current.clear()
    frameCacheOrderRef.current = []

    if (!activeSrc.current) return

    const pool = decoderPoolRef.current
    const extractor = pool.getOrCreateItemExtractor(decoderItemId, activeSrc.current)
    extractorRef.current = extractor

    let cancelled = false
    void extractor
      .init()
      .then((ready) => {
        if (cancelled || !mountedRef.current) return
        if (!ready) {
          setUseLegacyPausedSeek((prev) => (prev ? prev : true))
          return
        }
        decoderReadyRef.current = true
        setStrictDecodeReady(true)
        pendingTimeRef.current = latestTargetTimeRef.current
        if (!playingRef.current) {
          pumpLatestDecodedFrame()
        }
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return
        setUseLegacyPausedSeek((prev) => (prev ? prev : true))
      })

    return () => {
      cancelled = true
      decoderReadyRef.current = false
      setStrictDecodeReady(false)
      extractorRef.current = null
      pendingTimeRef.current = null
      pool.releaseItem(decoderItemId)
    }
  })

  const syncSourceFrame = (frame: number) => {
      const video = videoRef.current
      const audio = audioRef.current
      const targetTime = frame / fps
      const targetCacheKey = quantizeSourceMonitorTime(targetTime)
      latestTargetTimeRef.current = targetTime

      lastFrameRef.current = frame

      if (
        !playingRef.current &&
        !useLegacyPausedSeek &&
        (!isPreviewScrubbing || shouldUseDecodedScrubFrame)
      ) {
        if (pausedRenderTargetKeyRef.current !== targetCacheKey) {
          pausedRenderTargetKeyRef.current = targetCacheKey
        }
        pendingTimeRef.current = targetTime
        if (decoderReadyRef.current) {
          pumpLatestDecodedFrame()
        }
      } else if (isPreviewScrubbing) {
        pendingTimeRef.current = null
      }

      const syncAudioTime = () => {
        if (!audio || !src || audio.readyState < 1) {
          return
        }

        if (playingRef.current) {
          if (!shouldSeekPlayingMedia(audio, targetTime, fps)) {
            return
          }
        }

        try {
          audio.currentTime = targetTime
        } catch {
          // Ignore seek errors while media is loading
        }
      }

      if (!video || !activeSrc.current) {
        syncAudioTime()
        return
      }

      const canSeek = video.readyState >= 1
      if (!canSeek) return

      if (
        !playingRef.current &&
        strictDecodeReady &&
        hasDecodedFrame &&
        !useLegacyPausedSeek &&
        (!isPreviewScrubbing || shouldUseDecodedScrubFrame)
      ) {
        syncAudioTime()
        return
      }

      if (playingRef.current) {
        if (!shouldSeekPlayingMedia(video, targetTime, fps)) {
          syncAudioTime()
          return
        }
        try {
          video.currentTime = targetTime
        } catch {
          // Ignore seek errors while media is loading
        }
        syncAudioTime()
        return
      }

      if (isPreviewScrubbing) {
        if (Math.abs(video.currentTime - targetTime) >= 0.016) {
          try {
            video.currentTime = targetTime
          } catch {
            // Ignore seek errors while media is loading
          }
        }
      } else {
        try {
          poolRef.current.seekClip(poolClipIdRef.current, frame / fps, { fast: true })
        } catch {
          // Ignore seek errors while media is loading
        }
      }

      syncAudioTime()
    }

  $effect(() => {
    syncSourceFrame(playing.current ? clock.currentFrame : getResolvedPausedSourceFrame())
    return clock.onFrameChange((frame) => {
      if (!playingRef.current) {
        return
      }
      syncSourceFrame(frame)
    })
  })

  $effect(() => {
    syncSourceFrame(playing.current ? clock.currentFrame : getResolvedPausedSourceFrame())
  })

  $effect(() => {
    if (!followSourcePlayerFrames) {
      return
    }

    return useSourcePlayerStore.subscribe((state, prevState) => {
      if (
        playingRef.current ||
        (state.previewSourceFrame === prevState.previewSourceFrame &&
          state.currentSourceFrame === prevState.currentSourceFrame)
      ) {
        return
      }

      syncSourceFrame(state.previewSourceFrame ?? state.currentSourceFrame)
    })
  })

  // Handle play/pause sync
  $effect(() => {
    const video = videoRef.current
    if (!video || !activeSrc.current) return

    if (playing.current && !isReverseShuttle) {
      video.playbackRate = mediaPlaybackRate
      if (video.readyState >= 1) {
        try {
          video.currentTime = latestTargetTimeRef.current
        } catch {
          // Ignore seek errors while media is loading
        }
      }
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  })

  $effect(() => {
    const audio = audioRef.current
    if (!audio || !src) return

    if (playing.current && !isReverseShuttle) {
      audio.playbackRate = mediaPlaybackRate
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = latestTargetTimeRef.current
        } catch {
          // Ignore seek errors while media is loading
        }
      }
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  })

  const showDecodedCanvas = $derived(!playing.current &&
    (!isPreviewScrubbing || shouldUseDecodedScrubFrame) &&
    strictDecodeReady &&
    hasDecodedFrame &&
    !useLegacyPausedSeek &&
    decodedFrameKey !== null)
</script>

<AbsoluteFill>
  <div
    bind:this={videoContainerRef.current}
    style:width="100%"
    style:height="100%"
    style:position="relative"
    style:display={showDecodedCanvas ? 'none' : 'block'}
  ></div>
  <canvas
    bind:this={canvasRef.current}
    style:width="100%"
    style:height="100%"
    style:display={showDecodedCanvas ? 'block' : 'none'}
  ></canvas>
  <audio
    bind:this={audioRef.current}
    src={src}
    preload="auto"
    style:display="none"
  ></audio>
</AbsoluteFill>
