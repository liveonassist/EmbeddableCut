<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { ItemEffect } from '@/types/effects'
  import { GizmoOverlay } from '../gizmo-overlay'
  import MaskEditorContainer from '../mask-editor-container.svelte'
  import CornerPinContainer from '../corner-pin-container.svelte'
  import { PowerWindowOverlayContainer } from '../power-window-overlay'
  import { SpatialEffectPointOverlayContainer } from '../spatial-effect-point-overlay'
  import PreviewPerfPanel from '../preview-perf-panel.svelte'
  import PreviewStage from '../preview-stage.svelte'
  import RollingEditOverlay from '../rolling-edit-overlay.svelte'
  import RippleEditOverlay from '../ripple-edit-overlay.svelte'
  import SlipEditOverlay from '../slip-edit-overlay.svelte'
  import SlideEditOverlay from '../slide-edit-overlay.svelte'
  import { useSelectedComparisonCompositionPrewarm } from '../use-selected-comparison-composition-prewarm.svelte'
  import { useGpuEffectsOverlay } from '../../hooks/use-gpu-effects-overlay.svelte'
  import { usePreviewCompositionBaseModel, usePreviewCompositionModel } from '../../hooks/use-preview-composition-model.svelte'
  import { useCustomPlayer } from '../../hooks/use-custom-player.svelte'
  import { usePreviewDiagnostics } from '../../hooks/use-preview-diagnostics.svelte'
  import { usePreviewMediaResolution } from '../../hooks/use-preview-media-resolution.svelte'
  import { usePreviewMediaPreload } from '../../hooks/use-preview-media-preload.svelte'
  import { usePreviewOverlayController } from '../../hooks/use-preview-overlay-controller.svelte'
  import { usePreviewPerfPanel } from '../../hooks/use-preview-perf-panel.svelte'
  import { usePreviewPerfPublisher } from '../../hooks/use-preview-perf-publisher.svelte'
  import { usePreviewPlaybackController } from '../../hooks/use-preview-playback-controller.svelte'
  import { usePreviewRenderPump } from '../../hooks/use-preview-render-pump-controller.svelte'
  import { usePreviewRendererController } from '../../hooks/use-preview-renderer-controller.svelte'
  import { usePreviewRuntimeRefs } from '../../hooks/use-preview-runtime-refs.svelte'
  import { usePreviewSourceWarm } from '../../hooks/use-preview-source-warm.svelte'
  import { usePreviewTransitionModel } from '../../hooks/use-preview-transition-model.svelte'
  import { usePreviewViewModel } from '../../hooks/use-preview-view-model.svelte'
  import { usePreviewTransitionSessionController } from '../../hooks/use-preview-transition-session-controller.svelte'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import { useCornerPinStore } from '@/features/preview/stores/corner-pin-store'
  import { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
  import { usePowerWindowEditorStore } from '@/features/preview/stores/power-window-editor-store'
  import { useSpatialEffectEditorStore } from '@/features/preview/stores/spatial-effect-editor-store'
  import { FAST_SCRUB_RENDERER_ENABLED } from '@/features/preview/utils/preview-constants'
  import { drawSourceToPreviewDisplayCanvas, getPreviewDisplayCanvasBackingSize } from '@/features/preview/utils/preview-display-canvas'
  import { buildDomTextScrubOverlayPlan } from '@/features/preview/utils/dom-text-scrub-overlay'
  import { shouldPreferDomPlayerForGizmo } from '@/features/preview/utils/gizmo-preview-presentation'
  import { importCompositionRenderer, type CompositionRendererInstance } from '@/features/preview/deps/export'
  import type { PreviewItemsSnapshot, PreviewOverlayChrome, VideoPreviewProps } from './types'

  let { project, containerSize, suspendOverlay = false, overlayChrome, itemsSnapshot }: VideoPreviewProps & {
    overlayChrome: PreviewOverlayChrome
    itemsSnapshot: PreviewItemsSnapshot
  } = $props()
  const previewRuntimeRefs = usePreviewRuntimeRefs()
  // The overlays derive their coordinates from this; a new object on every
  // update of `project` would re-run each overlay's effects.
  const projectWidth = $derived(project.width)
  const projectHeight = $derived(project.height)
  const projectSize = $derived({ width: projectWidth, height: projectHeight })
  const colorGradeComparisonMode = select(useGizmoStore, (s) => s.colorGradeComparisonMode)
  const colorGradeSplitPosition = select(useGizmoStore, (s) => s.colorGradeSplitPosition)
  const setColorGradeSplitPosition = useGizmoStore.getState().setColorGradeSplitPosition
  // Frame values are only consumed by the color-grade comparison branch near
  // the bottom of this component. Returning a stable sentinel while comparison
  // is off keeps ordinary playback/scrubbing from re-rendering this large tree.
  const comparisonEnabled = $derived(colorGradeComparisonMode.current !== 'off')
  const comparisonCurrentFrame = selectDerived(usePlaybackStore, (s) =>
    comparisonEnabled ? s.currentFrame : null)
  const comparisonPreviewFrame = selectDerived(usePlaybackStore, (s) =>
    comparisonEnabled ? s.previewFrame : null)
  // Capture the playhead once at mount so a workspace-driven remount (switching
  // to/from Color swaps VideoPreview<->ColorVideoPreview, remounting the Player)
  // starts the fresh clock at the current frame. Without this the new Player
  // fires an initial onFrameChange(0) that, while playing, overwrites the
  // playhead back to 0.
  const initialPlayheadFrameRef: { current: number | null } = { current: null }
  if (initialPlayheadFrameRef.current === null) {
    initialPlayheadFrameRef.current = usePlaybackStore.getState().currentFrame
  }
  const comparisonDisplayedFrame = selectDerived(usePreviewBridgeStore, (s) =>
    comparisonEnabled ? s.displayedFrame : null)
  const livePreviewEdits = select(useGizmoStore, (s) => s.preview)
  let playerDisplayedFrame = $state.raw<number | null>(null)
  const setPlayerDisplayedFrame = (next: number | null | ((prev: number | null) => number | null)) => {
    playerDisplayedFrame = typeof next === 'function' ? (next as (prev: number | null) => number | null)(untrack(() => playerDisplayedFrame)) : next
  }
  const latestPlayerDisplayedFrameRef: { current: number | null } = { current: null }
  let splitAfterRenderedFrame = $state.raw<number | null>(null)
  const setSplitAfterRenderedFrame = (next: number | null | ((prev: number | null) => number | null)) => {
    splitAfterRenderedFrame = typeof next === 'function' ? (next as (prev: number | null) => number | null)(untrack(() => splitAfterRenderedFrame)) : next
  }
  const splitAfterRendererRef: { current: CompositionRendererInstance | null } = { current: null }
  const splitAfterInitPromiseRef: { current: Promise<CompositionRendererInstance | null> | null } = { current: null }
  const splitAfterInitGenerationRef = { current: 0 }
  const splitAfterCanvasRef: { current: OffscreenCanvas | null } = { current: null }
  const splitAfterRendererStructureKeyRef: { current: string | null } = { current: null }
  const splitAfterRenderInFlightRef = { current: false }
  const splitAfterPendingFrameRef: { current: number | null } = { current: null }
  const {
    playerRef,
    scrubCanvasRef,
    gpuEffectsCanvasRef,
    bypassPreviewSeekRef,
    isGizmoInteractingRef,
    preferPlayerForStyledTextScrubRef,
    adaptiveQualityStateRef,
    transitionSessionTraceRef,
    transitionTelemetryRef,
    transitionSessionBufferedFramesRef,
  } = $derived(previewRuntimeRefs)
  const previewPerfPanel = usePreviewPerfPanel()
  const { showPerfPanel, perfPanelSnapshot, latestRenderSourceSwitch } = $derived(previewPerfPanel)
  const previewViewModel = usePreviewViewModel(() => ({
    project,
    containerSize,
    suspendOverlay,
    itemsSnapshot,
  }))
  const {
    fps,
    tracks,
    keyframes,
    items,
    itemsByTrackId,
    mediaDependencyVersion,
    transitions,
    mediaById,
    brokenMediaCount,
    hasRolling2Up,
    hasRipple2Up,
    hasSlip4Up,
    hasSlide4Up,
    zoom,
    useProxy,
    busAudioEq,
    blobUrlVersion,
    proxyReadyCount,
    playerSize,
    needsOverflow,
    playerContainerRect,
    backgroundRef,
    setPlayerContainerRefCallback,
    handleBackgroundClick,
  } = $derived(previewViewModel)
  useSelectedComparisonCompositionPrewarm(() => ({
    fps,
    items,
    useProxyMedia: useProxy,
    blobUrlVersion,
  }))
  const gpuEffectsOverlay = useGpuEffectsOverlay(() => fps)
  const { needsOverlay: showGpuEffectsOverlay, shouldWarmRenderer: shouldWarmGpuEffectsRenderer } = $derived(gpuEffectsOverlay)
  const isMaskEditing = select(useMaskEditorStore, (s) => s.isEditing)
  const isCornerPinEditing = select(useCornerPinStore, (s) => s.isEditing)
  const isPowerWindowEditing = select(usePowerWindowEditorStore, (s) => s.isEditing)
  const isSpatialEffectEditing = select(useSpatialEffectEditorStore, (s) => s.isEditing)
  const setCaptureFrame = usePreviewBridgeStore.getState().setCaptureFrame
  const setCaptureFrameImageData = usePreviewBridgeStore.getState().setCaptureFrameImageData
  const setDisplayedFrame = usePreviewBridgeStore.getState().setDisplayedFrame

  const previewOverlayController = usePreviewOverlayController(() => ({
    bypassPreviewSeekRef,
    setDisplayedFrame,
  }))
  const {
    isRenderedOverlayVisible,
    showFastScrubOverlayRef,
    showPlaybackTransitionOverlayRef,
    renderSourceRef,
    renderSourceSwitchCountRef,
    renderSourceHistoryRef,
    hideFastScrubOverlay,
    hidePlaybackTransitionOverlay,
    showFastScrubOverlayForFrame,
    showPlaybackTransitionOverlayForFrame,
  } = $derived(previewOverlayController)

  const previewDiagnostics = usePreviewDiagnostics(() => ({
    renderSourceRef,
  }))
  const { previewPerfRef, pushTransitionTrace, recordRenderFrameJitter } = $derived(previewDiagnostics)

  const previewCompositionBaseModel = usePreviewCompositionBaseModel(() => ({
    tracks,
    itemsByTrackId,
    mediaById,
  }))
  const { combinedTracks, mediaResolveCostById } = $derived(previewCompositionBaseModel)

  const previewMediaResolution = usePreviewMediaResolution(() => ({
    fps,
    combinedTracks,
    mediaResolveCostById,
    mediaDependencyVersion,
    blobUrlVersion,
    brokenMediaCount,
    previewPerfRef: previewPerfRef as typeof previewPerfRef & {
      current: {
        resolveSamples: number
        resolveTotalMs: number
        resolveTotalIds: number
        resolveLastMs: number
        resolveLastIds: number
      }
    },
    isGizmoInteractingRef,
  }))
  const {
    resolvedUrls,
    setResolvedUrls,
    isResolving,
    unresolvedMediaIdSetRef,
    preloadResolveInFlightRef,
    preloadBurstRemainingRef,
    preloadScanTrackCursorRef,
    preloadScanItemCursorRef,
    preloadLastAnchorFrameRef,
    getUnresolvedQueueSize,
    getPendingResolveCount,
    getResolveRetryAt,
    resolveMediaBatch,
    clearResolveRetryState,
    removeUnresolvedMediaIds,
    markResolveFailures,
    scheduleResolveRetryWake,
    kickResolvePass,
    resetResolveRetryState,
  } = $derived(previewMediaResolution)

  const previewPerfPublisher = usePreviewPerfPublisher(() => ({
    previewPerfRef,
    adaptiveQualityStateRef,
    transitionSessionTraceRef,
    transitionTelemetryRef,
    transitionSessionBufferedFramesRef,
    renderSourceRef,
    renderSourceSwitchCountRef,
    renderSourceHistoryRef,
    getUnresolvedQueueSize,
    getPendingResolveCount,
  }))
  const { trackPlayerSeek, resolvePendingSeekLatency } = $derived(previewPerfPublisher)

  const customPlayer = useCustomPlayer(() => playerRef, () => bypassPreviewSeekRef, () => preferPlayerForStyledTextScrubRef, () => isGizmoInteractingRef, () => trackPlayerSeek)
  const { ignorePlayerUpdatesRef } = $derived(customPlayer)

  const previewCompositionModel = usePreviewCompositionModel(() => ({
    combinedTracks,
    fps,
    items,
    keyframes,
    transitions,
    resolvedUrls,
    useProxy,
    busAudioEq,
    proxyReadyCount,
    blobUrlVersion,
    project,
    playerSize,
  }))
  const {
    playbackVideoSourceSpans,
    scrubVideoSourceSpans,
    fastScrubBoundaryFrames,
    fastScrubBoundarySources,
    totalFrames,
    inputProps,
    playerRenderSize,
    renderSize,
    fastScrubScaledTracks,
    fastScrubScaledKeyframes,
    fastScrubInputProps,
    fastScrubPreviewItems,
    fastScrubTracksTopologyFingerprint,
    getPreviewTransformOverride,
    getPreviewEffectsOverride,
    getPreviewCornerPinOverride,
    getPreviewPathVerticesOverride,
    getLiveItemSnapshot,
    getLiveKeyframes,
  } = $derived(previewCompositionModel)
  const domTextScrubOverlayPlan = $derived.by(() => buildDomTextScrubOverlayPlan(fastScrubScaledTracks, fastScrubScaledKeyframes))
  const domTextScrubInputProps = $derived.by(() => {
    void [inputProps]
    return domTextScrubOverlayPlan.enabled
        ? {
            ...inputProps,
            tracks: domTextScrubOverlayPlan.textTracks,
            backgroundColor: 'transparent',
            keyframes: domTextScrubOverlayPlan.textKeyframes,
          }
        : undefined
  })

  usePreviewSourceWarm(() => ({
    resolvedUrlCount: resolvedUrls.size,
    playbackVideoSourceSpans,
    scrubVideoSourceSpans,
    fps,
    previewPerfRef: previewPerfRef as typeof previewPerfRef & {
      current: {
        sourceWarmTarget: number
        sourceWarmKeep: number
        sourceWarmEvictions: number
        sourcePoolSources: number
        sourcePoolElements: number
        sourcePoolActiveClips: number
      }
    },
    isGizmoInteractingRef,
  }))
  const previewTransitionModel = usePreviewTransitionModel(() => ({
    fps,
    transitions,
    fastScrubScaledTracks,
    fastScrubPreviewItems,
  }))
  const {
    playbackTransitionFingerprint,
    playbackTransitionWindows,
    playbackTransitionLookaheadFrames,
    playbackTransitionCooldownFrames,
    pausedTransitionPrearmFrames,
    playingComplexTransitionPrearmFrames,
    playbackTransitionPrerenderRunwayFrames,
    playbackTransitionComplexStartFrames,
    transitionWindowUsesDomProvider,
    getTransitionWindowByStartFrame,
    getTransitionWindowForFrame,
    getActiveTransitionWindowForFrame,
    playbackTransitionOverlayWindows,
    shouldPreserveHighFidelityBackwardPreview,
  } = $derived(previewTransitionModel)

  const fastScrubRendererStructureKey = $derived.by(() =>
      [
        fps,
        project.width,
        project.height,
        renderSize.width,
        renderSize.height,
        project.backgroundColor ?? '',
        useProxy ? 'proxy' : 'source',
        fastScrubTracksTopologyFingerprint,
        domTextScrubOverlayPlan.enabled ? 'dom-text-overlay' : 'composited-text',
        playbackTransitionFingerprint,
      ].join('::'))

  const getPreviewEffectsOverrideWithGradeApplied = (itemId: string): ItemEffect[] | undefined => {
      return useGizmoStore.getState().preview?.[itemId]?.effects
    }

  const disposeSplitAfterRenderer = () => {
    splitAfterInitGenerationRef.current += 1
    splitAfterInitPromiseRef.current = null
    splitAfterRendererStructureKeyRef.current = null
    splitAfterCanvasRef.current = null
    splitAfterPendingFrameRef.current = null
    splitAfterRenderInFlightRef.current = false
    setSplitAfterRenderedFrame(null)

    const renderer = splitAfterRendererRef.current
    splitAfterRendererRef.current = null
    if (!renderer) return
    try {
      renderer.dispose()
    } catch {
      // Best effort; the main preview renderer can continue independently.
    }
  }

  $effect(() => {
    const canvas = gpuEffectsCanvasRef.current
    if (!canvas) return
    const backingSize = getPreviewDisplayCanvasBackingSize(playerSize, renderSize)
    if (canvas.width !== backingSize.width) canvas.width = backingSize.width
    if (canvas.height !== backingSize.height) canvas.height = backingSize.height
  })

  const ensureSplitAfterRenderer = async (): Promise<CompositionRendererInstance | null> => {
      if (!FAST_SCRUB_RENDERER_ENABLED) return null
      if (typeof OffscreenCanvas === 'undefined') return null
      if (isResolving) return null
      if (
        splitAfterRendererRef.current &&
        splitAfterRendererStructureKeyRef.current !== fastScrubRendererStructureKey
      ) {
        disposeSplitAfterRenderer()
      }
      if (splitAfterRendererRef.current) return splitAfterRendererRef.current
      if (splitAfterInitPromiseRef.current) return splitAfterInitPromiseRef.current

      const initGeneration = splitAfterInitGenerationRef.current
      let initPromise!: Promise<CompositionRendererInstance | null>
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
            getPreviewEffectsOverride: getPreviewEffectsOverrideWithGradeApplied,
            getPreviewCornerPinOverride,
            getPreviewPathVerticesOverride,
            getLiveItemSnapshot,
            getLiveKeyframes,
            renderText: !domTextScrubOverlayPlan.enabled,
          })
          if (splitAfterInitGenerationRef.current !== initGeneration) {
            renderer.dispose()
            return null
          }

          splitAfterCanvasRef.current = canvas
          splitAfterRendererRef.current = renderer
          splitAfterRendererStructureKeyRef.current = fastScrubRendererStructureKey
          if ('warmGpuPipeline' in renderer) {
            void renderer.warmGpuPipeline()
          }
          return renderer
        } catch {
          if (splitAfterInitGenerationRef.current === initGeneration) {
            splitAfterCanvasRef.current = null
            splitAfterRendererRef.current = null
            splitAfterRendererStructureKeyRef.current = null
          }
          return null
        } finally {
          if (splitAfterInitPromiseRef.current === initPromise) {
            splitAfterInitPromiseRef.current = null
          }
        }
      })()
      splitAfterInitPromiseRef.current = initPromise

      return initPromise
    }

  $effect(() => {
    void [fastScrubRendererStructureKey]

    disposeSplitAfterRenderer()
  })

  // Enter the composited path in the same render that activates the editor.
  // Waiting for the timeline-wide effect scan adds a reactive round trip that
  // makes the first neutral-EV drag look stuck until another parameter changes.
  const forceFastScrubOverlay = $derived(showGpuEffectsOverlay || isPowerWindowEditing.current || isSpatialEffectEditing.current)
  const previousForceFastScrubOverlayRef = { current: forceFastScrubOverlay }

  // The split comparison is the only render-time branch that needs playback
  // state. Keep the selected value stable for the normal (non-split) preview
  // so pressing Play does not invalidate the entire VideoPreview tree.
  const isPlayingForSplitComparison = selectDerived(usePlaybackStore, (state) => colorGradeComparisonMode.current === 'split' && state.isPlaying)

  // While the GPU overlay owns the preview during playback, the DOM composition
  // tree is occluded — freeze its per-item visual recomputation so it stops
  // re-deriving transforms/masks/text on every frame behind the overlay. The
  // overlay composites the real frames; mount/visibility and video sync stay live.
  $effect(() => {
    const applyFrozenState = (isPlaying: boolean) => {
      usePlaybackStore.getState().setCompositionVisualFrozen(forceFastScrubOverlay && isPlaying)
    }

    applyFrozenState(usePlaybackStore.getState().isPlaying)
    const unsubscribe = usePlaybackStore.subscribe((state, previousState) => {
      if (state.isPlaying !== previousState.isPlaying) {
        applyFrozenState(state.isPlaying)
      }
    })

    return () => {
      unsubscribe()
      usePlaybackStore.getState().setCompositionVisualFrozen(false)
    }
  })

  const previewTransitionSessionController = usePreviewTransitionSessionController(() => ({
    fps,
    forceFastScrubOverlay,
    pausedTransitionPrearmFrames,
    playingComplexTransitionPrearmFrames,
    playbackTransitionWindows,
    playbackTransitionComplexStartFrames,
    playbackTransitionPrerenderRunwayFrames,
    playbackTransitionCooldownFrames,
    transitionWindowUsesDomProvider,
    getTransitionWindowByStartFrame,
    getActiveTransitionWindowForFrame,
    pushTransitionTrace,
    ...previewRuntimeRefs.transitionSessionControllerRefs,
  }))
  const {
    clearTransitionPlaybackSession,
    pinTransitionPlaybackSession,
    getPinnedTransitionElementForItem,
    getPausedTransitionPrewarmStartFrame,
    getPlayingAnyTransitionPrewarmStartFrame,
    isPausedTransitionOverlayActive,
    cacheTransitionSessionFrame,
    preparePlaybackTransitionFrame,
  } = $derived(previewTransitionSessionController)
  $effect(() => {
    const wasForced = previousForceFastScrubOverlayRef.current
    previousForceFastScrubOverlayRef.current = forceFastScrubOverlay
    if (!wasForced || forceFastScrubOverlay) return

    const playbackState = usePlaybackStore.getState()
    if (
      playbackState.previewFrame !== null ||
      isPausedTransitionOverlayActive(playbackState.currentFrame, playbackState)
    ) {
      return
    }

    // A rendered-only item just left the routing window. Release its last
    // bitmap immediately so an ordinary Player frame cannot remain occluded.
    hideFastScrubOverlay()
    setDisplayedFrame(null)
  })
  const shouldPreferPlayerForPreview = (previewFrame: number | null) => {
      const playbackState = usePlaybackStore.getState()
      const requiresRenderedPresentation =
        forceFastScrubOverlay ||
        isPausedTransitionOverlayActive(playbackState.currentFrame, playbackState)
      if (requiresRenderedPresentation) return false
      const preservesRenderedPreview =
        previewFrame !== null && shouldPreserveHighFidelityBackwardPreview(previewFrame)
      if (preservesRenderedPreview) {
        // Styled DOM text normally keeps skimming on the Player to preserve
        // typography. Transition frames are the exception: the Player does
        // not composite the authored transition, so retain the rendered media
        // path (and its separate DOM text overlay when that split is safe).
        return false
      }

      const activeGizmoItemType = useGizmoStore.getState().activeGizmo?.itemType ?? null
      return (
        shouldPreferDomPlayerForGizmo(false, activeGizmoItemType) ||
        previewRuntimeRefs.preferPlayerForDomGizmoRef.current ||
        (preferPlayerForStyledTextScrubRef.current && previewFrame !== null)
      )
    }
  const previewPlaybackController = usePreviewPlaybackController(() => ({
    fps,
    combinedTracks,
    keyframes,
    forceFastScrubOverlay,
    domTextScrubOverlayEnabled: domTextScrubOverlayPlan.enabled,
    previewPerfRef,
    isGizmoInteractingRef,
    preferPlayerForDomGizmoRef: previewRuntimeRefs.preferPlayerForDomGizmoRef,
    preferPlayerForStyledTextScrubRef,
    adaptiveQualityStateRef,
    adaptiveFrameSampleRef: previewRuntimeRefs.adaptiveFrameSampleRef,
    ignorePlayerUpdatesRef,
    resolvePendingSeekLatency,
  }))
  const { handleFrameChange, handlePlayStateChange } = $derived(previewPlaybackController)

  const handleStageFrameChange = (frame: number) => {
      const nextFrame = Math.max(0, Math.round(frame))
      latestPlayerDisplayedFrameRef.current = nextFrame
      // Ordinary playback consumes this imperatively through the ref below.
      // Mirroring every Clock tick into React state invalidates the entire
      // VideoPreview tree (including editor overlays) even though only color
      // comparison needs a rendered-frame state value.
      if (comparisonEnabled) {
        setPlayerDisplayedFrame((prevFrame) => (prevFrame === nextFrame ? prevFrame : nextFrame))
      }
      handleFrameChange(frame)
    }

  const getLivePlaybackFrame = () => {
    const playerFrame = playerRef.current?.getCurrentFrame()
    if (playerFrame !== undefined && Number.isFinite(playerFrame)) {
      return Math.max(0, Math.round(playerFrame))
    }
    return latestPlayerDisplayedFrameRef.current
  }

  const setCaptureCanvasSource = usePreviewBridgeStore.getState().setCaptureCanvasSource

  const previewRendererController = usePreviewRendererController(() => ({
      fps,
      isResolving,
      forceFastScrubOverlay,
      preserveRendererAcrossOverlayRouting: shouldWarmGpuEffectsRenderer,
      domTextScrubOverlayEnabled: domTextScrubOverlayPlan.enabled,
      items,
      useProxy,
      playerSize,
      playerRenderSize,
      renderSize,
      fastScrubInputProps,
      fastScrubScaledTracks,
      fastScrubScaledKeyframes,
      fastScrubRendererStructureKey,
      showFastScrubOverlayRef,
      showPlaybackTransitionOverlayRef,
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
      ...previewRuntimeRefs.rendererControllerRefs,
    }))
  const { disposeFastScrubRenderer, ensureFastScrubRenderer, ensureBgTransitionRenderer } = $derived(previewRendererController)
  $effect(() => {
    if (!shouldWarmGpuEffectsRenderer || isResolving) return

    let cancelled = false
    const warmRenderer = () => {
      if (!cancelled) void ensureFastScrubRenderer()
    }
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warmRenderer, { timeout: 750 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(idleId)
      }
    }

    const timeoutId = window.setTimeout(warmRenderer, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  })
  usePreviewRenderPump(() => ({
    fps,
    forceFastScrubOverlay,
    useProxy,
    // Scrub decoding must use the same proxy/source URLs as the renderer.
    // Feeding unresolved project tracks here silently made the worker decode
    // full-resolution originals while the composition rendered proxies.
    combinedTracks: fastScrubScaledTracks,
    fastScrubBoundaryFrames,
    fastScrubBoundarySources,
    playbackTransitionOverlayWindows,
    playbackTransitionLookaheadFrames,
    playbackTransitionCooldownFrames,
    playbackTransitionPrerenderRunwayFrames,
    previewPerfRef,
    showFastScrubOverlayRef,
    setDisplayedFrame,
    hideFastScrubOverlay,
    hidePlaybackTransitionOverlay,
    showFastScrubOverlayForFrame,
    showPlaybackTransitionOverlayForFrame,
    shouldPreferPlayerForPreview,
    shouldPreserveHighFidelityBackwardPreview,
    getTransitionWindowByStartFrame,
    getTransitionWindowForFrame,
    getPlayingAnyTransitionPrewarmStartFrame,
    getPausedTransitionPrewarmStartFrame,
    getPinnedTransitionElementForItem,
    pinTransitionPlaybackSession,
    clearTransitionPlaybackSession,
    cacheTransitionSessionFrame,
    preparePlaybackTransitionFrame,
    disposeFastScrubRenderer,
    ensureFastScrubRenderer,
    ensureBgTransitionRenderer,
    pushTransitionTrace,
    isPausedTransitionOverlayActive,
    trackPlayerSeek,
    recordRenderFrameJitter,
    ...previewRuntimeRefs.renderPumpRefs,
  }))
  usePreviewMediaPreload(() => ({
    fps,
    combinedTracks,
    mediaResolveCostById,
    previewPerfRef,
    setResolvedUrls,
    isGizmoInteractingRef,
    unresolvedMediaIdSetRef,
    preloadResolveInFlightRef,
    preloadBurstRemainingRef,
    preloadScanTrackCursorRef,
    preloadScanItemCursorRef,
    preloadLastAnchorFrameRef,
    getResolveRetryAt,
    resolveMediaBatch,
    clearResolveRetryState,
    removeUnresolvedMediaIds,
    markResolveFailures,
    scheduleResolveRetryWake,
    kickResolvePass,
    ...previewRuntimeRefs.mediaPreloadRefs,
  }))
  // The stage binds the background through this ref; mirroring it into state
  // lets the gizmo overlay portal its marquee once the element exists.
  let backgroundElement = $state.raw<HTMLDivElement | null>(null)
  const stageBackgroundRef = {
    get current() {
      return backgroundRef.current
    },
    set current(element: HTMLDivElement | null) {
      backgroundRef.current = element
      backgroundElement = element
    },
  }

  const shouldShowAfterDuringSplitPlayback = $derived(isPlayingForSplitComparison.current)
  const stageColorGradeComparisonMode = $derived(shouldShowAfterDuringSplitPlayback
    ? 'off'
    : colorGradeComparisonMode.current)
  const baseComparisonTargetFrame = $derived(Math.max(
    0,
    Math.round(comparisonPreviewFrame.current ?? comparisonCurrentFrame.current ?? 0),
  ))
  const comparisonTargetFrame = $derived(stageColorGradeComparisonMode === 'split' && comparisonDisplayedFrame.current !== null
      ? comparisonDisplayedFrame.current
      : baseComparisonTargetFrame)

  // Leaving split comparison clears the rendered after-frame. Kept as its own
  // effect keyed only on the mode so the per-frame `comparisonTargetFrame`
  // churn doesn't re-run the heavier split render effect on every frame.
  $effect(() => {
    if (stageColorGradeComparisonMode === 'split') return
    splitAfterPendingFrameRef.current = null
    setSplitAfterRenderedFrame((frame) => (frame === null ? frame : null))
  })

  $effect(() => {
    void [livePreviewEdits.current]

    if (stageColorGradeComparisonMode !== 'split') return

    let cancelled = false
    splitAfterPendingFrameRef.current = comparisonTargetFrame
    // Intentionally NOT resetting `splitAfterRenderedFrame` here: the readiness
    // check (`splitAfterRenderedFrame === comparisonTargetFrame`) already gates
    // the overlay, so a stale frame stays hidden until the async render catches
    // up. The previous synchronous reset fed a render cascade
    // (displayedFrame → comparisonTargetFrame → setState → displayedFrame …)
    // that tripped React's "maximum update depth".

    const renderPendingSplitAfter = async () => {
      if (splitAfterRenderInFlightRef.current) return
      splitAfterRenderInFlightRef.current = true

      try {
        while (!cancelled && splitAfterPendingFrameRef.current !== null) {
          const targetFrame = splitAfterPendingFrameRef.current
          splitAfterPendingFrameRef.current = null

          const renderer = await ensureSplitAfterRenderer()
          const offscreen = splitAfterCanvasRef.current
          const displayCanvas = gpuEffectsCanvasRef.current
          if (cancelled || !renderer || !offscreen || !displayCanvas) return

          try {
            renderer.invalidateFrameCache({ frames: [targetFrame] })
          } catch {
            // Some renderer doubles do not support selective invalidation.
          }
          await renderer.renderFrame(targetFrame)
          if (cancelled || splitAfterPendingFrameRef.current !== null) continue

          const displayCtx = displayCanvas.getContext('2d')
          if (!displayCtx) return
          drawSourceToPreviewDisplayCanvas(displayCtx, displayCanvas, offscreen)
          setSplitAfterRenderedFrame(targetFrame)
        }
      } finally {
        splitAfterRenderInFlightRef.current = false
        if (!cancelled && splitAfterPendingFrameRef.current !== null) {
          void renderPendingSplitAfter()
        }
      }
    }

    void renderPendingSplitAfter()

    return () => {
      cancelled = true
    }
  })

  $effect(() => () => disposeSplitAfterRenderer())

  // React read the live player frame on every render; it's read here whenever
  // the readiness check recomputes.
  const getEffectivePlayerDisplayedFrame = () => {
    const livePlayerFrame = playerRef.current?.getCurrentFrame()
    const normalizedLivePlayerFrame =
      livePlayerFrame === undefined || !Number.isFinite(livePlayerFrame)
        ? null
        : Math.max(0, Math.round(livePlayerFrame))
    return playerDisplayedFrame ?? normalizedLivePlayerFrame
  }
  const isColorGradeComparisonActive = $derived(stageColorGradeComparisonMode !== 'off')
  const isSplitGradeComparison = $derived(stageColorGradeComparisonMode === 'split')
  const isColorGradeComparisonFrameReady = $derived(comparisonDisplayedFrame.current === comparisonTargetFrame &&
    (isSplitGradeComparison
      ? splitAfterRenderedFrame === comparisonTargetFrame
      : stageColorGradeComparisonMode === 'before' ||
        getEffectivePlayerDisplayedFrame() === comparisonTargetFrame))
  const stageRenderedOverlayVisible = $derived(isColorGradeComparisonActive
    ? isRenderedOverlayVisible && isColorGradeComparisonFrameReady
    : isRenderedOverlayVisible)
  const isSplitAfterVisible = $derived(isSplitGradeComparison && stageRenderedOverlayVisible)
