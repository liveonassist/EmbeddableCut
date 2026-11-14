// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

import { usePlaybackStore } from '@/shared/state/playback'
import {
  pushRenderSourceSwitchHistory,
  type PreviewRenderSource,
  type RenderSourceSwitchEntry,
} from '@/features/preview/utils/preview-perf-metrics'
import { PREVIEW_PERF_RENDER_SOURCE_HISTORY_MAX } from '@/features/preview/utils/preview-constants'

interface UsePreviewOverlayControllerParams {
  bypassPreviewSeekRef: { current: boolean }
  setDisplayedFrame: (frame: number | null) => void
}

interface UsePreviewOverlayControllerResult {
  isRenderedOverlayVisible: boolean
  showFastScrubOverlayRef: { current: boolean }
  showPlaybackTransitionOverlayRef: { current: boolean }
  renderSourceRef: { current: PreviewRenderSource }
  renderSourceSwitchCountRef: { current: number }
  renderSourceHistoryRef: { current: RenderSourceSwitchEntry[] }
  hideFastScrubOverlay: () => void
  hidePlaybackTransitionOverlay: () => void
  showFastScrubOverlayForFrame: () => void
  showPlaybackTransitionOverlayForFrame: () => void
}

export function usePreviewOverlayController(
  params: () => UsePreviewOverlayControllerParams,
): UsePreviewOverlayControllerResult {
  const { bypassPreviewSeekRef, setDisplayedFrame } = $derived(params())
  let showFastScrubOverlay = $state.raw(false)
  const setShowFastScrubOverlay = (
    next:
      | typeof showFastScrubOverlay
      | ((prev: typeof showFastScrubOverlay) => typeof showFastScrubOverlay),
  ) => {
    showFastScrubOverlay =
      typeof next === 'function'
        ? (next as (prev: typeof showFastScrubOverlay) => typeof showFastScrubOverlay)(
            untrack(() => showFastScrubOverlay),
          )
        : next
  }
  let showPlaybackTransitionOverlay = $state.raw(false)
  const setShowPlaybackTransitionOverlay = (
    next:
      | typeof showPlaybackTransitionOverlay
      | ((prev: typeof showPlaybackTransitionOverlay) => typeof showPlaybackTransitionOverlay),
  ) => {
    showPlaybackTransitionOverlay =
      typeof next === 'function'
        ? (
            next as (
              prev: typeof showPlaybackTransitionOverlay,
            ) => typeof showPlaybackTransitionOverlay
          )(untrack(() => showPlaybackTransitionOverlay))
        : next
  }
  const showFastScrubOverlayRef = { current: false }
  const showPlaybackTransitionOverlayRef = { current: false }
  const renderSourceRef: { current: PreviewRenderSource } = { current: 'player' }
  const renderSourceSwitchCountRef = { current: 0 }
  const renderSourceHistoryRef: { current: RenderSourceSwitchEntry[] } = { current: [] }

  const hideFastScrubOverlay = () => {
    showFastScrubOverlayRef.current = false
    setShowFastScrubOverlay(false)
    bypassPreviewSeekRef.current = false
  }

  const hidePlaybackTransitionOverlay = () => {
    showPlaybackTransitionOverlayRef.current = false
    setShowPlaybackTransitionOverlay(false)
  }

  const showFastScrubOverlayForFrame = () => {
    showPlaybackTransitionOverlayRef.current = false
    setShowPlaybackTransitionOverlay(false)
    showFastScrubOverlayRef.current = true
    setShowFastScrubOverlay(true)
    bypassPreviewSeekRef.current = true
  }

  const showPlaybackTransitionOverlayForFrame = () => {
    showFastScrubOverlayRef.current = false
    setShowFastScrubOverlay(false)
    showPlaybackTransitionOverlayRef.current = true
    setShowPlaybackTransitionOverlay(true)
    bypassPreviewSeekRef.current = false
  }

  const isRenderedOverlayVisible = $derived(showFastScrubOverlay || showPlaybackTransitionOverlay)

  $effect(() => {
    showFastScrubOverlayRef.current = showFastScrubOverlay
    showPlaybackTransitionOverlayRef.current = showPlaybackTransitionOverlay
    const nextSource: PreviewRenderSource = showFastScrubOverlay
      ? 'fast_scrub_overlay'
      : showPlaybackTransitionOverlay
        ? 'playback_transition_overlay'
        : 'player'
    const prevSource = renderSourceRef.current
    if (prevSource !== nextSource) {
      renderSourceSwitchCountRef.current += 1
      renderSourceHistoryRef.current = pushRenderSourceSwitchHistory(
        renderSourceHistoryRef.current,
        {
          ts: Date.now(),
          atFrame: usePlaybackStore.getState().currentFrame,
          from: prevSource,
          to: nextSource,
        },
        PREVIEW_PERF_RENDER_SOURCE_HISTORY_MAX,
      )
    }
    renderSourceRef.current = nextSource
  })

  $effect(() => {
    if (!isRenderedOverlayVisible) {
      setDisplayedFrame(null)
    }
  })

  return {
    get isRenderedOverlayVisible() {
      return isRenderedOverlayVisible
    },
    showFastScrubOverlayRef,
    showPlaybackTransitionOverlayRef,
    renderSourceRef,
    renderSourceSwitchCountRef,
    renderSourceHistoryRef,
    hideFastScrubOverlay,
    hidePlaybackTransitionOverlay,
    showFastScrubOverlayForFrame,
    showPlaybackTransitionOverlayForFrame,
  }
}
