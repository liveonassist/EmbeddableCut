// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { PreviewQuality } from '@/shared/state/playback'
import { usePlaybackStore } from '@/shared/state/playback'
import { ADAPTIVE_PREVIEW_QUALITY_ENABLED } from '@/features/preview/utils/preview-constants'
import { createAdaptivePreviewQualityState } from '@/features/preview/utils/adaptive-preview-quality'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
import { shouldPreferDomPlayerForGizmo } from '@/features/preview/utils/gizmo-preview-presentation'

interface UsePreviewRuntimeGuardsParams {
  forceFastScrubOverlay: boolean
  isGizmoInteractingRef: { current: boolean }
  preferPlayerForDomGizmoRef: { current: boolean }
  setAdaptiveQualityCap: (next: PreviewQuality | ((prev: PreviewQuality) => PreviewQuality)) => void
  adaptiveQualityStateRef: { current: ReturnType<typeof createAdaptivePreviewQualityState> }
  adaptiveFrameSampleRef: { current: { frame: number; tsMs: number } | null }
}

function clearPreviewFramePreservingViewedFrame() {
  const playback = usePlaybackStore.getState()
  if (playback.previewFrame === null) return

  if (playback.currentFrame !== playback.previewFrame) {
    playback.setCurrentFrame(playback.previewFrame)
  }
  playback.setPreviewFrame(null)
}

export function usePreviewRuntimeGuards(params: () => UsePreviewRuntimeGuardsParams) {
  const {
    forceFastScrubOverlay,
    isGizmoInteractingRef,
    preferPlayerForDomGizmoRef,
    setAdaptiveQualityCap,
    adaptiveQualityStateRef,
    adaptiveFrameSampleRef,
  } = $derived(params())
  $effect(() =>
    untrack(() => {
      clearPreviewFramePreservingViewedFrame()
    }),
  )

  $effect(() => {
    void [forceFastScrubOverlay]

    let wasInteracting = false
    const syncGizmoState = (state: ReturnType<typeof useGizmoStore.getState>) => {
      const activeGizmo = state.activeGizmo
      const isInteracting = activeGizmo !== null
      isGizmoInteractingRef.current = isInteracting
      preferPlayerForDomGizmoRef.current =
        isInteracting && shouldPreferDomPlayerForGizmo(forceFastScrubOverlay, activeGizmo?.itemType)

      if (isInteracting && !wasInteracting) {
        // Clear stale hover-scrub state without rerendering the large preview
        // tree just to mirror interaction ownership into refs.
        clearPreviewFramePreservingViewedFrame()
      }
      wasInteracting = isInteracting
    }

    syncGizmoState(useGizmoStore.getState())
    return useGizmoStore.subscribe(syncGizmoState)
  })

  $effect(() => {
    if (!ADAPTIVE_PREVIEW_QUALITY_ENABLED) {
      adaptiveFrameSampleRef.current = null
      adaptiveQualityStateRef.current = createAdaptivePreviewQualityState(1)
      setAdaptiveQualityCap((quality) => (quality === 1 ? quality : 1))
      return
    }

    const applyPlaybackState = (isPlaying: boolean) => {
      adaptiveFrameSampleRef.current = null
      if (isPlaying) return

      adaptiveQualityStateRef.current = createAdaptivePreviewQualityState(1)
      setAdaptiveQualityCap((quality) => (quality === 1 ? quality : 1))
    }

    applyPlaybackState(usePlaybackStore.getState().isPlaying)
    return usePlaybackStore.subscribe((state, previousState) => {
      if (state.isPlaying !== previousState.isPlaying) {
        applyPlaybackState(state.isPlaying)
      }
    })
  })
}
