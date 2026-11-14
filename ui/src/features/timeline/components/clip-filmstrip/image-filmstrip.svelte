<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('ImageFilmstrip')

  const VIEWPORT_PAD_TILES = 2
  const VIEWPORT_PAD_PX = 600

  function canUseItemSrcFallback(src: string): boolean {
    try {
      return new URL(src).origin === window.location.origin
    } catch {
      return false
    }
  }

  /**
   * A single tile for an animated image filmstrip: draws its ImageBitmap into
   * the tile canvas whenever the bitmap changes.
   */
  function drawAnimatedTile(bitmap: ImageBitmap) {
    return (canvas: HTMLCanvasElement) => {
      if (!canvas || !bitmap || bitmap.width === 0 || bitmap.height === 0) return
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      try {
        if (ctx) ctx.drawImage(bitmap, 0, 0)
      } catch {
        // Bitmap may have been closed/detached
      }
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { useGifFrames } from '../../hooks/use-gif-frames.svelte'
  import { useMediaBlobUrl } from '../../hooks/use-media-blob-url.svelte'
  import { resolveMediaUrl } from '@/features/timeline/deps/media-library-resolver'
  import { computeFilmstripRenderWindow } from './render-window'

  interface ImageFilmstripProps {
    /** Media ID from the timeline item */
    mediaId: string
    /** Whether the image is an animated format (GIF/WebP) */
    isAnimated: boolean
    /** Animation format for frame extraction */
    animationFormat?: 'gif' | 'webp'
    /** Visible width of the clip in pixels */
    clipWidth: number
    /** Optional overscan width used to hide trailing-edge width commit lag */
    renderWidth?: number
    /** Whether the clip is visible (from IntersectionObserver) */
    isVisible: boolean
    /** Source URL for the image (blob URL) */
    src: string
    /** Source start time in seconds */
    sourceStart: number
    /** Total source duration in seconds */
    sourceDuration: number
    /** Trim start in seconds */
    trimStart: number
    /** Playback speed multiplier */
    speed: number
    /** Frames per second */
    fps: number
    /** Visible horizontal range within this clip (0-1 ratios) */
    visibleStartRatio?: number
    visibleEndRatio?: number
    /** Pixels per second from parent */
    pixelsPerSecond: number
  }

  /**
   * Image Filmstrip Component
   *
   * For static images: tiles the image across the clip width.
   * For animated images (GIF/WebP): extracts frames and tiles them like a video filmstrip.
   */
  let {
    mediaId,
    isAnimated,
    animationFormat = 'gif',
    clipWidth,
    renderWidth,
    isVisible,
    src,
    sourceStart,
    trimStart,
    speed,
    visibleStartRatio = 0,
    visibleEndRatio = 1,
    pixelsPerSecond,
  }: ImageFilmstripProps = $props()

  // Effects keyed on these must rerun only when the value changes (React's
  // dependency comparison), not whenever the parent re-evaluates the prop.
  const trackedMediaId = $derived(mediaId)
  const trackedIsVisible = $derived(isVisible)

  let container = $state<HTMLDivElement | null>(null)
  let height = $state(0)

  // Measure container height
  $effect(() => {
    return untrack(() => {
      const el = container
      if (!el) return

      const measure = () => {
        const parent = el.parentElement
        if (parent) height = parent.clientHeight
      }
      measure()

      const resizeObserver = new ResizeObserver(measure)
      if (el.parentElement) resizeObserver.observe(el.parentElement)
      return () => resizeObserver.disconnect()
    })
  })

  // Resolve a fresh blob URL from the media library (survives page refresh)
  const mediaBlob = useMediaBlobUrl(() => mediaId)

  $effect(() => {
    const id = trackedMediaId
    const visible = trackedIsVisible
    void mediaBlob.blobUrlVersion
    return untrack(() => {
      if (!visible || !id || mediaBlob.hasStartedLoadingRef.current) return
      mediaBlob.hasStartedLoadingRef.current = true

      let mounted = true
      resolveMediaUrl(id)
        .then((url) => {
          if (mounted && url) mediaBlob.setBlobUrl(url)
        })
        .catch((error) => logger.error('Failed to load media blob URL:', error))
      return () => {
        mounted = false
      }
    })
  })

  const gif = useGifFrames(() => ({
    mediaId,
    blobUrl: mediaBlob.blobUrl,
    isVisible,
    enabled: isAnimated && !!mediaBlob.blobUrl,
    format: animationFormat,
  }))

  // Calculate thumbnail tile width based on height (maintain source aspect ratio roughly as 16:9)
  const tileWidth = $derived(Math.round(height * (16 / 9)) || 80)
  const renderClipWidth = $derived(Math.max(clipWidth, renderWidth ?? clipWidth))

  // Resolve the URL to use: prefer freshly resolved blobUrl. Only use the
  // saved item src if it is not a stale blob URL from another origin.
  const resolvedSrc = $derived(mediaBlob.blobUrl || (canUseItemSrcFallback(src) ? src : ''))

  const effectiveStart = $derived(Math.max(0, sourceStart + trimStart))

  // Animated image filmstrip: tile extracted frames (empty when not animated).
  const tiles = $derived.by(() => {
    const frames = gif.frames
    const durations = gif.durations
    const totalDuration = gif.totalDuration
    if (
      !isAnimated ||
      !frames ||
      frames.length === 0 ||
      !durations ||
      totalDuration === null ||
      totalDuration <= 0 ||
      height === 0
    ) {
      return []
    }

    const tileCount = Math.ceil(renderClipWidth / tileWidth)
    if (tileCount <= 0) return []

    // Viewport culling — only generate tiles in the visible range + padding
    const { startTile, endTile } = computeFilmstripRenderWindow({
      renderWidth: renderClipWidth,
      visibleWidth: clipWidth,
      tileWidth,
      visibleStartRatio,
      visibleEndRatio,
      minimumPadTiles: VIEWPORT_PAD_TILES,
      minimumPadPx: VIEWPORT_PAD_PX,
    })

    // Build cumulative durations for frame lookup
    const cumDurations: number[] = []
    let cumMs = 0
    for (const d of durations) {
      cumMs += d
      cumDurations.push(cumMs)
    }

    const result: { tileIndex: number; bitmap: ImageBitmap; x: number; width: number }[] = []

    for (let i = startTile; i < endTile; i++) {
      const x = i * tileWidth
      const w = Math.min(tileWidth, renderClipWidth - x)
      if (w <= 0) break

      // Map tile center pixel to source time in seconds, then to animation time (looped)
      const tileCenterX = x + w * 0.5
      const sourceTimeSeconds = effectiveStart + (tileCenterX / pixelsPerSecond) * speed
      const timeMs = (sourceTimeSeconds * 1000) % totalDuration

      // Find the frame at this time using cumulative durations
      let frameIndex = 0
      for (let f = 0; f < cumDurations.length; f++) {
        if ((cumDurations[f] ?? 0) > timeMs) {
          frameIndex = f
          break
        }
        frameIndex = f
      }

      const bitmap = frames[frameIndex % frames.length]
      if (bitmap) {
        result.push({ tileIndex: i, bitmap, x, width: w })
      }
    }

    return result
  })
</script>

{#if !isAnimated}
  <!-- Static image filmstrip: tile the image using CSS background-repeat -->
  {#if height === 0 || !resolvedSrc}
    <div bind:this={container} class="absolute inset-0"></div>
  {:else}
    <div bind:this={container} class="absolute inset-0">
      <div
        class="absolute left-0 top-0 overflow-hidden pointer-events-none"
        style:width="{renderClipWidth}px"
        style:height="{height}px"
        style:background-image="url({resolvedSrc})"
        style:background-repeat="repeat-x"
        style:background-size="{tileWidth}px {height}px"
        style:background-position="left center"
      ></div>
    </div>
  {/if}
{:else if height === 0 || !gif.frames}
  <div bind:this={container} class="absolute inset-0"></div>
{:else}
  <div bind:this={container} class="absolute inset-0">
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      {#each tiles as { tileIndex, bitmap, x, width } (tileIndex)}
        <canvas
          {@attach drawAnimatedTile(bitmap)}
          class="absolute top-0"
          style:left="{x}px"
          style:width="{width}px"
          style:height="{height}px"
          style:object-fit="cover"
        ></canvas>
      {/each}
    </div>
  </div>
{/if}
