// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { usePlaybackStore } from '@/shared/state/playback'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import {
  commitTrackHeights,
  resetTrackHeights,
} from '@/features/timeline/stores/actions/track-height-actions'
import { resizeAllTracksInList, resizeTrackInList } from '@/features/timeline/utils/track-resize'
import { getTrackKind } from '@/features/timeline/utils/classic-tracks'
import { flushTrackHeightOverrides } from '@/features/timeline/utils/track-heights'
import { createRafCoalescedCallback } from '@/features/timeline/utils/raf-coalesced-callback'
import { setGlobalCursorStyle } from '@/shared/ui/global-cursor-roots'

interface TrackResizeState {
  trackId: string | null
  startY: number
  startHeight: number
  currentHeight: number
  deltaDirection: -1 | 1
  applyToAll: boolean
  didChange: boolean
}

const IDLE_RESIZE_STATE: TrackResizeState = {
  trackId: null,
  startY: 0,
  startHeight: 0,
  currentHeight: 0,
  deltaDirection: 1,
  applyToAll: false,
  didChange: false,
}

export function useTrackHeightResize() {
  let resizeState = $state.raw<TrackResizeState>(IDLE_RESIZE_STATE)
  // The listeners follow the resized track only, not every height update.
  const activeTrackId = $derived(resizeState.trackId)

  const finishResize = () => {
    const state = resizeState
    if (!state.trackId) return

    // Overrides accumulate in memory during the drag; land them on mouseup.
    if (state.didChange) {
      flushTrackHeightOverrides()
    }

    resizeState = IDLE_RESIZE_STATE
    setGlobalCursorStyle('cursor', '')
    setGlobalCursorStyle('userSelect', '')
  }

  const handleMouseMove = (event: MouseEvent) => {
    const state = resizeState
    if (!state.trackId) return

    event.preventDefault()
    event.stopPropagation()

    const currentTracks = useItemsStore.getState().tracks
    const nextHeight = state.startHeight + (event.clientY - state.startY) * state.deltaDirection
    const nextTracks = state.applyToAll
      ? resizeAllTracksInList(currentTracks, nextHeight)
      : resizeTrackInList(currentTracks, state.trackId, nextHeight)

    if (nextTracks === currentTracks) {
      return
    }

    const resizedTrack = nextTracks.find((track) => track.id === state.trackId)
    if (!resizedTrack) return

    commitTrackHeights(nextTracks)

    resizeState = {
      ...resizeState,
      currentHeight: resizedTrack.height,
      didChange: true,
    }
  }

  const handleMouseUp = (event: MouseEvent) => {
    if (!resizeState.trackId) return

    event.preventDefault()
    event.stopPropagation()
    finishResize()
  }

  const handleResizeStart = (event: MouseEvent, trackId: string) => {
    const track = useItemsStore.getState().tracks.find((candidate) => candidate.id === trackId)
    if (!track) return

    event.preventDefault()
    event.stopPropagation()
    usePlaybackStore.getState().setPreviewFrame(null)

    resizeState = {
      trackId,
      startY: event.clientY,
      startHeight: track.height,
      currentHeight: track.height,
      deltaDirection: getTrackKind(track) === 'audio' ? 1 : -1,
      applyToAll: event.altKey,
      didChange: false,
    }

    setGlobalCursorStyle('cursor', 'row-resize')
    setGlobalCursorStyle('userSelect', 'none')
  }

  const handleResizeReset = (event: MouseEvent, trackId: string) => {
    const track = useItemsStore.getState().tracks.find((candidate) => candidate.id === trackId)
    if (!track) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    // Reset drops the override so the track follows the saved Track Size
    // preset again — not the built-in default, which would silently discard
    // the user's choice.
    resetTrackHeights(trackId, event.altKey)
    flushTrackHeightOverrides()
  }

  $effect(() => {
    if (!activeTrackId) return

    return untrack(() => {
      // Each move commits a new tracks array (re-rendering every row), so coalesce
      // the high-frequency pointer stream to at most one commit per frame.
      const coalescedMouseMove = createRafCoalescedCallback(handleMouseMove)
      const queueMouseMove = (event: MouseEvent) => coalescedMouseMove.queue(event)
      const handleCoalescedMouseUp = (event: MouseEvent) => {
        coalescedMouseMove.flush()
        handleMouseUp(event)
      }

      document.addEventListener('mousemove', queueMouseMove, { capture: true })
      document.addEventListener('mouseup', handleCoalescedMouseUp, { capture: true })

      const preventClick = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
      }

      document.addEventListener('click', preventClick, { capture: true, once: true })

      return () => {
        coalescedMouseMove.cancel()
        document.removeEventListener('mousemove', queueMouseMove, { capture: true })
        document.removeEventListener('mouseup', handleCoalescedMouseUp, { capture: true })
        document.removeEventListener('click', preventClick, { capture: true })
      }
    })
  })

  return {
    handleTrackResizeStart: handleResizeStart,
    handleTrackResizeReset: handleResizeReset,
  }
}
