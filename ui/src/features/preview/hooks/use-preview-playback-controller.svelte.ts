// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

import type { PreviewQuality } from '@/shared/state/playback'
import { usePlaybackStore } from '@/shared/state/playback'
import type { ItemKeyframes } from '@/types/keyframe'
import type { TimelineTrack } from '@/types/timeline'
import {
  type AdaptivePreviewQualityState,
  getFrameBudgetMs,
  updateAdaptivePreviewQuality,
} from '@/features/preview/utils/adaptive-preview-quality'
import { shouldPreferPlayerForStyledTextScrub as shouldPreferPlayerForStyledTextScrubGuard } from '@/features/preview/utils/text-render-guard'
import { getPreviewRuntimeSnapshotFromPlaybackState } from '@/features/preview/utils/preview-state-coordinator'
import { resolvePlaybackColdStartFrameAdvance } from '@/features/preview/utils/playback-cold-start-event'
import { usePreviewRuntimeGuards } from './use-preview-runtime-guards.svelte'
import type { PreviewPerfStats } from './use-preview-diagnostics.svelte'

interface UsePreviewPlaybackControllerParams {
  fps: number
  combinedTracks: TimelineTrack[]
  keyframes: ItemKeyframes[]
  forceFastScrubOverlay: boolean
  domTextScrubOverlayEnabled: boolean
  previewPerfRef: { current: PreviewPerfStats }
  isGizmoInteractingRef: { current: boolean }
  preferPlayerForDomGizmoRef: { current: boolean }
  preferPlayerForStyledTextScrubRef: { current: boolean }
  adaptiveQualityStateRef: { current: AdaptivePreviewQualityState }
  adaptiveFrameSampleRef: { current: { frame: number; tsMs: number } | null }
  ignorePlayerUpdatesRef: { current: boolean }
  resolvePendingSeekLatency: (frame: number) => void
}

export function usePreviewPlaybackController(params: () => UsePreviewPlaybackControllerParams) {
  const {
    fps,
    combinedTracks,
    keyframes,
    forceFastScrubOverlay,
    domTextScrubOverlayEnabled,
    previewPerfRef,
    isGizmoInteractingRef,
    preferPlayerForDomGizmoRef,
    preferPlayerForStyledTextScrubRef,
    adaptiveQualityStateRef,
    adaptiveFrameSampleRef,
    ignorePlayerUpdatesRef,
    resolvePendingSeekLatency,
  } = $derived(params())
  let adaptiveQualityCap = $state.raw<PreviewQuality>(1)
  const setAdaptiveQualityCap = (
    next: PreviewQuality | ((prev: PreviewQuality) => PreviewQuality),
  ) => {
    adaptiveQualityCap =
      typeof next === 'function'
        ? (next as (prev: PreviewQuality) => PreviewQuality)(untrack(() => adaptiveQualityCap))
        : next
  }

  usePreviewRuntimeGuards(() => ({
    forceFastScrubOverlay,
    isGizmoInteractingRef,
    preferPlayerForDomGizmoRef,
    setAdaptiveQualityCap,
    adaptiveQualityStateRef,
    adaptiveFrameSampleRef,
  }))

  const preferPlayerForStyledTextScrub = $derived(
    !domTextScrubOverlayEnabled &&
      !forceFastScrubOverlay &&
      shouldPreferPlayerForStyledTextScrubGuard(combinedTracks, keyframes),
  )
  $effect.pre(() => {
    preferPlayerForStyledTextScrubRef.current = preferPlayerForStyledTextScrub
  })

  const shouldPreferPlayerForPreview = (previewFrame: number | null) => {
    return (
      preferPlayerForDomGizmoRef.current ||
      (preferPlayerForStyledTextScrubRef.current && previewFrame !== null)
    )
  }

  const handleFrameChange = (frame: number) => {
    const nextFrame = Math.round(frame)
    resolvePendingSeekLatency(nextFrame)
    if (ignorePlayerUpdatesRef.current) return
    const playbackState = usePlaybackStore.getState()
    const runtimeSnapshot = getPreviewRuntimeSnapshotFromPlaybackState(
      playbackState,
      isGizmoInteractingRef.current,
    )
    const interactionMode = runtimeSnapshot.mode
    if (interactionMode === 'scrubbing') return

    if (interactionMode === 'playing') {
      resolvePlaybackColdStartFrameAdvance(nextFrame)
      const nowMs = performance.now()
      const previousSample = adaptiveFrameSampleRef.current
      if (previousSample && nextFrame !== previousSample.frame) {
        const frameDelta = Math.max(1, Math.abs(nextFrame - previousSample.frame))
        const elapsedMs = nowMs - previousSample.tsMs
        if (elapsedMs > 0) {
          const result = updateAdaptivePreviewQuality({
            state: adaptiveQualityStateRef.current,
            sampleMsPerFrame: elapsedMs / frameDelta,
            frameBudgetMs: getFrameBudgetMs(fps, playbackState.playbackRate),
            userQuality: playbackState.previewQuality,
            nowMs,
            allowRecovery: false,
          })
          adaptiveQualityStateRef.current = result.state
          if (result.qualityChanged) {
            if (result.qualityChangeDirection === 'degrade') {
              previewPerfRef.current.adaptiveQualityDowngrades += 1
            } else if (result.qualityChangeDirection === 'recover') {
              previewPerfRef.current.adaptiveQualityRecovers += 1
            }
            setAdaptiveQualityCap(result.state.qualityCap)
          }
        }
      }
      adaptiveFrameSampleRef.current = { frame: nextFrame, tsMs: nowMs }
    } else {
      adaptiveFrameSampleRef.current = null
      if (
        adaptiveQualityStateRef.current.overBudgetSamples !== 0 ||
        adaptiveQualityStateRef.current.underBudgetSamples !== 0
      ) {
        adaptiveQualityStateRef.current = {
          ...adaptiveQualityStateRef.current,
          overBudgetSamples: 0,
          underBudgetSamples: 0,
        }
      }
    }

    const { currentFrame, setCurrentFrame } = playbackState
    if (currentFrame === nextFrame) return
    if (interactionMode === 'paused') return
    setCurrentFrame(nextFrame)
  }

  const handlePlayStateChange = (playing: boolean) => {
    const playback = usePlaybackStore.getState()
    if (playback.playbackScrubResumeTransport !== null) return
    if (playing) {
      if (!playback.isPlaying) {
        playback.play()
      }
    } else if (playback.isPlaying) {
      playback.pause()
    }
  }

  return {
    get adaptiveQualityCap() {
      return adaptiveQualityCap
    },
    shouldPreferPlayerForPreview,
    handleFrameChange,
    handlePlayStateChange,
  }
}
