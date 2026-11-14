<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { Snippet } from 'svelte'
  import { type PlayerRef } from '@/features/preview/deps/player-core'
  import type { CompositionInputProps } from '@/types/export'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { ColorGradeComparisonMode } from '@/features/preview/stores/gizmo-store'
  import { isPlaybackColdStartPending } from '@/features/preview/utils/playback-cold-start-event'


  interface PreviewStageProps {
    backgroundRef: { current: HTMLDivElement | null }
    playerRef: { current: PlayerRef | null }
    scrubCanvasRef: { current: HTMLCanvasElement | null }
    gpuEffectsCanvasRef: { current: HTMLCanvasElement | null }
    needsOverflow: boolean
    playerSize: { width: number; height: number }
    playerRenderSize: { width: number; height: number }
    overlayRenderSize: { width: number; height: number }
    totalFrames: number
    fps: number
    /** Frame to start the player clock at on mount (preserves the playhead across remounts). */
    initialFrame?: number
    isResolving: boolean
    isRenderedOverlayVisible: boolean
    isSplitGradeAfterVisible?: boolean
    colorGradeComparisonMode?: ColorGradeComparisonMode
    colorGradeSplitPosition?: number
    onColorGradeSplitPositionChange?: (position: number) => void
    inputProps: CompositionInputProps
    domTextScrubInputProps?: CompositionInputProps
    onBackgroundClick: (event: MouseEvent & { currentTarget: HTMLDivElement }) => void
    onFrameChange: (frame: number) => void
    onPlayStateChange: (playing: boolean) => void
    setPlayerContainerRefCallback: (el: HTMLDivElement | null) => void
    perfPanel?: Snippet
    comparisonOverlay?: Snippet
    overlayControls?: Snippet
  }

  function canObservePlaybackPresentation(watchGeneration: number, generation: number): boolean {
    return (
      watchGeneration === generation &&
      usePlaybackStore.getState().isPlaying &&
      isPlaybackColdStartPending()
    )
  }

  function supportsVideoFrameCallback(video: HTMLVideoElement): boolean {
    return typeof video.requestVideoFrameCallback === 'function'
  }
</script>