</script>

{#snippet perfPanel()}
  {#if import.meta.env.DEV && showPerfPanel && perfPanelSnapshot}
    <PreviewPerfPanel snapshot={perfPanelSnapshot} {latestRenderSourceSwitch} />
  {/if}
{/snippet}

{#snippet comparisonOverlay()}
  {#if hasRolling2Up}
    <RollingEditOverlay {fps} />
  {:else if hasRipple2Up}
    <RippleEditOverlay {fps} />
  {:else if hasSlip4Up}
    <SlipEditOverlay {fps} />
  {:else if hasSlide4Up}
    <SlideEditOverlay {fps} />
  {/if}
{/snippet}

{#snippet overlayControls()}
  {#if !suspendOverlay}
    {#if overlayChrome === 'edit'}
      <GizmoOverlay
        itemsSnapshot={itemsSnapshot.items}
        containerRect={playerContainerRect}
        {playerSize}
        {projectSize}
        {zoom}
        hitArea={backgroundElement}
      />
    {/if}
    {#if isMaskEditing.current}
      <MaskEditorContainer
        containerRect={playerContainerRect}
        {playerSize}
        {projectSize}
        {zoom}
      />
    {/if}
    {#if isCornerPinEditing.current}
      <CornerPinContainer
        containerRect={playerContainerRect}
        {playerSize}
        {projectSize}
        {zoom}
      />
    {/if}
    {#if isPowerWindowEditing.current}
      <PowerWindowOverlayContainer
        containerRect={playerContainerRect}
        {playerSize}
        {projectSize}
        {zoom}
      />
    {/if}
    {#if isSpatialEffectEditing.current}
      <SpatialEffectPointOverlayContainer
        containerRect={playerContainerRect}
        {playerSize}
        {projectSize}
        {zoom}
      />
    {/if}
  {/if}
{/snippet}

<PreviewStage
  backgroundRef={stageBackgroundRef}
  {playerRef}
  {scrubCanvasRef}
  {gpuEffectsCanvasRef}
  {needsOverflow}
  {playerSize}
  {playerRenderSize}
  overlayRenderSize={renderSize}
  {totalFrames}
  {fps}
  initialFrame={initialPlayheadFrameRef.current ?? 0}
  {isResolving}
  isRenderedOverlayVisible={stageRenderedOverlayVisible}
  isSplitGradeAfterVisible={isSplitAfterVisible}
  colorGradeComparisonMode={stageColorGradeComparisonMode}
  colorGradeSplitPosition={colorGradeSplitPosition.current}
  onColorGradeSplitPositionChange={setColorGradeSplitPosition}
  {inputProps}
  {domTextScrubInputProps}
  onBackgroundClick={handleBackgroundClick}
  onFrameChange={handleStageFrameChange}
  onPlayStateChange={handlePlayStateChange}
  {setPlayerContainerRefCallback}
  {perfPanel}
  {comparisonOverlay}
  {overlayControls}
/>
