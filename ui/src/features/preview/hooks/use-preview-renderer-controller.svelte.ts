// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import {
  importCompositionRenderer,
  type CompositionRendererInstance,
} from '@/features/preview/deps/export'
import type { CompositionInputProps } from '@/types/export'
import type { ItemEffect } from '@/types/effects'
import type { ItemKeyframes } from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { ResolvedTransform } from '@/types/transform'
import type { CaptureOptions } from '@/shared/state/playback'
import { usePlaybackStore } from '@/shared/state/playback'
import {
  useCompositionNavigationStore,
  useCompositionsStore,
  useItemsStore,
  type SubComposition,
} from '@/features/preview/deps/timeline-store'
import { usePreviewBridgeStore, type PostEditWarmRequest } from '@/shared/state/preview-bridge'
import { createLogger } from '@/shared/logging/logger'
import {
  getBestDomVideoElementForItem,
  type PreviewPathVerticesOverride,
} from '@/features/preview/deps/composition-runtime'
import { getPreviewRuntimeSnapshotFromPlaybackState } from '@/features/preview/utils/preview-state-coordinator'
import {
  FAST_SCRUB_PRELOAD_BUDGET_MS,
  FAST_SCRUB_RENDERER_ENABLED,
  blobToDataUrl,
} from '@/features/preview/utils/preview-constants'
import {
  copyPreviewDisplayCanvasContent,
  drawSourceToPreviewDisplayCanvas,
  getPreviewDisplayCanvasBackingSize,
  type CommittedPreviewSnapshotState,
} from '@/features/preview/utils/preview-display-canvas'
import { setActivePreviewScrubbingCache } from '@/features/preview/utils/preview-scrubbing-cache-bridge'
import { warmDecoderPrewarmWorkerPool } from '@/features/preview/utils/decoder-prewarm'
import {
  disposeScrubProxyFallback,
  warmScrubProxyFallback,
} from '@/features/preview/utils/scrub-proxy-fallback'
import { collectVisualInvalidationRanges } from '@/features/preview/utils/preview-frame-invalidation'
import { resolvePreviewCaptureFrame } from '@/features/preview/utils/preview-capture-frame'
import {
  markPlaybackStartReadiness,
  resetPlaybackStartReadiness,
} from '@/features/preview/utils/playback-cold-start-event'
import {
  isFrameInRanges,
  normalizeFrameRanges,
  type FrameInvalidationRequest,
  type FrameRange,
} from '@/shared/utils/frame-invalidation'
import { usePreviewCaptureBridge } from './use-preview-capture-bridge.svelte'

const logger = createLogger('VideoPreview')

// How long a capture waits for an in-flight pump render before giving up.
// Long enough to outlast a typical WASM-decode render (40-80ms); short
// enough that a stuck pump can't stall capture consumers indefinitely.
const CAPTURE_RENDER_LOCK_WAIT_MS = 150

const CAPTURE_RENDER_LOCK_POLL_MS = 8

export type PreviewCompositionRenderer = CompositionRendererInstance

function wasRendererFrameAborted(renderer: PreviewCompositionRenderer): boolean {
  return 'wasLastRenderAborted' in renderer && renderer.wasLastRenderAborted?.() === true
}

function itemOccupiesFrame(item: TimelineItem | undefined, frame: number): boolean {
  return Boolean(
    item &&
    Number.isFinite(item.from) &&
    Number.isFinite(item.durationInFrames) &&
    frame >= item.from &&
    frame < item.from + item.durationInFrames,
  )
}

function hasItemChangeAtFrame(
  previousItems: TimelineItem[],
  nextItems: TimelineItem[],
  frame: number,
): boolean {
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const nextById = new Map(nextItems.map((item) => [item.id, item]))

  for (const [itemId, previousItem] of previousById) {
    const nextItem = nextById.get(itemId)
    if (
      nextItem !== previousItem &&
      (itemOccupiesFrame(previousItem, frame) || itemOccupiesFrame(nextItem, frame))
    ) {
      return true
    }
  }
  for (const [itemId, nextItem] of nextById) {
    if (!previousById.has(itemId) && itemOccupiesFrame(nextItem, frame)) {
      return true
    }
  }
  return false
}

interface UsePreviewRendererControllerParams {
  fps: number
  isResolving: boolean
  forceFastScrubOverlay: boolean
  preserveRendererAcrossOverlayRouting: boolean
  domTextScrubOverlayEnabled: boolean
  items: TimelineItem[]
  useProxy: boolean
  playerSize: { width: number; height: number }
  playerRenderSize: { width: number; height: number }
  renderSize: { width: number; height: number }
  fastScrubInputProps: CompositionInputProps
  fastScrubScaledTracks: CompositionInputProps['tracks']
  fastScrubScaledKeyframes: CompositionInputProps['keyframes']
  fastScrubRendererStructureKey: string
  isGizmoInteractingRef: { current: boolean }
  bypassPreviewSeekRef: { current: boolean }
  showFastScrubOverlayRef: { current: boolean }
  showPlaybackTransitionOverlayRef: { current: boolean }
  scrubCanvasRef: { current: HTMLCanvasElement | null }
  scrubRendererRef: { current: PreviewCompositionRenderer | null }
  ensureFastScrubRendererRef: { current: () => Promise<PreviewCompositionRenderer | null> }
  scrubInitPromiseRef: { current: Promise<PreviewCompositionRenderer | null> | null }
  scrubPreloadPromiseRef: { current: Promise<void> | null }
  scrubOffscreenCanvasRef: { current: OffscreenCanvas | null }
  scrubOffscreenCtxRef: { current: OffscreenCanvasRenderingContext2D | null }
  scrubRendererStructureKeyRef: { current: string | null }
  scrubRenderInFlightRef: { current: boolean }
  scrubRenderGenerationRef: { current: number }
  scrubRequestedFrameRef: { current: number | null }
  bgTransitionRendererRef: { current: PreviewCompositionRenderer | null }
  bgTransitionInitPromiseRef: { current: Promise<PreviewCompositionRenderer | null> | null }
  bgTransitionRendererStructureKeyRef: { current: string | null }
  bgTransitionRenderInFlightRef: { current: boolean }
  scrubPrewarmQueueRef: { current: number[] }
  scrubPrewarmQueuedSetRef: { current: Set<number> }
  scrubPrewarmedFramesRef: { current: number[] }
  scrubPrewarmedFrameSetRef: { current: Set<number> }
  scrubPrewarmedSourcesRef: { current: Set<string> }
  scrubPrewarmedSourceOrderRef: { current: string[] }
  scrubPrewarmedSourceTouchFrameRef: { current: Map<string, number> }
  scrubOffscreenRenderedFrameRef: { current: number | null }
  committedPreviewSnapshotRef: { current: CommittedPreviewSnapshotState }
  playbackTransitionPreparePromiseRef: { current: Promise<boolean> | null }
  playbackTransitionPreparingFrameRef: { current: number | null }
  deferredPlaybackTransitionPrepareFrameRef: { current: number | null }
  transitionPrepareTimeoutRef: { current: number | null }
  transitionSessionBufferedFramesRef: { current: Map<number, OffscreenCanvas> }
  captureCanvasSourceInFlightRef: {
    current: Promise<OffscreenCanvas | HTMLCanvasElement | null> | null
  }
  captureInFlightRef: { current: Promise<string | null> | null }
  captureImageDataInFlightRef: { current: Promise<ImageData | null> | null }
  captureScaleCanvasRef: { current: HTMLCanvasElement | null }
  resumeScrubLoopRef: { current: () => void }
  scrubMountedRef: { current: boolean }
  lastPausedPrearmTargetRef: { current: number | null }
  previewPerfRef: {
    current: {
      fastScrubPrewarmedSources: number
    }
  }
  getPreviewTransformOverride: (itemId: string) => Partial<ResolvedTransform> | undefined
  getPreviewEffectsOverride: (itemId: string) => ItemEffect[] | undefined
  getPreviewCornerPinOverride: (itemId: string) => TimelineItem['cornerPin'] | undefined
  getPreviewPathVerticesOverride: PreviewPathVerticesOverride
  getLivePlaybackFrame: () => number | null
  getLiveItemSnapshot: (itemId: string) => TimelineItem | undefined
  getLiveKeyframes: (itemId: string) => ItemKeyframes | undefined
  clearTransitionPlaybackSession: () => void
  resetResolveRetryState: () => void
  setCaptureFrame: (fn: ((options?: CaptureOptions) => Promise<string | null>) | null) => void
  setCaptureFrameImageData: (
    fn: ((options?: CaptureOptions) => Promise<ImageData | null>) | null,
  ) => void
  setCaptureCanvasSource: (
    fn: ((options?: CaptureOptions) => Promise<OffscreenCanvas | HTMLCanvasElement | null>) | null,
  ) => void
  setDisplayedFrame: (frame: number | null) => void
}

