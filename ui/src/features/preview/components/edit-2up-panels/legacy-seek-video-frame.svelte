<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { getGlobalVideoSourcePool } from '@/features/preview/deps/player-pool'
  import type { TimelineItem } from '@/types/timeline'
  import { useResolvedVideoBlobUrl } from './use-resolved-video-blob-url.svelte'

  const FALLBACK_CANVAS_WIDTH = 280

  const FALLBACK_CANVAS_HEIGHT = 158

  let previewVideoInstanceCounter = 0

  interface VideoFrameProps {
    item: TimelineItem
    sourceTime: number
  }

  interface LegacySeekVideoFrameProps extends VideoFrameProps {
    onFailure: () => void
  }
</script>

<script lang="ts">
  let { item, sourceTime, onFailure }: LegacySeekVideoFrameProps = $props()
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const poolRef = { current: getGlobalVideoSourcePool() }
  const poolClipIdRef: { current: string } = { current: `edit-preview-${++previewVideoInstanceCounter}` }
  const videoRef: { current: HTMLVideoElement | null } = { current: null }
  const resolvedBlobUrl = useResolvedVideoBlobUrl(() => item.mediaId)
  const blobUrl = $derived(resolvedBlobUrl.current)
  const contextRef: { current: CanvasRenderingContext2D | null } = { current: null }
  const seekingRef = { current: false }
  const pendingTimeRef: { current: number | null } = { current: null }
  const latestTargetTimeRef = { current: 0 }

  const drawFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    let ctx = contextRef.current
    if (!ctx) {
      ctx = canvas.getContext('2d')
      if (!ctx) return
      contextRef.current = ctx
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || FALLBACK_CANVAS_WIDTH
      canvas.height = video.videoHeight || FALLBACK_CANVAS_HEIGHT
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  const requestSeek = (targetTime: number) => {
      const video = videoRef.current
      if (!video) return

      const tolerance = 0.001
      if (seekingRef.current) {
        pendingTimeRef.current = targetTime
        return
      }

      if (Math.abs(video.currentTime - targetTime) < tolerance) {
        drawFrame()
        return
      }

      seekingRef.current = true
      video.currentTime = targetTime
    }

  $effect(() => {
    if (!blobUrl) return

    const pool = poolRef.current
    const clipId = poolClipIdRef.current
    seekingRef.current = false
    pendingTimeRef.current = null

    pool.preloadSource(blobUrl).catch(() => {})

    const video = pool.acquireForClip(clipId, blobUrl)
    if (!video) return

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    videoRef.current = video

    const handleError = () => {
      onFailure()
    }

    const handleSeeked = () => {
      seekingRef.current = false
      drawFrame()

      if (pendingTimeRef.current !== null) {
        const next = pendingTimeRef.current
        pendingTimeRef.current = null
        requestSeek(next)
      }
    }

    // Fallback for seeking to time 0 on a new video: currentTime is already 0,
    // so browsers may not dispatch "seeked". Draw once data is available.
    const handleLoadedData = () => {
      if (Math.abs(video.currentTime - latestTargetTimeRef.current) < 0.001) {
        drawFrame()
      }
    }

    video.addEventListener('error', handleError)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('loadeddata', handleLoadedData)

    return () => {
      video.removeEventListener('error', handleError)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('loadeddata', handleLoadedData)
      video.pause()
      videoRef.current = null
      seekingRef.current = false
      pendingTimeRef.current = null
      pool.releaseClip(clipId)
    }
  })

  $effect(() => {
    const video = videoRef.current
    if (!video || !blobUrl) return

    const targetTime = Math.max(0, sourceTime)
    latestTargetTimeRef.current = targetTime
    requestSeek(targetTime)
  })
</script>

<canvas
  bind:this={canvasRef.current}
  class="w-full h-full object-contain"
  style:image-rendering="auto"
></canvas>
