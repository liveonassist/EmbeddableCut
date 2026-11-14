// SPDX-License-Identifier: MIT

/**
 * Playback frame for the keyframe editor.
 *
 * Perf-critical: keyframe edits must not re-render the editor on every playback
 * tick or scrub pointer move — the playhead overlay tracks those by direct DOM.
 * This hook keeps the editor's `currentFrame` to one commit per displayed frame
 * (rAF-coalesced) and skips updates while playing or scrubbing.
 */

import { usePlaybackStore } from '@/shared/state/playback'

export function useKeyframeEditorPlaybackFrame(
  selectedItemId: () => string | null,
  editorScrubbingRef: { current: boolean },
): { readonly current: number } {
  const initialFrame = usePlaybackStore.getState().currentFrame
  let frame = $state(initialFrame)
  let committedFrame = initialFrame

  $effect.pre(() => {
    selectedItemId()
    const nextFrame = usePlaybackStore.getState().currentFrame
    committedFrame = nextFrame
    frame = nextFrame
  })

  $effect(() => {
    selectedItemId()
    let wasPlaying = usePlaybackStore.getState().isPlaying
    let rafId: number | null = null
    let pendingFrame: number | null = null

    // Coalesce rapid scrub updates to one commit per animation frame. Pointer
    // moves can fire several store updates per frame; without this the keyframe
    // editor (dopesheet/graph) updates multiple times per displayed frame.
    const flush = () => {
      rafId = null
      if (pendingFrame === null) return
      const nextFrame = pendingFrame
      pendingFrame = null
      if (committedFrame === nextFrame) return
      committedFrame = nextFrame
      frame = nextFrame
    }

    const commitFrame = (nextFrame: number) => {
      pendingFrame = nextFrame
      if (rafId === null) {
        rafId = requestAnimationFrame(flush)
      }
    }

    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const nextFrame = state.currentFrame

      if (state.isPlaying) {
        // Keep the (relatively expensive) full editor update out of the
        // playback hot path. The playhead line still tracks playback via a
        // self-subscribing overlay (see DopesheetPlayheadLine / GraphPlayhead),
        // which moves it by direct DOM without updating the editor.
        wasPlaying = true
        return
      }

      if (wasPlaying) {
        wasPlaying = false
        commitFrame(nextFrame)
        return
      }

      const isSettledSeek = state.previewFrame === null
      if (isSettledSeek && !editorScrubbingRef.current) {
        commitFrame(nextFrame)
      }
    })

    return () => {
      unsubscribe()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  })

  return {
    get current() {
      return frame
    },
  }
}
