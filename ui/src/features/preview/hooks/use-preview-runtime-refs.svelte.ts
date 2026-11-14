// SPDX-License-Identifier: MIT

import type { PlayerRef } from '@/features/preview/deps/player-core'
import type { TimelineItem } from '@/types/timeline'
import type { ResolvedTransitionWindow } from '@/shared/timeline/transitions/transition-planner'
import { createAdaptivePreviewQualityState } from '@/features/preview/utils/adaptive-preview-quality'
import type { CommittedPreviewSnapshotState } from '@/features/preview/utils/preview-display-canvas'
import type { PreviewCompositionRenderer } from './use-preview-renderer-controller.svelte'
import type {
  TransitionPreviewSessionTrace,
  TransitionPreviewTelemetry,
} from './use-preview-transition-session-controller.svelte'

type TransitionWindow = ResolvedTransitionWindow<TimelineItem>

export function usePreviewRuntimeRefs() {
  const playerRef: { current: PlayerRef | null } = { current: null }
  const scrubCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const gpuEffectsCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const scrubFrameDirtyRef = { current: false }
  const bypassPreviewSeekRef = { current: false }
  const isGizmoInteractingRef = { current: false }
  const preferPlayerForDomGizmoRef = { current: false }
  const preferPlayerForStyledTextScrubRef = { current: false }
  const adaptiveQualityStateRef = { current: createAdaptivePreviewQualityState(1) }
  const adaptiveFrameSampleRef: { current: { frame: number; tsMs: number } | null } = {
    current: null,
  }

  const scrubRendererRef: { current: PreviewCompositionRenderer | null } = { current: null }
  const ensureFastScrubRendererRef: { current: () => Promise<PreviewCompositionRenderer | null> } =
    { current: async () => null }
  const scrubInitPromiseRef: { current: Promise<PreviewCompositionRenderer | null> | null } = {
    current: null,
  }
  const scrubPreloadPromiseRef: { current: Promise<void> | null } = { current: null }
  const scrubOffscreenCanvasRef: { current: OffscreenCanvas | null } = { current: null }
  const scrubOffscreenCtxRef: { current: OffscreenCanvasRenderingContext2D | null } = {
    current: null,
  }
  const scrubRendererStructureKeyRef: { current: string | null } = { current: null }
  const scrubRenderInFlightRef = { current: false }
  const scrubRenderGenerationRef = { current: 0 }
  const scrubRequestedFrameRef: { current: number | null } = { current: null }
  const bgTransitionRendererRef: { current: PreviewCompositionRenderer | null } = { current: null }
  const bgTransitionInitPromiseRef: { current: Promise<PreviewCompositionRenderer | null> | null } =
    { current: null }
  const bgTransitionRendererStructureKeyRef: { current: string | null } = { current: null }
  const bgTransitionRenderInFlightRef = { current: false }
  const scrubPrewarmQueueRef: { current: number[] } = { current: [] }
  const scrubPrewarmQueuedSetRef: { current: Set<number> } = { current: new Set() }
  const scrubPrewarmedFramesRef: { current: number[] } = { current: [] }
  const scrubPrewarmedFrameSetRef: { current: Set<number> } = { current: new Set() }
  const scrubPrewarmedSourcesRef: { current: Set<string> } = { current: new Set() }
  const scrubPrewarmedSourceOrderRef: { current: string[] } = { current: [] }
  const scrubPrewarmedSourceTouchFrameRef: { current: Map<string, number> } = { current: new Map() }
  const scrubOffscreenRenderedFrameRef: { current: number | null } = { current: null }
  const committedPreviewSnapshotRef: { current: CommittedPreviewSnapshotState } = {
    current: {
      canvas: null,
      frame: null,
      guardFrame: null,
      guardUntilMs: 0,
    },
  }
  const scrubDirectionRef: { current: -1 | 0 | 1 } = { current: 0 }
  const suppressScrubBackgroundPrewarmRef = { current: false }
  const fallbackToPlayerScrubRef = { current: false }
  const lastForwardScrubPreloadAtRef = { current: 0 }
  const lastBackwardScrubPreloadAtRef = { current: 0 }
  const lastBackwardScrubRenderAtRef = { current: 0 }
  const lastBackwardRequestedFrameRef: { current: number | null } = { current: null }
  const resumeScrubLoopRef: { current: () => void } = { current: () => {} }
  const scrubMountedRef = { current: true }

  const playbackTransitionPreparePromiseRef: { current: Promise<boolean> | null } = {
    current: null,
  }
  const playbackTransitionPreparingFrameRef: { current: number | null } = { current: null }
  const deferredPlaybackTransitionPrepareFrameRef: { current: number | null } = { current: null }
  const transitionPrepareTimeoutRef: { current: number | null } = { current: null }
  const transitionSessionWindowRef: { current: TransitionWindow | null } = { current: null }
  const transitionSessionPinnedElementsRef: { current: Map<string, HTMLVideoElement | null> } = {
    current: new Map(),
  }
  const transitionExitElementsRef: { current: Map<string, HTMLVideoElement | null> } = {
    current: new Map(),
  }
  const transitionSessionStallCountRef: { current: Map<string, { ct: number; count: number }> } = {
    current: new Map(),
  }
  const transitionSessionBufferedFramesRef: { current: Map<number, OffscreenCanvas> } = {
    current: new Map(),
  }
  const transitionPrewarmPromiseRef: { current: Promise<void> | null } = { current: null }
  const transitionSessionTraceRef: { current: TransitionPreviewSessionTrace | null } = {
    current: null,
  }
  const transitionTelemetryRef: { current: TransitionPreviewTelemetry } = {
    current: {
      sessionCount: 0,
      lastPrepareMs: 0,
      lastReadyLeadMs: 0,
      lastEntryMisses: 0,
      lastSessionDurationMs: 0,
    },
  }
  const lastPausedPrearmTargetRef: { current: number | null } = { current: null }
  const lastPlayingPrearmTargetRef: { current: number | null } = { current: null }

  const captureCanvasSourceInFlightRef: {
    current: Promise<OffscreenCanvas | HTMLCanvasElement | null> | null
  } = { current: null }
  const captureInFlightRef: { current: Promise<string | null> | null } = { current: null }
  const captureImageDataInFlightRef: { current: Promise<ImageData | null> | null } = {
    current: null,
  }
  const captureScaleCanvasRef: { current: HTMLCanvasElement | null } = { current: null }

  const transitionSessionControllerRefs = $derived.by(() => ({
    ensureFastScrubRendererRef,
    scrubMountedRef,
    scrubRenderInFlightRef,
    scrubRequestedFrameRef,
    scrubOffscreenCanvasRef,
    scrubOffscreenRenderedFrameRef,
    resumeScrubLoopRef,
    playbackTransitionPreparePromiseRef,
    playbackTransitionPreparingFrameRef,
    transitionSessionWindowRef,
    transitionSessionPinnedElementsRef,
    transitionExitElementsRef,
    transitionSessionStallCountRef,
    transitionSessionBufferedFramesRef,
    transitionPrewarmPromiseRef,
    transitionSessionTraceRef,
    transitionTelemetryRef,
  }))

  const rendererControllerRefs = $derived.by(() => ({
    isGizmoInteractingRef,
    bypassPreviewSeekRef,
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
  }))

  const renderPumpRefs = $derived.by(() => ({
    playerRef,
    isGizmoInteractingRef,
    bypassPreviewSeekRef,
    scrubCanvasRef,
    scrubRendererRef,
    scrubMountedRef,
    scrubRenderInFlightRef,
    scrubRenderGenerationRef,
    scrubDirectionRef,
    scrubRequestedFrameRef,
    scrubPrewarmQueueRef,
    scrubPrewarmQueuedSetRef,
    scrubPrewarmedFramesRef,
    scrubPrewarmedFrameSetRef,
    scrubPrewarmedSourcesRef,
    scrubPrewarmedSourceOrderRef,
    scrubPrewarmedSourceTouchFrameRef,
    scrubOffscreenCanvasRef,
    scrubOffscreenRenderedFrameRef,
    committedPreviewSnapshotRef,
    bgTransitionRenderInFlightRef,
    resumeScrubLoopRef,
    lastBackwardScrubPreloadAtRef,
    lastBackwardScrubRenderAtRef,
    lastBackwardRequestedFrameRef,
    suppressScrubBackgroundPrewarmRef,
    fallbackToPlayerScrubRef,
    lastPausedPrearmTargetRef,
    lastPlayingPrearmTargetRef,
    deferredPlaybackTransitionPrepareFrameRef,
    transitionPrepareTimeoutRef,
    transitionSessionWindowRef,
    transitionSessionPinnedElementsRef,
    transitionSessionStallCountRef,
    transitionSessionBufferedFramesRef,
    transitionPrewarmPromiseRef,
    transitionSessionTraceRef,
  }))

  const mediaPreloadRefs = $derived.by(() => ({
    lastForwardScrubPreloadAtRef,
    lastBackwardScrubPreloadAtRef,
  }))

  return {
    playerRef,
    scrubCanvasRef,
    gpuEffectsCanvasRef,
    scrubFrameDirtyRef,
    bypassPreviewSeekRef,
    isGizmoInteractingRef,
    preferPlayerForDomGizmoRef,
    preferPlayerForStyledTextScrubRef,
    adaptiveQualityStateRef,
    adaptiveFrameSampleRef,
    scrubOffscreenCanvasRef,
    transitionSessionTraceRef,
    transitionTelemetryRef,
    transitionSessionBufferedFramesRef,
    lastPausedPrearmTargetRef,
    lastPlayingPrearmTargetRef,
    get transitionSessionControllerRefs() {
      return transitionSessionControllerRefs
    },
    get rendererControllerRefs() {
      return rendererControllerRefs
    },
    get renderPumpRefs() {
      return renderPumpRefs
    },
    get mediaPreloadRefs() {
      return mediaPreloadRefs
    },
  }
}
