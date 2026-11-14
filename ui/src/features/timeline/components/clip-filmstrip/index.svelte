<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('ClipFilmstrip')

  // Pad the rendered tile window beyond the visible range so a fast scrub never
  // outruns the mounted tiles within a frame. Matches the animated-image filmstrip.
  const VIEWPORT_PAD_TILES = 2
  const VIEWPORT_PAD_PX = 600
  const coverFrameIndexByMediaId = new Map<string, number>()
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import FilmstripSkeleton from './filmstrip-skeleton.svelte'
  import { computeFilmstripRenderWindow } from './render-window'
  import { getFilmstripTileStride } from './filmstrip-canvas-geometry'
  import VisibleFilmstripCanvas from './visible-filmstrip-canvas.svelte'
  import { useFilmstrip, type FilmstripFrame } from '../../hooks/use-filmstrip.svelte'
  import { resolveMediaUrl, resolveProxyUrl } from '@/features/timeline/deps/media-library-resolver'
  import { useMediaBlobUrl } from '../../hooks/use-media-blob-url.svelte'
  import { filmstripCache, THUMBNAIL_WIDTH } from '@/features/timeline/services/filmstrip-cache'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import { observeParentElementHeight } from '../measure-parent-height'
  import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
  import { CLIP_VISIBILITY_PREFETCH_MARGIN_PX } from '../../hooks/use-clip-visibility.svelte'
  import { select } from '$lib/store.svelte'

  interface ClipFilmstripProps {
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
    /** Disable deferred width/zoom while active edit previews are running */
    preferImmediateRendering?: boolean
  }

  /**
   * Clip Filmstrip Component
   *
   * Renders video frame thumbnails as a tiled filmstrip.
   * Uses adaptive tile density during active zoom to keep interactions responsive
   * without deferring the zoom state itself.
   * Auto-fills container height.
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
    preferImmediateRendering = false,
  }: ClipFilmstripProps = $props()

  // Effects keyed on these must rerun only when the value changes (React's
  // dependency comparison), not whenever the parent re-evaluates the prop.
  const trackedMediaId = $derived(mediaId)
  const trackedIsVisible = $derived(isVisible)

  let container = $state<HTMLDivElement | null>(null)
  let height = $state(0)
  const viewportWidth = select(useTimelineViewportStore, (state) => state.viewportWidth)
  const mediaBlob = useMediaBlobUrl(() => mediaId)
  const refreshingFrameIndices = new Set<number>()
  const proxyStatus = $derived(
    select(useMediaLibraryStore, (s) => s.proxyStatus.get(mediaId) ?? null),
  )

  // A tab-wake refresh replaces the proxy URL while its status stays `ready`.
  // Re-read it whenever the blob URL version changes so the update cannot
  // retain a revoked URL.
  const proxyBlobUrl = $derived.by(() => {
    void mediaBlob.blobUrlVersion
    void mediaBlob.blobUrl
    return proxyStatus.current === 'ready' ? resolveProxyUrl(mediaId) : null
  })
  const filmstripSourceUrl = $derived(proxyBlobUrl ?? mediaBlob.blobUrl)

  // Measure container height
  $effect(() => {
    return untrack(() => observeParentElementHeight(container, (next) => (height = next)))
  })

  // Calculate thumbnail width based on height (16:9 aspect ratio)
  const thumbnailWidth = $derived(Math.round(height * (16 / 9)) || THUMBNAIL_WIDTH)

  const renderPixelsPerSecond = $derived(pixelsPerSecond)
  const visibleClipWidth = $derived(clipWidth)
  const renderClipWidth = $derived(Math.max(visibleClipWidth, renderWidth ?? visibleClipWidth))
  const effectiveStart = $derived(Math.max(0, sourceStart + trimStart))
  const effectiveEnd = $derived(
    Math.min(
      sourceDuration,
      Math.max(
        effectiveStart,
        sourceEnd ??
          effectiveStart + (visibleClipWidth / Math.max(1, renderPixelsPerSecond)) * speed,
      ),
    ),
  )
  let initialPriorityWindow: {
    mediaId: string
    window: { startTime: number; endTime: number }
  } | null = null

  // Prioritize the first visible source window once per media item. Keeping this
  // stable avoids the old zoom-driven target churn while still making a freshly
  // dropped visible clip fill in the part the user can actually see first.
  const priorityWindow = $derived.by(() => {
    if (initialPriorityWindow?.mediaId !== mediaId) {
      initialPriorityWindow = null
    }
    if (isVisible && !initialPriorityWindow && effectiveEnd > effectiveStart) {
      initialPriorityWindow = {
        mediaId,
        window: {
          startTime: effectiveStart,
          endTime: Math.min(sourceDuration, Math.max(effectiveEnd, effectiveStart + 1)),
        },
      }
    }
    return initialPriorityWindow?.mediaId === mediaId ? initialPriorityWindow.window : null
  })
  const targetFrameCount = undefined
  const filmstripRenderWindow = $derived(
    computeFilmstripRenderWindow({
      renderWidth: renderClipWidth,
      visibleWidth: visibleClipWidth,
      tileWidth: thumbnailWidth,
      visibleStartRatio,
      visibleEndRatio,
      minimumPadTiles: VIEWPORT_PAD_TILES,
      minimumPadPx: VIEWPORT_PAD_PX,
      maxWindowWidth:
        viewportWidth.current > 0
          ? viewportWidth.current + CLIP_VISIBILITY_PREFETCH_MARGIN_PX * 2
          : undefined,
    }),
  )
  const targetFrameIndices = $derived.by(() => {
    if (!isVisible || height <= 0 || renderPixelsPerSecond <= 0) return undefined
    if (effectiveEnd <= effectiveStart || sourceDuration <= 0) return undefined

    const pixelsPerSourceSecond = renderPixelsPerSecond / Math.max(0.0001, speed)
    const tileWidth = thumbnailWidth
    const { startTile, endTile } = filmstripRenderWindow
    if (endTile <= startTile) return undefined
    const tileStride = getFilmstripTileStride(startTile, endTile)

    const totalFrameCount = Math.max(1, Math.ceil(sourceDuration))
    const indices = new Set<number>()
    for (let slot = startTile; slot < endTile; slot += tileStride) {
      const slotCenterX = slot * tileWidth + tileWidth * tileStride * 0.5
      const slotCenterTime = isReversed
        ? effectiveEnd - slotCenterX / pixelsPerSourceSecond
        : effectiveStart + slotCenterX / pixelsPerSourceSecond
      indices.add(Math.max(0, Math.min(totalFrameCount - 1, Math.floor(slotCenterTime))))
    }

    return indices.size > 0 ? Array.from(indices).sort((a, b) => a - b) : undefined
  })

  // Load blob URL lazily when visible, and retry after global invalidation.
  $effect(() => {
    const id = trackedMediaId
    const visible = trackedIsVisible
    const proxyUrl = proxyBlobUrl
    void mediaBlob.blobUrlVersion
    return untrack(() => {
      if (!visible || !id || proxyUrl || mediaBlob.hasStartedLoadingRef.current) {
        return
      }
      mediaBlob.hasStartedLoadingRef.current = true

      let mounted = true
      const loadBlobUrl = async () => {
        try {
          const url = await resolveMediaUrl(id)
          if (mounted && url) {
            mediaBlob.setBlobUrl(url)
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

  // `enabled` no longer requires the source blob URL — disk-cached frames can
  // render before useMediaBlobUrl resolves. The extraction path inside the hook
  // still gates on blobUrl.
  const filmstrip = useFilmstrip(() => ({
    mediaId,
    blobUrl: filmstripSourceUrl,
    duration: sourceDuration,
    isVisible,
    enabled: sourceDuration > 0,
    priorityWindow,
    targetFrameCount,
    targetFrameIndices,
  }))
  let stableFrames = $state.raw<FilmstripFrame[] | null>(null)

  $effect(() => {
    void trackedMediaId
    untrack(() => {
      stableFrames = null
    })
  })

  $effect(() => {
    const frames = filmstrip.frames
    const isLoading = filmstrip.isLoading
    untrack(() => {
      if (!frames || frames.length === 0) {
        if (!isLoading) {
          stableFrames = null
        }
        return
      }

      const current = stableFrames
      if (isLoading && current && current.length > 0) {
        return
      }
      stableFrames = frames
    })
  })

  const renderFrames = $derived(stableFrames ?? filmstrip.frames)

  function handleFrameSourceError(frameIndex: number) {
    if (!mediaId || refreshingFrameIndices.has(frameIndex)) {
      return
    }

    refreshingFrameIndices.add(frameIndex)
    void filmstripCache
      .refreshFrames(mediaId, [frameIndex])
      .catch((refreshError) => {
        logger.warn('Failed to refresh stale filmstrip frame URL:', refreshError)
      })
      .finally(() => {
        refreshingFrameIndices.delete(frameIndex)
      })
  }

  // Share one stable fallback frame per media item. Every clip instance then
  // reuses the same decoded source across virtualization and zoom remounts.
  const coverFrame = $derived.by(() => {
    if (!renderFrames || renderFrames.length === 0) return null
    const cachedIndex = coverFrameIndexByMediaId.get(mediaId)
    if (cachedIndex !== undefined) {
      const exact = renderFrames.find((frame) => frame.index === cachedIndex)
      if (exact) return exact
    }
    const fallback = renderFrames[Math.floor(renderFrames.length / 2)] ?? renderFrames[0] ?? null
    if (fallback) {
      coverFrameIndexByMediaId.set(mediaId, fallback.index)
    }
    return fallback
  })
</script>

{#if filmstrip.error}
  <!-- nothing -->
{:else if !renderFrames || renderFrames.length === 0 || height === 0}
  <!-- Show skeleton while actively loading. -->
  {#if !filmstrip.isLoading && height > 0}
    <div bind:this={container} class="absolute inset-0"></div>
  {:else}
    <div bind:this={container} class="absolute inset-0">
      <FilmstripSkeleton clipWidth={visibleClipWidth} height={height || 40} />
    </div>
  {/if}
{:else}
  <div
    bind:this={container}
    class="absolute inset-0"
    data-filmstrip-fallback
    style:background-image={coverFrame?.url ? `url(${coverFrame.url})` : undefined}
    style:background-repeat="repeat-x"
    style:background-size="{thumbnailWidth}px {height}px"
  >
    <VisibleFilmstripCanvas
      renderWidth={renderClipWidth}
      {height}
      visibleStartPx={filmstripRenderWindow.paddedStartX}
      visibleEndPx={filmstripRenderWindow.paddedEndX}
      frames={renderFrames}
      pixelsPerSecond={renderPixelsPerSecond}
      {effectiveStart}
      {effectiveEnd}
      {speed}
      {isReversed}
      tileWidth={thumbnailWidth}
      {coverFrame}
      onSourceError={handleFrameSourceError}
      liveTimelineViewport={!preferImmediateRendering && isVisible}
      liveViewportOverscanPx={CLIP_VISIBILITY_PREFETCH_MARGIN_PX}
    />
  </div>
{/if}