<script lang="ts">
  import { HeadlessPlayer } from '@/features/preview/deps/player-core'
  import { markPlaybackColdStart, resolvePlaybackColdStartVisibleFrame } from '@/features/preview/utils/playback-cold-start-event'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { cssStyle } from '@/features/preview/utils/css-style'
  import { MainComposition } from '@/features/preview/deps/composition-runtime-ui'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { FAST_SCRUB_RENDERER_ENABLED } from '@/features/preview/utils/preview-constants'
  import { getPreviewDisplayCanvasStyle } from '@/features/preview/utils/preview-display-canvas'
  import { getPreviewPixelSnapOffset } from '@/features/preview/utils/preview-pixel-snap'
  import DomTextScrubOverlay from './dom-text-scrub-overlay.svelte'
  let { backgroundRef, playerRef, scrubCanvasRef, gpuEffectsCanvasRef, needsOverflow, playerSize, playerRenderSize, overlayRenderSize, totalFrames, fps, initialFrame = 0, isResolving, isRenderedOverlayVisible, isSplitGradeAfterVisible = false, colorGradeComparisonMode = 'off', colorGradeSplitPosition = 0.5, onColorGradeSplitPositionChange, inputProps, domTextScrubInputProps, onBackgroundClick, onFrameChange, onPlayStateChange, setPlayerContainerRefCallback, perfPanel, comparisonOverlay, overlayControls }: PreviewStageProps = $props()

  const useProxy = select(usePlaybackStore, (s) => s.useProxy)
  const pixelSnapAnchorRef: { current: HTMLDivElement | null } = { current: null }
  const pixelSnappedPlayerRef: { current: HTMLDivElement | null } = { current: null }
  const playerSurfaceRef: { current: HTMLDivElement | null } = { current: null }
  const textOverlayPlayerRef: { current: PlayerRef | null } = { current: null }
  const renderedOverlayVisibleRef = { current: isRenderedOverlayVisible }
  $effect.pre(() => {
    renderedOverlayVisibleRef.current = isRenderedOverlayVisible
  })

  // Observe the browser's actual video presentation rather than treating a
  // Clock tick as visible output. The subscription is imperative so playback
  // transitions do not invalidate the PreviewStage tree.
  $effect(() => {
    let generation = 0
    const videoCallbackHandles = new Map<HTMLVideoElement, number>()
    const rafHandles = new Set<number>()

    const cancelPresentationWatch = () => {
      generation += 1
      for (const [video, handle] of videoCallbackHandles) {
        video.cancelVideoFrameCallback?.(handle)
      }
      videoCallbackHandles.clear()
      for (const handle of rafHandles) cancelAnimationFrame(handle)
      rafHandles.clear()
    }

    const scheduleRaf = (callback: () => void) => {
      const handle = requestAnimationFrame(() => {
        rafHandles.delete(handle)
        callback()
      })
      rafHandles.add(handle)
    }

    const isVisiblyComposited = (video: HTMLVideoElement) => {
      const style = getComputedStyle(video)
      return (
        video.isConnected &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        video.getClientRects().length > 0
      )
    }

    const armVideo = (video: HTMLVideoElement, watchGeneration: number) => {
      if (typeof video.requestVideoFrameCallback !== 'function') return
      const handle = video.requestVideoFrameCallback(() => {
        videoCallbackHandles.delete(video)
        if (
          watchGeneration !== generation ||
          !usePlaybackStore.getState().isPlaying ||
          renderedOverlayVisibleRef.current
        ) {
          return
        }
        const frame = Math.max(0, Math.round(playerRef.current?.getCurrentFrame() ?? 0))
        if (resolvePlaybackColdStartVisibleFrame(frame, 'dom_video')) {
          cancelPresentationWatch()
          return
        }
        // A callback for the already-paused frame can race the first Clock
        // advance. Keep listening until an advancing frame is presented.
        armVideo(video, watchGeneration)
      })
      videoCallbackHandles.set(video, handle)
    }

    const armPresentationWatch = (watchGeneration: number, attempt = 0) => {
      if (!canObservePlaybackPresentation(watchGeneration, generation)) return
      // The rendered canvas owns the visible surface in this mode and reports
      // directly from its draw path.
      if (renderedOverlayVisibleRef.current) return

      const surface = playerSurfaceRef.current
      const videos = surface
        ? Array.from(surface.querySelectorAll('video')).filter(isVisiblyComposited)
        : []
      const observableVideos = videos.filter(supportsVideoFrameCallback)
      if (observableVideos.length > 0) {
        markPlaybackColdStart({
          active_dom_video_count: observableVideos.length,
          active_video_ready_state_at_play: Math.min(
            ...observableVideos.map((video) => video.readyState),
          ),
          active_video_network_state_at_play: Math.max(
            ...observableVideos.map((video) => video.networkState),
          ),
        })
        for (const video of observableVideos) armVideo(video, watchGeneration)
        return
      }

      if (attempt < 2) {
        scheduleRaf(() => armPresentationWatch(watchGeneration, attempt + 1))
        return
      }

      // Static/image-only compositions have no media presentation callback.
      // Two animation frames after the committed Clock update is the earliest
      // paint-confirmed fallback for that surface.
      scheduleRaf(() => {
        scheduleRaf(() => {
          const frame = Math.max(0, Math.round(playerRef.current?.getCurrentFrame() ?? 0))
          if (resolvePlaybackColdStartVisibleFrame(frame, 'composition_paint')) {
            cancelPresentationWatch()
          }
        })
      })
    }

    const subscribe = usePlaybackStore.subscribe
    if (typeof subscribe !== 'function') {
      return cancelPresentationWatch
    }

    const unsubscribe = subscribe((state, previousState) => {
      if (state.isPlaying && !previousState.isPlaying) {
        cancelPresentationWatch()
        const watchGeneration = generation
        // Other playback subscribers begin the wide event in the same store
        // dispatch. Arm after that synchronous subscriber pass completes.
        queueMicrotask(() => armPresentationWatch(watchGeneration))
      } else if (!state.isPlaying && previousState.isPlaying) {
        cancelPresentationWatch()
      }
    })

    return () => {
      unsubscribe()
      cancelPresentationWatch()
    }
  })

  const setPixelSnappedPlayerContainerRef = (el: HTMLDivElement | null) => {
      playerSurfaceRef.current = el
      setPlayerContainerRefCallback(el)
    }

  $effect(() => {
    void [playerSize.height, playerSize.width]

    const anchor = pixelSnapAnchorRef.current
    if (!anchor || typeof window === 'undefined') return

    let rafId: number | null = null

    const updatePixelSnapOffset = () => {
      rafId = null
      const rect = anchor.getBoundingClientRect()
      const nextOffset = getPreviewPixelSnapOffset(rect, window.devicePixelRatio)
      const player = pixelSnappedPlayerRef.current
      if (!player) return
      const nextTransform =
        nextOffset.x !== 0 || nextOffset.y !== 0
          ? `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`
          : ''
      if (player.style.transform !== nextTransform) {
        // ResizeObserver/rAF runs before paint. Write the transient correction
        // directly so panel drags cannot spend one frame at stale geometry
        // while waiting for a React state commit.
        player.style.transform = nextTransform
      }
    }

    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(updatePixelSnapOffset)
    }

    updatePixelSnapOffset()

    const ResizeObserverCtor = typeof ResizeObserver === 'undefined' ? null : ResizeObserver
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(scheduleUpdate) : null
    resizeObserver?.observe(anchor)
    if (anchor.parentElement) {
      resizeObserver?.observe(anchor.parentElement)
    }
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  })

  const isTimelineEmpty = $derived(inputProps.tracks.every((track) => track.items.length === 0))
  const isSplitGradeComparison = $derived(colorGradeComparisonMode === 'split')
  const splitPosition = $derived(Math.max(0.05, Math.min(0.95, colorGradeSplitPosition)))
  const splitPercent = $derived(splitPosition * 100)
  const splitClipPath = $derived(`inset(0 ${100 - splitPercent}% 0 0)`)
  const displayCanvasStyle = $derived(getPreviewDisplayCanvasStyle(playerSize, overlayRenderSize))

  const updateSplitPositionFromPointer = (event: { clientX: number }) => {
      const surface = playerSurfaceRef.current
      if (!surface || !onColorGradeSplitPositionChange) return
      const rect = surface.getBoundingClientRect()
      if (rect.width <= 0) return
      const next = (event.clientX - rect.left) / rect.width
      onColorGradeSplitPositionChange(Math.max(0.05, Math.min(0.95, next)))
    }

  const handleSplitPointerDown: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => void = (event) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      updateSplitPositionFromPointer(event)
    }

  const handleSplitPointerMove: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => void = (event) => {
      if (event.buttons !== 1) return
      event.preventDefault()
      updateSplitPositionFromPointer(event)
    }

  const handleSplitKeyDown = (event: KeyboardEvent & { currentTarget: HTMLButtonElement }) => {
      if (!onColorGradeSplitPositionChange) return
      let next: number | null = null
      if (event.key === 'ArrowLeft') next = splitPosition - (event.shiftKey ? 0.1 : 0.01)
      if (event.key === 'ArrowRight') next = splitPosition + (event.shiftKey ? 0.1 : 0.01)
      if (event.key === 'Home') next = 0.05
      if (event.key === 'End') next = 0.95
      if (next === null) return
      event.preventDefault()
      onColorGradeSplitPositionChange(Math.max(0.05, Math.min(0.95, next)))
    }
