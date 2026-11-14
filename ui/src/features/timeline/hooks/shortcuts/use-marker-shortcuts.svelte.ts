// SPDX-License-Identifier: MIT

/**
 * Marker shortcuts: M (add), Shift+M (remove), [ ] (navigate).
 */

import { usePlaybackStore } from '@/shared/state/playback'
import { useMarkersStore } from '@/features/timeline/stores/markers-store'
import { useSelectionStore } from '@/shared/state/selection'
import { addMarker, removeMarker } from '@/features/timeline/stores/actions/marker-actions'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { useTimelineHotkey } from './timeline-hotkey'

export function useMarkerShortcuts(): void {
  const hotkeys = useResolvedHotkeys()

  // Markers: M - Add marker at playhead
  useTimelineHotkey(
    () => hotkeys.current.ADD_MARKER,
    (event) => {
      event.preventDefault()
      const { previewFrame, currentFrame } = usePlaybackStore.getState()
      addMarker(previewFrame ?? currentFrame)
    },
  )

  // Markers: Shift+M - Remove selected marker
  useTimelineHotkey(
    () => hotkeys.current.REMOVE_MARKER,
    (event) => {
      event.preventDefault()
      const id = useSelectionStore.getState().selectedMarkerId
      if (id) {
        removeMarker(id)
        useSelectionStore.getState().clearSelection()
      }
    },
  )

  // Markers: [ - Jump to previous marker
  useTimelineHotkey(
    () => hotkeys.current.PREVIOUS_MARKER,
    (event) => {
      event.preventDefault()
      const currentMarkers = useMarkersStore.getState().markers
      if (currentMarkers.length === 0) return
      const currentFrame = usePlaybackStore.getState().currentFrame
      let previousFrame: number | undefined
      for (const marker of currentMarkers) {
        if (marker.frame < currentFrame) {
          if (previousFrame === undefined || marker.frame > previousFrame) {
            previousFrame = marker.frame
          }
        }
      }
      if (previousFrame !== undefined) {
        usePlaybackStore.getState().setCurrentFrame(previousFrame)
      }
    },
  )

  // Markers: ] - Jump to next marker
  useTimelineHotkey(
    () => hotkeys.current.NEXT_MARKER,
    (event) => {
      event.preventDefault()
      const currentMarkers = useMarkersStore.getState().markers
      if (currentMarkers.length === 0) return
      const currentFrame = usePlaybackStore.getState().currentFrame
      let nextFrame: number | undefined
      for (const marker of currentMarkers) {
        if (marker.frame > currentFrame) {
          if (nextFrame === undefined || marker.frame < nextFrame) {
            nextFrame = marker.frame
          }
        }
      }
      if (nextFrame !== undefined) {
        usePlaybackStore.getState().setCurrentFrame(nextFrame)
      }
    },
  )
}
