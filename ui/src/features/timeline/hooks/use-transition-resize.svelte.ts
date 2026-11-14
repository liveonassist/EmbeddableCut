// SPDX-License-Identifier: MIT

import type { Transition } from '@/types/transition'
import { commitPreviewFrameToCurrentFrame } from '@/shared/state/playback'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { updateTransition } from '@/features/timeline/stores/timeline-actions'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { pixelsToTimeNow } from '@/features/timeline/utils/zoom-conversions'
import { getMaxTransitionDurationForHandles } from '@/features/timeline/utils/transition-utils'
import { select } from '$lib/store.svelte'
import { setGlobalCursorStyle } from '../utils/global-cursor-roots'

type ResizeHandle = 'left' | 'right'

interface ResizeState {
  isResizing: boolean
  handle: ResizeHandle | null
  startX: number
  initialDuration: number
  currentDelta: number
}

const IDLE_RESIZE_STATE: ResizeState = {
  isResizing: false,
  handle: null,
  startX: 0,
  initialDuration: 0,
  currentDelta: 0,
}

/**
 * Hook for handling transition duration resizing via drag handles.
 *
 * Optimized approach:
 * - Visual feedback via local state during drag (no store updates)
 * - Only commit to store on mouseup (single undo entry)
 * - Smooth performance with RAF updates
 * - Respects min/max duration constraints
 */
export function useTransitionResize(transition: () => Transition) {
  const pixelsToTime = pixelsToTimeNow
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const leftClip = $derived.by(() => {
    const leftClipId = transition().leftClipId
    return select(useItemsStore, (s) => s.itemById[leftClipId] ?? null)
  })
  const rightClip = $derived.by(() => {
    const rightClipId = transition().rightClipId
    return select(useItemsStore, (s) => s.itemById[rightClipId] ?? null)
  })

  const maxDuration = $derived.by(() => {
    const { durationInFrames, alignment } = transition()
    const left = leftClip.current
    const right = rightClip.current
    if (!left || !right) return Math.max(1, durationInFrames)

    const leftEnd = left.from + left.durationInFrames
    const isAdjacent = Math.abs(leftEnd - right.from) <= 1
    if (!isAdjacent) {
      const legacyMax = Math.floor(Math.min(left.durationInFrames, right.durationInFrames) - 1)
      return Math.max(1, Math.max(durationInFrames, legacyMax))
    }

    const handleMax = getMaxTransitionDurationForHandles(left, right, alignment, fps.current)
    return Math.max(1, Math.max(durationInFrames, handleMax))
  })

  let resizeState = $state.raw<ResizeState>(IDLE_RESIZE_STATE)
  // Listeners follow the resize flag only, not every delta update.
  const isResizing = $derived(resizeState.isResizing)

  // Mouse move handler - updates local state for visual feedback
  const handleMouseMove = (e: MouseEvent) => {
    if (!resizeState.isResizing) return

    // Prevent other drag behaviors during resize
    e.preventDefault()
    e.stopPropagation()

    const deltaX = e.clientX - resizeState.startX
    const deltaTime = pixelsToTime(deltaX)
    let deltaFrames = Math.round(deltaTime * fps.current)

    // Left handle: negative deltaX = increase duration
    // Right handle: positive deltaX = increase duration
    if (resizeState.handle === 'left') {
      deltaFrames = -deltaFrames
    }

    // Calculate new duration and clamp
    const newDuration = Math.max(
      1,
      Math.min(maxDuration, resizeState.initialDuration + deltaFrames),
    )
    const clampedDelta = newDuration - resizeState.initialDuration

    resizeState = { ...resizeState, currentDelta: clampedDelta }
  }

  // Mouse up handler - commits changes to store
  const handleMouseUp = (e: MouseEvent) => {
    if (!resizeState.isResizing) return

    // Prevent other behaviors when finishing resize
    e.preventDefault()
    e.stopPropagation()

    const { initialDuration, currentDelta } = resizeState
    const newDuration = initialDuration + currentDelta

    // Only update if duration actually changed
    if (currentDelta !== 0) {
      updateTransition(transition().id, { durationInFrames: newDuration })
    }
    resizeState = IDLE_RESIZE_STATE

    setGlobalCursorStyle('cursor', '')
    setGlobalCursorStyle('userSelect', '')
  }

  // Start resizing
  const handleResizeStart = (e: MouseEvent, handle: ResizeHandle) => {
    e.preventDefault()
    e.stopPropagation()
    commitPreviewFrameToCurrentFrame()

    resizeState = {
      isResizing: true,
      handle,
      startX: e.clientX,
      initialDuration: transition().durationInFrames,
      currentDelta: 0,
    }

    setGlobalCursorStyle('cursor', 'ew-resize')
    setGlobalCursorStyle('userSelect', 'none')
  }

  // Add/remove global listeners with capture to intercept events first
  $effect(() => {
    if (!isResizing) return
    // Use capture phase to ensure these handlers run before other listeners
    document.addEventListener('mousemove', handleMouseMove, { capture: true })
    document.addEventListener('mouseup', handleMouseUp, { capture: true })
    // Also prevent click events that might fire after mouseup
    const preventClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('click', preventClick, { capture: true, once: true })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true })
      document.removeEventListener('mouseup', handleMouseUp, { capture: true })
      document.removeEventListener('click', preventClick, { capture: true })
    }
  })

  return {
    get isResizing() {
      return resizeState.isResizing
    },
    get resizeHandle() {
      return resizeState.handle
    },
    get resizeDelta() {
      return resizeState.currentDelta
    },
    handleResizeStart,
    /** Preview duration during resize */
    get previewDuration() {
      return resizeState.isResizing
        ? resizeState.initialDuration + resizeState.currentDelta
        : transition().durationInFrames
    },
  }
}