</script>

<div
  bind:this={backgroundRef.current}
  class="w-full h-full bg-video-preview-background relative"
  style:overflow={needsOverflow ? 'auto' : 'visible'}
  onclick={onBackgroundClick}
  aria-label={t('preview.stage.videoPreview')}
>
  <div
    class="min-w-full min-h-full grid place-items-center"
    style:padding={`calc(${EDITOR_LAYOUT_CSS_VALUES.previewPadding} / 2)`}
    onclick={onBackgroundClick}
  >
    <div
      bind:this={pixelSnapAnchorRef.current}
      class="relative"
      style:width={`${playerSize.width}px`}
      style:height={`${playerSize.height}px`}
    >
      <div
        bind:this={pixelSnappedPlayerRef.current}
        class="relative"
        style:width={`${playerSize.width}px`}
        style:height={`${playerSize.height}px`}
      >
        <div
          {@attach (node: HTMLDivElement) => {
            setPixelSnappedPlayerContainerRef(node)
            return () => setPixelSnappedPlayerContainerRef(null)
          }}
          data-player-container
          class="relative shadow-2xl"
          style:width={`${playerSize.width}px`}
          style:height={`${playerSize.height}px`}
          style:transition="none"
          style:outline="2px solid hsl(var(--border))"
          style:outline-offset="0"
          style:overflow="hidden"
          style:contain="paint"
          ondblclick={(event) => event.preventDefault()}
        >
          {#if isResolving}
            <div
              class="absolute inset-0 flex items-center justify-center bg-black/50 z-20"
            >
              <p class="text-white text-sm">
                {t('preview.stage.loadingMedia')}
              </p>
            </div>
          {/if}
          {#if !isResolving && isTimelineEmpty}
            <div
              class="absolute inset-0 z-10 flex items-center justify-center bg-black/35 px-6 text-center pointer-events-none"
            >
              <div
                class="max-w-sm rounded-xl border border-white/10 bg-black/50 px-5 py-4 text-white shadow-xl backdrop-blur-sm"
              >
                <p class="text-sm font-semibold mb-1">
                  {t('preview.stage.emptyTitle')}
                </p>
                <p class="text-xs text-white/75">
                  {t('preview.stage.emptyDescription')}
                </p>
              </div>
            </div>
          {/if}
          <HeadlessPlayer
            bind:ref={playerRef.current}
            durationInFrames={totalFrames}
            fps={fps}
            initialFrame={initialFrame}
            width={playerRenderSize.width}
            height={playerRenderSize.height}
            autoPlay={false}
            loop={false}
            layoutSize={playerSize}
            style={`width: 100%; height: 100%`}
            onFrameChange={onFrameChange}
            onPlayStateChange={onPlayStateChange}
          >
            <MainComposition
              {...inputProps}
              useProxyMedia={useProxy.current}
              liveItemTransformSource={useItemsStore}
             />
          </HeadlessPlayer>
          {#if FAST_SCRUB_RENDERER_ENABLED}
            <div
              class="absolute left-0 top-0 pointer-events-none"
              data-grade-comparison-before-layer={isSplitGradeComparison ? 'true' : undefined}
              style:width="100%"
              style:height="100%"
              style:z-index="4"
              style:visibility={isRenderedOverlayVisible ? 'visible' : 'hidden'}
              style:clip-path={isSplitGradeComparison ? splitClipPath : undefined}
              style:background-color="#000"
            >
              <canvas
                bind:this={scrubCanvasRef.current}
                class="absolute left-0 top-0 pointer-events-none"
                style={cssStyle({
                  ...displayCanvasStyle,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  visibility: isRenderedOverlayVisible ? 'visible' : 'hidden',
                })}
              ></canvas>
            </div>
          {/if}
          <canvas
            bind:this={gpuEffectsCanvasRef.current}
            class="absolute inset-0 pointer-events-none"
            data-grade-comparison-after-layer={isSplitGradeAfterVisible ? 'true' : undefined}
            style={cssStyle({
              ...displayCanvasStyle,
              zIndex: isSplitGradeAfterVisible ? 3 : 5,
              visibility: isSplitGradeAfterVisible ? 'visible' : 'hidden',
            })}
          ></canvas>
          {#if domTextScrubInputProps}
            <DomTextScrubOverlay
              playerRef={textOverlayPlayerRef}
              visible={isRenderedOverlayVisible}
              durationInFrames={totalFrames}
              fps={fps}
              renderSize={playerRenderSize}
              layoutSize={playerSize}
              inputProps={domTextScrubInputProps}
             />
          {/if}
          {@render perfPanel?.()}
          {@render comparisonOverlay?.()}
          {#if isSplitGradeComparison}
            <div
              class="pointer-events-none absolute inset-0 z-[6]"
              aria-label={t('preview.stage.gradeComparisonSplit')}
            >
              <div
                class="absolute bottom-2 left-2 rounded-sm bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90"
              >
                {t('preview.stage.gradeComparisonBefore')}
              </div>
              <div
                class="absolute bottom-2 right-2 rounded-sm bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90"
              >
                {t('preview.stage.gradeComparisonAfter')}
              </div>
              <button
                type="button"
                role="slider"
                aria-label={t('preview.stage.gradeComparisonWipe')}
                aria-valuemin={5}
                aria-valuemax={95}
                aria-valuenow={Math.round(splitPercent)}
                aria-valuetext={`${Math.round(splitPercent)}%`}
                class="pointer-events-auto absolute top-0 h-full w-6 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/90"
                style:left={`${splitPercent}%`}
                onpointerdown={handleSplitPointerDown}
                onpointermove={handleSplitPointerMove}
                onkeydown={handleSplitKeyDown}
              >
                <span
                  class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                ></span>
                <span
                  class="absolute left-1/2 top-1/2 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-black/55 shadow-sm"
                >
                  <span class="h-4 w-px bg-white/80"></span>
                </span>
              </button>
            </div>
          {/if}
        </div>
        {@render overlayControls?.()}
      </div>
    </div>
  </div>
</div>