export function usePreviewRendererController(params: () => UsePreviewRendererControllerParams) {
  const {
    fps,
    isResolving,
    forceFastScrubOverlay,
    preserveRendererAcrossOverlayRouting,
    domTextScrubOverlayEnabled,
    items,
    useProxy,
    playerSize,
    playerRenderSize,
    renderSize,
    fastScrubInputProps,
    fastScrubScaledTracks,
    fastScrubScaledKeyframes,
    fastScrubRendererStructureKey,
    isGizmoInteractingRef,
    bypassPreviewSeekRef,
    showFastScrubOverlayRef,
    showPlaybackTransitionOverlayRef,
    scrubCanvasRef,
    scrubRendererRef,
    ensureFastScrubRendererRef,
    scrubInitPromiseRef,
    scrubPreloadPromiseRef,
    scrubOffscreenCanvasRef,
    scrubOffscreenCtxRef,
    scrubRendererStructureKeyRef,
    scrubRenderInFlightRef,
    scrubRenderGenerationRef,
    scrubRequestedFrameRef,
    bgTransitionRendererRef,
    bgTransitionInitPromiseRef,
    bgTransitionRendererStructureKeyRef,
    bgTransitionRenderInFlightRef,
    scrubPrewarmQueueRef,
    scrubPrewarmQueuedSetRef,
    scrubPrewarmedFramesRef,
    scrubPrewarmedFrameSetRef,
    scrubPrewarmedSourcesRef,
    scrubPrewarmedSourceOrderRef,
    scrubPrewarmedSourceTouchFrameRef,
    scrubOffscreenRenderedFrameRef,
    committedPreviewSnapshotRef,
    playbackTransitionPreparePromiseRef,
    playbackTransitionPreparingFrameRef,
    deferredPlaybackTransitionPrepareFrameRef,
    transitionPrepareTimeoutRef,
    transitionSessionBufferedFramesRef,
    captureCanvasSourceInFlightRef,
    captureInFlightRef,
    captureImageDataInFlightRef,
    captureScaleCanvasRef,
    resumeScrubLoopRef,
    scrubMountedRef,
    lastPausedPrearmTargetRef,
    previewPerfRef,
    getPreviewTransformOverride,
    getPreviewEffectsOverride,
    getPreviewCornerPinOverride,
    getPreviewPathVerticesOverride,
    getLivePlaybackFrame,
    getLiveItemSnapshot,
    getLiveKeyframes,
    clearTransitionPlaybackSession,
    resetResolveRetryState,
    setCaptureFrame,
    setCaptureFrameImageData,
    setCaptureCanvasSource,
    setDisplayedFrame,
  } = $derived(params())
  const previousVisualStateRef: {
    current: {
      tracks: CompositionInputProps['tracks']
      keyframes: CompositionInputProps['keyframes']
    }
  } = {
    current: {
      tracks: fastScrubScaledTracks,
      keyframes: fastScrubScaledKeyframes,
    },
  }
  const previousItemsRef = { current: items }
  const previousIsResolvingRef = { current: isResolving }
  const forceFastScrubOverlayRef = { current: forceFastScrubOverlay }
  $effect.pre(() => {
    forceFastScrubOverlayRef.current = forceFastScrubOverlay
  })
  const overlayRoutingResetKey = $derived(
    preserveRendererAcrossOverlayRouting ? false : forceFastScrubOverlay,
  )
  const pendingPostEditWarmRequestRef: { current: PostEditWarmRequest | null } = { current: null }
  const postEditWarmInFlightRef = { current: false }
  const liveScopeCaptureRendererRef: { current: PreviewCompositionRenderer | null } = {
    current: null,
  }
  const liveScopeCaptureInitPromiseRef: {
    current: Promise<PreviewCompositionRenderer | null> | null
  } = { current: null }
  const scrubInitGenerationRef = { current: 0 }
  const bgTransitionInitGenerationRef = { current: 0 }
  const liveScopeCaptureInitGenerationRef = { current: 0 }
  const liveScopeCaptureCanvasRef: { current: OffscreenCanvas | null } = { current: null }
  const liveScopeCaptureCtxRef: { current: OffscreenCanvasRenderingContext2D | null } = {
    current: null,
  }
  const liveScopeCaptureStructureKeyRef: { current: string | null } = { current: null }
  /**
   * Renders a frame from an effect. Deferred to a microtask, after the render pump's effect has
   * re-assigned resumeScrubLoopRef: an edit re-runs that too, and its teardown, which runs first,
   * leaves a no-op there that would silently drop the render.
   */
  const resumeScrubLoopAfterEffects = (targetFrame: number) => {
    queueMicrotask(() => {
      scrubRequestedFrameRef.current = targetFrame
      void resumeScrubLoopRef.current()
    })
  }
  const invalidateCommittedPreviewSnapshot = () => {
    const snapshot = committedPreviewSnapshotRef.current
    snapshot.frame = null
    snapshot.guardFrame = null
    snapshot.guardUntilMs = 0
  }

  $effect(() => {
    const canvas = scrubCanvasRef.current
    if (!canvas) return
    const backingSize = getPreviewDisplayCanvasBackingSize(playerSize, renderSize)
    if (canvas.width !== backingSize.width) canvas.width = backingSize.width
    if (canvas.height !== backingSize.height) canvas.height = backingSize.height
    if (!showFastScrubOverlayRef.current && !showPlaybackTransitionOverlayRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const committedSnapshot = committedPreviewSnapshotRef.current
    const playbackState = usePlaybackStore.getState()
    if (
      committedSnapshot.guardFrame !== null &&
      performance.now() > committedSnapshot.guardUntilMs
    ) {
      committedSnapshot.guardFrame = null
      committedSnapshot.guardUntilMs = 0
    }
    if (
      committedSnapshot.canvas &&
      committedSnapshot.frame !== null &&
      committedSnapshot.guardFrame === committedSnapshot.frame &&
      playbackState.previewFrame === null &&
      !playbackState.isPlaying &&
      playbackState.currentFrame === committedSnapshot.frame
    ) {
      // Resizing a canvas clears its backing store. During a committed-frame
      // scrub handoff, repaint from the immutable front-buffer snapshot rather
      // than the shared offscreen surface that a cancelled render may still be
      // clearing or mutating.
      drawSourceToPreviewDisplayCanvas(ctx, canvas, committedSnapshot.canvas)
      setDisplayedFrame(committedSnapshot.frame)
      return
    }
    const renderedFrame = scrubOffscreenRenderedFrameRef.current
    const offscreen = scrubOffscreenCanvasRef.current
    if (renderedFrame === null || !offscreen) return
    drawSourceToPreviewDisplayCanvas(ctx, canvas, offscreen)
    setDisplayedFrame(renderedFrame)
  })

  const disposeFastScrubRenderer = () => {
    // Any renderer disposal invalidates async pump work that may still be
    // awaiting the previous renderer. The replacement pump must never tag or
    // present pixels through that stale generation's shared refs.
    scrubRenderGenerationRef.current += 1
    scrubInitGenerationRef.current += 1
    bgTransitionInitGenerationRef.current += 1
    liveScopeCaptureInitGenerationRef.current += 1
    resetPlaybackStartReadiness()
    scrubInitPromiseRef.current = null
    scrubPreloadPromiseRef.current = null
    scrubRequestedFrameRef.current = null
    scrubPrewarmQueueRef.current = []
    scrubPrewarmQueuedSetRef.current.clear()
    scrubPrewarmedFramesRef.current = []
    scrubPrewarmedFrameSetRef.current.clear()
    scrubPrewarmedSourcesRef.current.clear()
    scrubPrewarmedSourceOrderRef.current = []
    scrubPrewarmedSourceTouchFrameRef.current.clear()
    scrubOffscreenRenderedFrameRef.current = null
    playbackTransitionPreparePromiseRef.current = null
    playbackTransitionPreparingFrameRef.current = null
    deferredPlaybackTransitionPrepareFrameRef.current = null
    if (transitionPrepareTimeoutRef.current !== null) {
      clearTimeout(transitionPrepareTimeoutRef.current)
      transitionPrepareTimeoutRef.current = null
    }
    clearTransitionPlaybackSession()
    captureCanvasSourceInFlightRef.current = null
    previewPerfRef.current.fastScrubPrewarmedSources = 0
    bypassPreviewSeekRef.current = false

    if (scrubRendererRef.current) {
      try {
        scrubRendererRef.current.dispose()
      } catch (error) {
        logger.warn('Failed to dispose renderer:', error)
      }
      scrubRendererRef.current = null
      setActivePreviewScrubbingCache(null)
    }
    scrubRendererStructureKeyRef.current = null

    scrubOffscreenCanvasRef.current = null
    scrubOffscreenCtxRef.current = null

    if (bgTransitionRendererRef.current) {
      try {
        bgTransitionRendererRef.current.dispose()
      } catch {
        // Best effort.
      }
      bgTransitionRendererRef.current = null
    }
    bgTransitionRendererStructureKeyRef.current = null
    bgTransitionInitPromiseRef.current = null
    bgTransitionRenderInFlightRef.current = false

    if (liveScopeCaptureRendererRef.current) {
      try {
        liveScopeCaptureRendererRef.current.dispose()
      } catch {
        // Best effort.
      }
      liveScopeCaptureRendererRef.current = null
    }
    liveScopeCaptureInitPromiseRef.current = null
    liveScopeCaptureCanvasRef.current = null
    liveScopeCaptureCtxRef.current = null
    liveScopeCaptureStructureKeyRef.current = null
  }

  const ensureLiveScopeCaptureRenderer = async () => {
    if (!FAST_SCRUB_RENDERER_ENABLED) return null
    if (typeof OffscreenCanvas === 'undefined') return null
    if (isResolving) return null
    if (
      liveScopeCaptureRendererRef.current &&
      liveScopeCaptureStructureKeyRef.current !== fastScrubRendererStructureKey
    ) {
      liveScopeCaptureInitGenerationRef.current += 1
      try {
        liveScopeCaptureRendererRef.current.dispose()
      } catch {
        // Best effort.
      }
      liveScopeCaptureRendererRef.current = null
      liveScopeCaptureCanvasRef.current = null
      liveScopeCaptureCtxRef.current = null
      liveScopeCaptureStructureKeyRef.current = null
    }
    if (liveScopeCaptureRendererRef.current) return liveScopeCaptureRendererRef.current
    if (liveScopeCaptureInitPromiseRef.current) return liveScopeCaptureInitPromiseRef.current

    const initGeneration = liveScopeCaptureInitGenerationRef.current
    let initPromise!: Promise<PreviewCompositionRenderer | null>
    initPromise = (async () => {
      try {
        const offscreen = new OffscreenCanvas(renderSize.width, renderSize.height)
        const offscreenCtx = offscreen.getContext('2d')
        if (!offscreenCtx) return null
        const { createCompositionRenderer } = await importCompositionRenderer()
        const renderer = await createCompositionRenderer(
          fastScrubInputProps,
          offscreen,
          offscreenCtx,
          {
            mode: 'preview',
            useProxyMedia: useProxy,
            getPreviewTransformOverride,
            getPreviewEffectsOverride,
            getPreviewCornerPinOverride,
            getPreviewPathVerticesOverride,
            getLiveItemSnapshot,
            getLiveKeyframes,
          },
        )
        if (liveScopeCaptureInitGenerationRef.current !== initGeneration) {
          renderer.dispose()
          return null
        }
        liveScopeCaptureCanvasRef.current = offscreen
        liveScopeCaptureCtxRef.current = offscreenCtx
        liveScopeCaptureRendererRef.current = renderer
        liveScopeCaptureStructureKeyRef.current = fastScrubRendererStructureKey
        if ('warmGpuPipeline' in renderer) {
          void renderer.warmGpuPipeline()
        }
        return renderer
      } catch (error) {
        logger.warn('Failed to initialize live scope capture renderer:', error)
        if (liveScopeCaptureInitGenerationRef.current === initGeneration) {
          liveScopeCaptureRendererRef.current = null
          liveScopeCaptureCanvasRef.current = null
          liveScopeCaptureCtxRef.current = null
          liveScopeCaptureStructureKeyRef.current = null
        }
        return null
      } finally {
        if (liveScopeCaptureInitPromiseRef.current === initPromise) {
          liveScopeCaptureInitPromiseRef.current = null
        }
      }
    })()
    liveScopeCaptureInitPromiseRef.current = initPromise

    return initPromise
  }

  const ensureBgTransitionRenderer = async (): Promise<PreviewCompositionRenderer | null> => {
    if (!FAST_SCRUB_RENDERER_ENABLED || typeof OffscreenCanvas === 'undefined' || isResolving)
      return null
    if (
      bgTransitionRendererRef.current &&
      bgTransitionRendererStructureKeyRef.current !== fastScrubRendererStructureKey
    ) {
      disposeFastScrubRenderer()
    }
    if (bgTransitionRendererRef.current) return bgTransitionRendererRef.current
    if (bgTransitionInitPromiseRef.current) return bgTransitionInitPromiseRef.current

    const initGeneration = bgTransitionInitGenerationRef.current
    let initPromise!: Promise<PreviewCompositionRenderer | null>
    initPromise = (async () => {
      try {
        const canvas = new OffscreenCanvas(renderSize.width, renderSize.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        const { createCompositionRenderer } = await importCompositionRenderer()
        const renderer = await createCompositionRenderer(fastScrubInputProps, canvas, ctx, {
          mode: 'preview',
          useProxyMedia: useProxy,
          getPreviewTransformOverride,
          getPreviewEffectsOverride,
          getPreviewCornerPinOverride,
          getPreviewPathVerticesOverride,
          getLiveItemSnapshot,
          getLiveKeyframes,
          renderText: !domTextScrubOverlayEnabled,
        })
        if (bgTransitionInitGenerationRef.current !== initGeneration) {
          renderer.dispose()
          return null
        }
        if ('warmGpuPipeline' in renderer) {
          void renderer.warmGpuPipeline()
        }
        bgTransitionRendererRef.current = renderer
        bgTransitionRendererStructureKeyRef.current = fastScrubRendererStructureKey
        return renderer
      } catch {
        return null
      } finally {
        if (bgTransitionInitPromiseRef.current === initPromise) {
          bgTransitionInitPromiseRef.current = null
        }
      }
    })()
    bgTransitionInitPromiseRef.current = initPromise
    return initPromise
  }

  const ensureFastScrubRenderer = async (): Promise<PreviewCompositionRenderer | null> => {
    if (!FAST_SCRUB_RENDERER_ENABLED) return null
    if (typeof OffscreenCanvas === 'undefined') return null
    if (isResolving) return null
    if (
      scrubRendererRef.current &&
      scrubRendererStructureKeyRef.current !== fastScrubRendererStructureKey
    ) {
      disposeFastScrubRenderer()
    }
    if (scrubRendererRef.current) return scrubRendererRef.current
    if (scrubInitPromiseRef.current) return scrubInitPromiseRef.current

    markPlaybackStartReadiness({
      rendererInitStartedMs: performance.now(),
      rendererReadyMs: null,
      rendererInitFailedMs: null,
      rendererPreloadStartedMs: null,
      rendererPriorityMediaReadyMs: null,
      rendererPreloadFinishedMs: null,
      lookaheadFrame: null,
      lookaheadOrigin: null,
      lookaheadReadyMs: null,
    })
    const initGeneration = scrubInitGenerationRef.current
    let initPromise!: Promise<PreviewCompositionRenderer | null>
    initPromise = (async () => {
      try {
        const offscreen = new OffscreenCanvas(renderSize.width, renderSize.height)
        const offscreenCtx = offscreen.getContext('2d')
        if (!offscreenCtx) return null

        const { createCompositionRenderer } = await importCompositionRenderer()
        const renderer = await createCompositionRenderer(
          fastScrubInputProps,
          offscreen,
          offscreenCtx,
          {
            mode: 'preview',
            useProxyMedia: useProxy,
            getPreviewTransformOverride,
            getPreviewEffectsOverride,
            getPreviewCornerPinOverride,
            getPreviewPathVerticesOverride,
            getLiveItemSnapshot,
            getLiveKeyframes,
            renderText: !domTextScrubOverlayEnabled,
          },
        )
        if (scrubInitGenerationRef.current !== initGeneration) {
          renderer.dispose()
          return null
        }
        scrubOffscreenCanvasRef.current = offscreen
        scrubOffscreenCtxRef.current = offscreenCtx
        scrubOffscreenRenderedFrameRef.current = null
        scrubRendererRef.current = renderer
        scrubRendererStructureKeyRef.current = fastScrubRendererStructureKey
        markPlaybackStartReadiness({ rendererReadyMs: performance.now() })
        setActivePreviewScrubbingCache(
          'getScrubbingCache' in renderer ? renderer.getScrubbingCache() : null,
        )
        if ('warmGpuPipeline' in renderer) {
          void renderer.warmGpuPipeline()
        }

        const playbackState = usePlaybackStore.getState()
        const runtimeSnapshot = getPreviewRuntimeSnapshotFromPlaybackState(
          playbackState,
          isGizmoInteractingRef.current,
        )
        const preloadPriorityFrame = runtimeSnapshot.anchorFrame
        // Invalidate the current frame and re-request a render. Used both
        // after priority media is ready (earlier, partial preload) and after
        // full preload completes, so the real video + GPU effects appear
        // without needing a manual scrub. Idempotent.
        const kickRerender = () => {
          if (scrubRendererRef.current !== renderer) return
          const playbackState = usePlaybackStore.getState()
          const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame
          try {
            renderer.invalidateFrameCache({ frames: [targetFrame] })
          } catch {
            return
          }
          if (scrubOffscreenRenderedFrameRef.current === targetFrame) {
            scrubOffscreenRenderedFrameRef.current = null
          }
          scrubRequestedFrameRef.current = targetFrame
          void resumeScrubLoopRef.current()
        }

        markPlaybackStartReadiness({ rendererPreloadStartedMs: performance.now() })
        const onPriorityMediaReady = () => {
          markPlaybackStartReadiness({ rendererPriorityMediaReadyMs: performance.now() })
          kickRerender()
        }
        const preloadPromise = renderer
          .preload({
            priorityFrame: preloadPriorityFrame,
            priorityWindowFrames: Math.max(12, Math.round(fps * 4)),
            onPriorityMediaReady,
          })
          .catch((error) => {
            logger.warn('Renderer preload failed:', error)
          })
          .finally(() => {
            markPlaybackStartReadiness({ rendererPreloadFinishedMs: performance.now() })
            if (scrubPreloadPromiseRef.current === preloadPromise) {
              scrubPreloadPromiseRef.current = null
            }
            kickRerender()
          })
        scrubPreloadPromiseRef.current = preloadPromise
        void Promise.race([
          preloadPromise,
          new Promise<void>((resolve) => {
            setTimeout(resolve, FAST_SCRUB_PRELOAD_BUDGET_MS)
          }),
        ])
        return renderer
      } catch (error) {
        logger.warn('Failed to initialize renderer, falling back to Player seeks:', error)
        if (scrubInitGenerationRef.current === initGeneration) {
          markPlaybackStartReadiness({ rendererInitFailedMs: performance.now() })
          scrubRendererRef.current = null
          setActivePreviewScrubbingCache(null)
          scrubOffscreenCanvasRef.current = null
          scrubOffscreenCtxRef.current = null
          scrubOffscreenRenderedFrameRef.current = null
        }
        return null
      } finally {
        if (scrubInitPromiseRef.current === initPromise) {
          scrubInitPromiseRef.current = null
        }
      }
    })()
    scrubInitPromiseRef.current = initPromise

    return initPromise
  }
  ensureFastScrubRendererRef.current = ensureFastScrubRenderer

  // Captures share the offscreen canvas (and renderer) with the render pump.
  // Sampling the canvas mid-render flashes half-composited frames into the
  // scopes, and a second concurrent renderFrame call interleaves with the
  // pump's (single-mutex invariant — see render-loop concurrency notes in
  // CLAUDE.md). This helper briefly waits for the pump to go idle, runs `fn`
  // while holding the pump's mutex through completion; on timeout it returns
  // null rather than racing the visible render path.
  const withScrubRenderLock = async <T>(
    fn: () => Promise<T | null> | T | null,
  ): Promise<T | null> => {
    const deadline = performance.now() + CAPTURE_RENDER_LOCK_WAIT_MS
    while (scrubRenderInFlightRef.current) {
      if (performance.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, CAPTURE_RENDER_LOCK_POLL_MS))
    }
    // The idle check and acquisition run in the same synchronous step, so
    // no pump iteration can grab the lock in between.
    scrubRenderInFlightRef.current = true
    try {
      return await fn()
    } finally {
      // Playback invalidation never transfers this mutex early. The capture
      // remains the sole owner until `fn` completes, even across a play or
      // pause transition, so releasing here cannot race a second renderer.
      scrubRenderInFlightRef.current = false
      // A pump kick that arrived while we held the lock returned early —
      // resume it so the overlay never sticks on a stale frame.
      if (scrubRequestedFrameRef.current !== null) {
        resumeScrubLoopRef.current()
      }
    }
  }

  const renderOffscreenFrame = async (
    targetFrame: number,
    options: { useLiveDomProvider?: boolean } = {},
  ): Promise<OffscreenCanvas | null> => {
    if (domTextScrubOverlayEnabled) {
      const renderer = await ensureLiveScopeCaptureRenderer()
      const offscreen = liveScopeCaptureCanvasRef.current
      if (!renderer || !offscreen) return null
      const useLiveDomProvider = options.useLiveDomProvider ?? true
      if ('setDomVideoElementProvider' in renderer) {
        renderer.setDomVideoElementProvider?.(
          useLiveDomProvider && usePlaybackStore.getState().isPlaying
            ? getBestDomVideoElementForItem
            : undefined,
        )
      }
      await renderer.renderFrame(targetFrame)
      if (wasRendererFrameAborted(renderer)) return null
      return offscreen
    }

    // Renderer init is slow — make sure it exists before taking the lock.
    if (
      scrubOffscreenRenderedFrameRef.current !== targetFrame ||
      !scrubOffscreenCanvasRef.current
    ) {
      const renderer = await ensureFastScrubRenderer()
      if (!renderer || !scrubOffscreenCanvasRef.current) return null
    }

    const useLiveDomProvider = options.useLiveDomProvider ?? true
    const isPlayingForCapture = useLiveDomProvider && usePlaybackStore.getState().isPlaying
    return withScrubRenderLock(async () => {
      const offscreen = scrubOffscreenCanvasRef.current
      if (!offscreen) return null
      const renderer = scrubRendererRef.current
      if (!renderer) return null
      if ('setDomVideoElementProvider' in renderer) {
        renderer.setDomVideoElementProvider?.(
          isPlayingForCapture ? getBestDomVideoElementForItem : undefined,
        )
      }
      if (scrubOffscreenRenderedFrameRef.current !== targetFrame || isPlayingForCapture) {
        await renderer.renderFrame(targetFrame)
        if (wasRendererFrameAborted(renderer)) {
          scrubOffscreenRenderedFrameRef.current = null
          return null
        }
        scrubOffscreenRenderedFrameRef.current = targetFrame
      }
      return offscreen
    })
  }

  $effect(() => {
    void [
      fastScrubRendererStructureKey,
      overlayRoutingResetKey,
      renderSize.height,
      renderSize.width,
    ]

    const hadRenderer =
      scrubRendererRef.current !== null || bgTransitionRendererRef.current !== null
    if (hadRenderer) {
      invalidateCommittedPreviewSnapshot()
    }
    disposeFastScrubRenderer()

    if (!hadRenderer) {
      return
    }

    const playbackState = usePlaybackStore.getState()
    const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame
    if (
      forceFastScrubOverlayRef.current ||
      playbackState.previewFrame !== null ||
      showFastScrubOverlayRef.current ||
      showPlaybackTransitionOverlayRef.current
    ) {
      resumeScrubLoopAfterEffects(targetFrame)
    }
  })

  $effect(() => {
    const previousVisualState = previousVisualStateRef.current
    previousVisualStateRef.current = {
      tracks: fastScrubScaledTracks,
      keyframes: fastScrubScaledKeyframes,
    }

    const visualInvalidationRanges = collectVisualInvalidationRanges({
      previousTracks: previousVisualState.tracks,
      nextTracks: fastScrubScaledTracks,
      previousKeyframes: previousVisualState.keyframes,
      nextKeyframes: fastScrubScaledKeyframes,
    })
    if (visualInvalidationRanges.length === 0) {
      return
    }

    const snapshotFrame = committedPreviewSnapshotRef.current.frame
    if (snapshotFrame !== null && isFrameInRanges(snapshotFrame, visualInvalidationRanges)) {
      invalidateCommittedPreviewSnapshot()
    }

    const scrubRenderer = scrubRendererRef.current
    const bgRenderer = bgTransitionRendererRef.current
    const scrubRendererMatchesStructure =
      scrubRendererStructureKeyRef.current === fastScrubRendererStructureKey
    const bgRendererMatchesStructure =
      bgTransitionRendererStructureKeyRef.current === fastScrubRendererStructureKey

    if (!scrubRendererMatchesStructure && !bgRendererMatchesStructure) {
      return
    }

    const invalidationRequest = { ranges: visualInvalidationRanges }
    if (scrubRenderer && scrubRendererMatchesStructure) {
      scrubRenderer.invalidateFrameCache(invalidationRequest)
    }
    if (bgRenderer && bgRendererMatchesStructure) {
      bgRenderer.invalidateFrameCache(invalidationRequest)
    }

    const playbackState = usePlaybackStore.getState()
    const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame
    const currentFrameInvalidated = isFrameInRanges(targetFrame, visualInvalidationRanges)

    if (
      scrubOffscreenRenderedFrameRef.current !== null &&
      isFrameInRanges(scrubOffscreenRenderedFrameRef.current, visualInvalidationRanges)
    ) {
      scrubOffscreenRenderedFrameRef.current = null
    }

    let removedBufferedFrame = false
    for (const frame of [...transitionSessionBufferedFramesRef.current.keys()]) {
      if (!isFrameInRanges(frame, visualInvalidationRanges)) continue
      transitionSessionBufferedFramesRef.current.delete(frame)
      removedBufferedFrame = true
    }
    if (removedBufferedFrame) {
      lastPausedPrearmTargetRef.current = null
    }

    if (
      scrubRenderer &&
      scrubRendererMatchesStructure &&
      currentFrameInvalidated &&
      (forceFastScrubOverlay ||
        playbackState.previewFrame !== null ||
        showFastScrubOverlayRef.current ||
        showPlaybackTransitionOverlayRef.current)
    ) {
      resumeScrubLoopAfterEffects(targetFrame)
    }
  })

  $effect(() => {
    const wasResolving = previousIsResolvingRef.current
    previousIsResolvingRef.current = isResolving

    if (isResolving || !wasResolving) {
      return
    }

    const playbackState = usePlaybackStore.getState()
    const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame
    const needsRenderedFrame =
      forceFastScrubOverlay ||
      playbackState.previewFrame !== null ||
      showFastScrubOverlayRef.current ||
      showPlaybackTransitionOverlayRef.current

    if (!needsRenderedFrame) {
      return
    }

    resumeScrubLoopAfterEffects(targetFrame)
  })

  $effect(() => {
    const previousItems = previousItemsRef.current
    previousItemsRef.current = items

    if (previousItems === items) {
      return
    }

    const snapshotFrame = committedPreviewSnapshotRef.current.frame
    if (snapshotFrame !== null && hasItemChangeAtFrame(previousItems, items, snapshotFrame)) {
      invalidateCommittedPreviewSnapshot()
    }

    const scrubRenderer = scrubRendererRef.current
    const scrubRendererMatchesStructure =
      scrubRendererStructureKeyRef.current === fastScrubRendererStructureKey
    if (!scrubRenderer || !scrubRendererMatchesStructure) {
      return
    }

    const playbackState = usePlaybackStore.getState()
    const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame
    const needsRenderedFrame =
      forceFastScrubOverlay ||
      playbackState.previewFrame !== null ||
      showFastScrubOverlayRef.current ||
      showPlaybackTransitionOverlayRef.current

    if (!needsRenderedFrame) {
      return
    }

    scrubRenderer.invalidateFrameCache({ frames: [targetFrame] })
    if (scrubOffscreenRenderedFrameRef.current === targetFrame) {
      scrubOffscreenRenderedFrameRef.current = null
    }
    resumeScrubLoopAfterEffects(targetFrame)
  })

  $effect(() => {
    void [fastScrubRendererStructureKey, forceFastScrubOverlay]

    const computeChangedCompositionIds = (
      nextById: Record<string, SubComposition>,
      prevById: Record<string, SubComposition>,
    ): Set<string> => {
      const changed = new Set<string>()
      for (const id of Object.keys(nextById)) {
        if (nextById[id] !== prevById[id]) changed.add(id)
      }
      for (const id of Object.keys(prevById)) {
        if (!(id in nextById)) changed.add(id)
      }
      return changed
    }

    const invalidateForChangedCompositions = (changedIds: Set<string>) => {
      const scrubRenderer = scrubRendererRef.current
      const bgRenderer = bgTransitionRendererRef.current
      const scrubRendererMatchesStructure =
        scrubRendererStructureKeyRef.current === fastScrubRendererStructureKey
      const bgRendererMatchesStructure =
        bgTransitionRendererStructureKeyRef.current === fastScrubRendererStructureKey

      const playbackState = usePlaybackStore.getState()
      const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame

      // Read the latest items directly — when exitComposition fires, this
      // subscription runs synchronously inside saveCurrentToComposition,
      // before restoreTimeline updates the items store. Reading from the
      // closure would see stale sub-comp items. The microtask defer below
      // handles the ordering, but we still read live to be safe.
      const currentItems = useItemsStore.getState().items
      const ranges: FrameRange[] = []
      for (const compItem of currentItems) {
        if (compItem.type !== 'composition') continue
        if (!changedIds.has(compItem.compositionId)) continue
        ranges.push({
          startFrame: compItem.from,
          endFrame: compItem.from + compItem.durationInFrames,
        })
      }

      const normalized = normalizeFrameRanges(ranges)
      const request: FrameInvalidationRequest =
        normalized.length > 0 ? { ranges: normalized } : { frames: [targetFrame] }
      const snapshotFrame = committedPreviewSnapshotRef.current.frame
      if (
        snapshotFrame !== null &&
        (normalized.length === 0 || isFrameInRanges(snapshotFrame, normalized))
      ) {
        invalidateCommittedPreviewSnapshot()
      }
      if (!scrubRenderer && !bgRenderer) return

      if (scrubRenderer && scrubRendererMatchesStructure) {
        scrubRenderer.invalidateFrameCache(request)
      }
      if (bgRenderer && bgRendererMatchesStructure) {
        bgRenderer.invalidateFrameCache(request)
      }

      const currentFrameInvalidated =
        normalized.length === 0 || isFrameInRanges(targetFrame, normalized)
      if (currentFrameInvalidated && scrubOffscreenRenderedFrameRef.current === targetFrame) {
        scrubOffscreenRenderedFrameRef.current = null
      }

      const needsRenderedFrame =
        forceFastScrubOverlay ||
        playbackState.previewFrame !== null ||
        showFastScrubOverlayRef.current ||
        showPlaybackTransitionOverlayRef.current
      if (!needsRenderedFrame || !currentFrameInvalidated) return

      scrubRequestedFrameRef.current = targetFrame
      void resumeScrubLoopRef.current()
    }

    let pendingMicrotask = false
    const pendingChangedIds = new Set<string>()

    const unsubCompositions = useCompositionsStore.subscribe((state, prev) => {
      if (state.compositionById === prev.compositionById) return
      const changedIds = computeChangedCompositionIds(state.compositionById, prev.compositionById)
      if (changedIds.size === 0) return
      for (const id of changedIds) pendingChangedIds.add(id)

      if (pendingMicrotask) return
      pendingMicrotask = true
      queueMicrotask(() => {
        pendingMicrotask = false
        const batchedIds = new Set(pendingChangedIds)
        pendingChangedIds.clear()
        if (batchedIds.size === 0) return
        invalidateForChangedCompositions(batchedIds)
      })
    })

    // On composition navigation (enter/exit/navigate), the tracks topology
    // swaps wholesale. The dispose useEffect recreates the renderer on the
    // structure-key change, but its render pump can race with Zustand's
    // batched items/tracks updates. Queue an explicit invalidation in a
    // microtask so the pump sees the fully restored timeline before it
    // re-renders the current frame.
    const unsubNav = useCompositionNavigationStore.subscribe((state, prev) => {
      if (
        state.activeCompositionId === prev.activeCompositionId &&
        state.breadcrumbs === prev.breadcrumbs
      ) {
        return
      }
      invalidateCommittedPreviewSnapshot()
      queueMicrotask(() => {
        const scrubRenderer = scrubRendererRef.current
        const bgRenderer = bgTransitionRendererRef.current
        const playbackState = usePlaybackStore.getState()
        const targetFrame = playbackState.previewFrame ?? playbackState.currentFrame

        if (
          scrubRenderer &&
          scrubRendererStructureKeyRef.current === fastScrubRendererStructureKey
        ) {
          scrubRenderer.invalidateFrameCache({ frames: [targetFrame] })
        }
        if (
          bgRenderer &&
          bgTransitionRendererStructureKeyRef.current === fastScrubRendererStructureKey
        ) {
          bgRenderer.invalidateFrameCache({ frames: [targetFrame] })
        }
        if (scrubOffscreenRenderedFrameRef.current === targetFrame) {
          scrubOffscreenRenderedFrameRef.current = null
        }

        const needsRenderedFrame =
          forceFastScrubOverlay ||
          playbackState.previewFrame !== null ||
          showFastScrubOverlayRef.current ||
          showPlaybackTransitionOverlayRef.current
        if (!needsRenderedFrame) return

        scrubRequestedFrameRef.current = targetFrame
        void resumeScrubLoopRef.current()
      })
    })

    return () => {
      unsubCompositions()
      unsubNav()
    }
  })

  $effect(() => {
    void [isResolving]

    const flushPostEditWarmRequest = async () => {
      if (postEditWarmInFlightRef.current) {
        return
      }

      postEditWarmInFlightRef.current = true
      try {
        while (pendingPostEditWarmRequestRef.current) {
          const request = pendingPostEditWarmRequestRef.current
          pendingPostEditWarmRequestRef.current = null

          const playbackState = usePlaybackStore.getState()
          if (isResolving || playbackState.isPlaying || playbackState.previewFrame !== null) {
            continue
          }

          const renderer = await ensureFastScrubRenderer()
          if (!renderer) {
            continue
          }

          try {
            const framesToWarm = request.frames.length > 0 ? request.frames : [request.frame]
            const warmRunwayFrames = Array.from(
              new Set(
                [
                  ...framesToWarm,
                  request.frame - 2,
                  request.frame - 1,
                  request.frame + 1,
                  request.frame + 2,
                ].filter((frame) => frame >= 0),
              ),
            )

            const shouldResumeRenderPump = await withScrubRenderLock(async () => {
              const playbackBeforeWarm = usePlaybackStore.getState()
              if (
                scrubRendererRef.current !== renderer ||
                isResolving ||
                playbackBeforeWarm.isPlaying ||
                playbackBeforeWarm.previewFrame !== null ||
                playbackBeforeWarm.currentFrame !== request.frame
              ) {
                return null
              }

              if ('prewarmFrames' in renderer && warmRunwayFrames.length > 0) {
                await renderer.prewarmFrames?.(warmRunwayFrames)
              }
              if ('prewarmItems' in renderer && request.itemIds.length > 0) {
                await renderer.prewarmItems?.(request.itemIds, request.frame)
              }

              const playbackAfterWarm = usePlaybackStore.getState()
              if (
                scrubRendererRef.current !== renderer ||
                isResolving ||
                playbackAfterWarm.isPlaying ||
                playbackAfterWarm.previewFrame !== null ||
                playbackAfterWarm.currentFrame !== request.frame
              ) {
                return null
              }

              if (scrubOffscreenRenderedFrameRef.current !== request.frame) {
                // Only the render pump may render into and tag the shared
                // offscreen surface. A warm request can outlive an edit and
                // overlap a ruler skim; rendering here would let both owners
                // clear the same canvas and publish a black/stale frame.
                scrubRequestedFrameRef.current = request.frame
                return true
              }
              return false
            })
            if (shouldResumeRenderPump) {
              void resumeScrubLoopRef.current()
            }
          } catch {
            // Best effort only.
          }
        }
      } finally {
        postEditWarmInFlightRef.current = false
        if (pendingPostEditWarmRequestRef.current) {
          void flushPostEditWarmRequest()
        }
      }
    }

    return usePreviewBridgeStore.subscribe((state, prev) => {
      if (state.postEditWarmRequest === prev.postEditWarmRequest || !state.postEditWarmRequest) {
        return
      }
      const request = state.postEditWarmRequest
      pendingPostEditWarmRequestRef.current = request
      void flushPostEditWarmRequest()
    })
  })

  const resolveCaptureTargetFrame = (options?: CaptureOptions) => {
    const playback = usePlaybackStore.getState()
    if (options?.preferRenderedFrame) {
      if (playback.isPlaying) {
        return resolvePreviewCaptureFrame({
          currentFrame: playback.currentFrame,
          previewFrame: playback.previewFrame,
          isPlaying: playback.isPlaying,
          livePlaybackFrame: getLivePlaybackFrame(),
        })
      }

      const displayedFrame = usePreviewBridgeStore.getState().displayedFrame
      if (displayedFrame !== null) {
        return Math.max(0, Math.round(displayedFrame))
      }
      const renderedFrame = playback.previewFrame ?? playback.currentFrame
      return Math.max(0, Math.round(renderedFrame))
    }

    return resolvePreviewCaptureFrame({
      currentFrame: playback.currentFrame,
      previewFrame: playback.previewFrame,
      isPlaying: playback.isPlaying,
      livePlaybackFrame: playback.isPlaying ? getLivePlaybackFrame() : null,
    })
  }

  const captureDisplaySnapshotCanvasRef: { current: OffscreenCanvas | null } = { current: null }
  const captureLiveScopeSnapshotCanvasRef: { current: OffscreenCanvas | null } = { current: null }

  const captureRenderedDisplaySnapshot = (options?: CaptureOptions): OffscreenCanvas | null => {
    if (domTextScrubOverlayEnabled) return null
    if (!options?.preferRenderedFrame || !usePlaybackStore.getState().isPlaying) {
      return null
    }
    if (usePreviewBridgeStore.getState().displayedFrame === null) {
      return null
    }
    const displayCanvas = scrubCanvasRef.current
    if (!displayCanvas || displayCanvas.width <= 0 || displayCanvas.height <= 0) {
      return null
    }

    const targetWidth = Math.max(1, playerRenderSize.width)
    const targetHeight = Math.max(1, playerRenderSize.height)

    let snapshot = captureDisplaySnapshotCanvasRef.current
    if (!snapshot || snapshot.width !== targetWidth || snapshot.height !== targetHeight) {
      snapshot = new OffscreenCanvas(targetWidth, targetHeight)
      captureDisplaySnapshotCanvasRef.current = snapshot
    }
    const snapshotCtx = snapshot.getContext('2d')
    if (!snapshotCtx) return null
    copyPreviewDisplayCanvasContent(displayCanvas, snapshotCtx)
    return snapshot
  }

  const captureLiveScopeRenderedSnapshot = async (
    options?: CaptureOptions,
  ): Promise<OffscreenCanvas | null> => {
    const playback = usePlaybackStore.getState()
    if (!options?.preferRenderedFrame || !playback.isPlaying) {
      return null
    }
    const targetFrame = resolveCaptureTargetFrame(options)
    const renderer = await ensureLiveScopeCaptureRenderer()
    const offscreen = liveScopeCaptureCanvasRef.current
    if (!renderer || !offscreen) return null

    if ('setDomVideoElementProvider' in renderer) {
      renderer.setDomVideoElementProvider?.(getBestDomVideoElementForItem)
    }
    await renderer.renderFrame(targetFrame)
    if (wasRendererFrameAborted(renderer)) return null

    let snapshot = captureLiveScopeSnapshotCanvasRef.current
    if (!snapshot || snapshot.width !== offscreen.width || snapshot.height !== offscreen.height) {
      snapshot = new OffscreenCanvas(offscreen.width, offscreen.height)
      captureLiveScopeSnapshotCanvasRef.current = snapshot
    }
    const snapshotCtx = snapshot.getContext('2d')
    if (!snapshotCtx) return null
    snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height)
    snapshotCtx.drawImage(offscreen, 0, 0)
    return snapshot
  }

  const captureCurrentFrame = async (options?: CaptureOptions): Promise<string | null> => {
    if (captureInFlightRef.current) {
      if (options?.fresh) {
        await captureInFlightRef.current.catch(() => null)
      } else {
        return captureInFlightRef.current
      }
    }

    if (captureInFlightRef.current) {
      return captureInFlightRef.current
    }

    const task = (async () => {
      try {
        const targetFrame = resolveCaptureTargetFrame(options)
        const offscreen =
          (await captureLiveScopeRenderedSnapshot(options)) ??
          captureRenderedDisplaySnapshot(options) ??
          (await renderOffscreenFrame(targetFrame, {
            useLiveDomProvider:
              !options?.preferRenderedFrame || usePlaybackStore.getState().isPlaying,
          }))
        if (!offscreen) return null

        const format = options?.format ?? 'image/jpeg'
        const quality = options?.quality ?? 0.9
        const targetWidth = Math.max(2, Math.round(options?.width ?? offscreen.width))
        const targetHeight = Math.max(2, Math.round(options?.height ?? offscreen.height))
        const shouldScale =
          !options?.fullResolution &&
          (targetWidth !== offscreen.width || targetHeight !== offscreen.height)

        if (!shouldScale) {
          const blob = await offscreen.convertToBlob({
            type: format,
            quality,
          })
          return blobToDataUrl(blob)
        }

        // Progressive half-downscale to avoid aliasing/moire with
        // high-frequency GPU effects (halftone, pixelate, etc.)
        let srcW = offscreen.width
        let srcH = offscreen.height
        let source: CanvasImageSource = offscreen
        while (srcW > targetWidth * 2 || srcH > targetHeight * 2) {
          const halfW = Math.max(targetWidth, Math.ceil(srcW / 2))
          const halfH = Math.max(targetHeight, Math.ceil(srcH / 2))
          const step = document.createElement('canvas')
          step.width = halfW
          step.height = halfH
          const stepCtx = step.getContext('2d')
          if (!stepCtx) break
          stepCtx.drawImage(source, 0, 0, halfW, halfH)
          source = step
          srcW = halfW
          srcH = halfH
        }

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) return null

        ctx2d.drawImage(source, 0, 0, targetWidth, targetHeight)
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, format, quality)
        })
        if (!blob) return null
        return blobToDataUrl(blob)
      } catch (error) {
        logger.warn('Failed to capture frame:', error)
        return null
      } finally {
        captureInFlightRef.current = null
      }
    })()

    captureInFlightRef.current = task
    return task
  }

  const captureCurrentFrameImageData = async (
    options?: CaptureOptions,
  ): Promise<ImageData | null> => {
    if (captureImageDataInFlightRef.current) {
      if (options?.fresh) {
        await captureImageDataInFlightRef.current.catch(() => null)
      } else {
        return captureImageDataInFlightRef.current
      }
    }

    if (captureImageDataInFlightRef.current) {
      return captureImageDataInFlightRef.current
    }

    const task = (async () => {
      try {
        const targetFrame = resolveCaptureTargetFrame(options)
        const offscreen =
          (await captureLiveScopeRenderedSnapshot(options)) ??
          captureRenderedDisplaySnapshot(options) ??
          (await renderOffscreenFrame(targetFrame, {
            useLiveDomProvider:
              !options?.preferRenderedFrame || usePlaybackStore.getState().isPlaying,
          }))
        if (!offscreen) return null

        const targetWidth = Math.max(2, Math.round(options?.width ?? offscreen.width))
        const targetHeight = Math.max(2, Math.round(options?.height ?? offscreen.height))
        const shouldScale =
          !options?.fullResolution &&
          (targetWidth !== offscreen.width || targetHeight !== offscreen.height)

        if (!shouldScale) {
          const offscreenCtx =
            scrubOffscreenCtxRef.current ?? offscreen.getContext('2d', { willReadFrequently: true })
          if (!offscreenCtx) return null
          return offscreenCtx.getImageData(0, 0, offscreen.width, offscreen.height)
        }

        let scaleCanvas = captureScaleCanvasRef.current
        if (!scaleCanvas) {
          scaleCanvas = document.createElement('canvas')
          captureScaleCanvasRef.current = scaleCanvas
        }
        if (scaleCanvas.width !== targetWidth || scaleCanvas.height !== targetHeight) {
          scaleCanvas.width = targetWidth
          scaleCanvas.height = targetHeight
        }
        const scaleCtx = scaleCanvas.getContext('2d', { willReadFrequently: true })
        if (!scaleCtx) return null

        scaleCtx.clearRect(0, 0, targetWidth, targetHeight)
        scaleCtx.drawImage(offscreen, 0, 0, targetWidth, targetHeight)
        return scaleCtx.getImageData(0, 0, targetWidth, targetHeight)
      } catch (error) {
        logger.warn('Failed to capture raw frame:', error)
        return null
      } finally {
        captureImageDataInFlightRef.current = null
      }
    })()

    captureImageDataInFlightRef.current = task
    return task
  }

  const captureSnapshotCanvasRef: { current: OffscreenCanvas | null } = { current: null }

  const captureCanvasSource = async (
    options?: CaptureOptions,
  ): Promise<OffscreenCanvas | HTMLCanvasElement | null> => {
    if (captureCanvasSourceInFlightRef.current) {
      if (options?.fresh) {
        await captureCanvasSourceInFlightRef.current.catch(() => null)
      } else {
        return captureCanvasSourceInFlightRef.current
      }
    }

    if (captureCanvasSourceInFlightRef.current) {
      return captureCanvasSourceInFlightRef.current
    }

    const task = (async () => {
      try {
        const liveScopeSnapshot = await captureLiveScopeRenderedSnapshot(options)
        if (liveScopeSnapshot) return liveScopeSnapshot
        const displaySnapshot = captureRenderedDisplaySnapshot(options)
        if (displaySnapshot) return displaySnapshot

        const targetFrame = resolveCaptureTargetFrame(options)
        const useLiveDomProvider =
          !options?.preferRenderedFrame || usePlaybackStore.getState().isPlaying
        if (domTextScrubOverlayEnabled) {
          const offscreen = await renderOffscreenFrame(targetFrame, { useLiveDomProvider })
          if (!offscreen) return null
          let snapshot = captureSnapshotCanvasRef.current
          if (
            !snapshot ||
            snapshot.width !== offscreen.width ||
            snapshot.height !== offscreen.height
          ) {
            snapshot = new OffscreenCanvas(offscreen.width, offscreen.height)
            captureSnapshotCanvasRef.current = snapshot
          }
          const snapshotCtx = snapshot.getContext('2d')
          if (!snapshotCtx) return null
          snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height)
          snapshotCtx.drawImage(offscreen, 0, 0)
          return snapshot
        }
        const isPlayingForCapture = useLiveDomProvider && usePlaybackStore.getState().isPlaying

        if (
          scrubOffscreenRenderedFrameRef.current !== targetFrame ||
          !scrubOffscreenCanvasRef.current
        ) {
          const renderer = await ensureFastScrubRenderer()
          if (!renderer || !scrubOffscreenCanvasRef.current) return null
        }

        // Render (if stale) and snapshot inside one lock session: consumers
        // like the scopes upload the returned canvas after further awaits,
        // by which time the pump may be redrawing the shared offscreen.
        // Handing out a private copy makes the sample immune to that.
        return await withScrubRenderLock(async () => {
          const offscreen = scrubOffscreenCanvasRef.current
          if (!offscreen) return null
          const renderer = scrubRendererRef.current
          if (!renderer) return null
          // During playback the on-screen graded frame is produced by the GPU
          // effect fast path (`applyEffectsToVideo`), which reads the Player's
          // live <video> elements via the DOM video provider. The pump installs
          // that provider for its own renders; captures don't go through the
          // pump, so without it the fast path bails (`no-dom-provider`) and the
          // capture falls back to a decode that can't track playback — freezing
          // scopes on effect clips while non-effect clips (which draw the DOM
          // video directly) keep updating. Mirror the pump: provide the live
          // elements while playing, clear when paused so seeked frames render
          // from decode as before. Force a fresh render while playing since the
          // live video advances even when the frame number momentarily repeats.
          if ('setDomVideoElementProvider' in renderer) {
            renderer.setDomVideoElementProvider?.(
              isPlayingForCapture ? getBestDomVideoElementForItem : undefined,
            )
          }
          if (scrubOffscreenRenderedFrameRef.current !== targetFrame || isPlayingForCapture) {
            await renderer.renderFrame(targetFrame)
            if (wasRendererFrameAborted(renderer)) {
              scrubOffscreenRenderedFrameRef.current = null
              return null
            }
            scrubOffscreenRenderedFrameRef.current = targetFrame
          }

          let snapshot = captureSnapshotCanvasRef.current
          if (
            !snapshot ||
            snapshot.width !== offscreen.width ||
            snapshot.height !== offscreen.height
          ) {
            snapshot = new OffscreenCanvas(offscreen.width, offscreen.height)
            captureSnapshotCanvasRef.current = snapshot
          }
          const snapshotCtx = snapshot.getContext('2d')
          if (!snapshotCtx) return null
          snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height)
          snapshotCtx.drawImage(offscreen, 0, 0)
          return snapshot
        })
      } catch (error) {
        logger.warn('Failed to capture canvas source:', error)
        return null
      } finally {
        captureCanvasSourceInFlightRef.current = null
      }
    })()

    captureCanvasSourceInFlightRef.current = task
    return task
  }

  usePreviewCaptureBridge(() => ({
    captureCurrentFrame,
    captureCurrentFrameImageData,
    captureCanvasSource,
    setCaptureFrame,
    setCaptureFrameImageData,
    setCaptureCanvasSource,
    setDisplayedFrame,
    captureInFlightRef,
    captureImageDataInFlightRef,
    captureScaleCanvasRef,
  }))

  $effect(() =>
    untrack(() => {
      if (!FAST_SCRUB_RENDERER_ENABLED) return
      markPlaybackStartReadiness({
        gpuWarmStartedMs: performance.now(),
        gpuWarmFinishedMs: null,
        gpuWarmAvailable: false,
      })
      void (async () => {
        try {
          const { EffectsPipeline } = await import('@/infrastructure/gpu-effects')
          const device = await EffectsPipeline.requestCachedDevice()
          if (device) {
            const warmPipeline = await EffectsPipeline.create()
            if (warmPipeline) {
              markPlaybackStartReadiness({ gpuWarmAvailable: true })
              try {
                const { TransitionPipeline } = await import('@/infrastructure/gpu-transitions')
                TransitionPipeline.create(device)?.destroy()
              } finally {
                warmPipeline.destroy()
              }
            }
          }
        } catch {
          // GPU not available, the renderer will fall back to the CPU path.
        } finally {
          markPlaybackStartReadiness({ gpuWarmFinishedMs: performance.now() })
        }
      })()
    }),
  )

  $effect(() => {
    void [useProxy]

    if (!FAST_SCRUB_RENDERER_ENABLED || isResolving) return

    let cancelled = false
    const warmup = () => {
      if (cancelled) return
      // Spawn the preseek worker pool so the first seek of the session
      // doesn't pay worker spawn + WASM load. Deliberately outside the
      // renderer guard below: on projects with a transition at the playhead,
      // ensureFastScrubRenderer() is already in flight before this idle
      // callback fires, and the pool must still warm.
      warmDecoderPrewarmWorkerPool()
      if (useProxy) {
        warmScrubProxyFallback()
      }
      if (scrubRendererRef.current || scrubInitPromiseRef.current) return
      void ensureFastScrubRenderer()
    }

    let idleId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (
        window as Window & {
          requestIdleCallback: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number
        }
      ).requestIdleCallback(() => warmup(), { timeout: 400 })
    } else {
      timeoutId = setTimeout(warmup, 120)
    }

    return () => {
      cancelled = true
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        ;(window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId,
        )
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  })

  $effect(() => {
    void [resetResolveRetryState]

    return () => {
      scrubMountedRef.current = false
      resetResolveRetryState()
      disposeScrubProxyFallback()
      disposeFastScrubRenderer()
    }
  })

  return {
    disposeFastScrubRenderer,
    ensureFastScrubRenderer,
    ensureBgTransitionRenderer,
  }
}
