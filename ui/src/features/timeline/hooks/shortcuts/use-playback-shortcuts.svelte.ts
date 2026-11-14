// SPDX-License-Identifier: MIT

/**
 * Playback & Navigation shortcuts: Space, Arrow Left/Right, Home/End, Up/Down snap points.
 */

import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useMarkersStore } from '@/features/timeline/stores/markers-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts.svelte'
import { useSourcePlayerStore } from '@/shared/state/source-player'
import { getFilteredItemSnapEdges } from '@/features/timeline/utils/timeline-snap-utils'
import { getVisibleTrackIds } from '@/features/timeline/utils/group-utils'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { useTimelineHotkey } from './timeline-hotkey'

/** Compute snap points on-demand from current store state (avoids reactive subscriptions). */
function getSnapPoints(): number[] {
  const items = useItemsStore.getState().items
  const markers = useMarkersStore.getState().markers
  const transitions = useTransitionsStore.getState().transitions
  const tracks = useItemsStore.getState().tracks
  const visibleTrackIds = getVisibleTrackIds(tracks)
  const points = new Set<number>()

  for (const edge of getFilteredItemSnapEdges(items, transitions, visibleTrackIds)) {
    points.add(edge.frame)
  }
  for (const marker of markers) {
    points.add(marker.frame)
  }
  return Array.from(points).sort((a, b) => a - b)
}

function commitTimelineSeek(frame: number): void {
  usePlaybackStore.getState().setPreviewFrame(null)
  usePreviewBridgeStore.getState().setDisplayedFrame(null)
  usePlaybackStore.getState().setCurrentFrame(frame)
}

export function usePlaybackShortcuts(callbacks: () => TimelineShortcutCallbacks): void {
  const hotkeys = useResolvedHotkeys()

  // Playback: Space - Play/Pause
  useTimelineHotkey(
    () => hotkeys.current.PLAY_PAUSE,
    (event) => {
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.toggle()
        return
      }
      const { isPlaying, togglePlayPause } = usePlaybackStore.getState()
      togglePlayPause()
      const { onPause, onPlay } = callbacks()
      if (isPlaying && onPause) {
        onPause()
      } else if (!isPlaying && onPlay) {
        onPlay()
      }
    },
  )

  // Shuttle: L advances forward through 1x, 2x, and 4x. Ignore browser key
  // repeat so one physical press produces one transport transition.
  useTimelineHotkey(
    () => 'l',
    (event) => {
      if (event.repeat) return
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.shuttleForward()
        return
      }
      const wasPlaying = usePlaybackStore.getState().isPlaying
      usePlaybackStore.getState().shuttleForward()
      if (!wasPlaying) {
        callbacks().onPlay?.()
      }
    },
  )

  // Shuttle: J mirrors L in reverse. Browser media stays on a paused visual
  // seek path for negative rates; the Clock still advances at display cadence.
  useTimelineHotkey(
    () => 'j',
    (event) => {
      if (event.repeat) return
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.shuttleReverse()
        return
      }
      const wasPlaying = usePlaybackStore.getState().isPlaying
      usePlaybackStore.getState().shuttleReverse()
      if (!wasPlaying) {
        callbacks().onPlay?.()
      }
    },
  )

  // K owns pause only while a transport is active. When already paused it
  // yields to the existing Edit keyframe shortcut.
  // FreeCut listens in the capture phase, so stopping propagation keeps the
  // dopesheet's K from also firing. Here every shortcut shares the window's
  // bubble phase: stopImmediatePropagation stops the listeners registered
  // after this one, which never re-registers.
  useTimelineHotkey(
    () => 'k',
    (event) => {
      if (event.repeat) return
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        if (!playerMethods.isPlaying()) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        playerMethods.pause()
        return
      }
      if (!usePlaybackStore.getState().isPlaying) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      usePlaybackStore.getState().pause()
      callbacks().onPause?.()
    },
  )

  // Navigation: Arrow Left - Previous frame
  useTimelineHotkey(
    () => hotkeys.current.PREVIOUS_FRAME,
    (event) => {
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.frameBack(1)
        return
      }
      const currentFrame = usePlaybackStore.getState().currentFrame
      commitTimelineSeek(Math.max(0, currentFrame - 1))
    },
  )

  // Navigation: Arrow Right - Next frame
  useTimelineHotkey(
    () => hotkeys.current.NEXT_FRAME,
    (event) => {
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.frameForward(1)
        return
      }
      const currentFrame = usePlaybackStore.getState().currentFrame
      commitTimelineSeek(currentFrame + 1)
    },
  )

  // Navigation: Home - Go to start
  useTimelineHotkey(
    () => hotkeys.current.GO_TO_START,
    (event) => {
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.seek(0)
        return
      }
      commitTimelineSeek(0)
    },
  )

  // Navigation: End - Go to end of timeline (last frame of last item)
  useTimelineHotkey(
    () => hotkeys.current.GO_TO_END,
    (event) => {
      event.preventDefault()
      const { hoveredPanel, playerMethods } = useSourcePlayerStore.getState()
      if (hoveredPanel === 'source' && playerMethods) {
        playerMethods.seek(playerMethods.getDurationInFrames() - 1)
        return
      }
      const currentItems = useItemsStore.getState().items
      const lastFrame = currentItems.reduce((max, item) => {
        const itemEnd = item.from + item.durationInFrames
        return Math.max(max, itemEnd)
      }, 0)
      commitTimelineSeek(lastFrame)
    },
  )

  // Navigation: Down - Jump to next snap point (clip edge or marker)
  useTimelineHotkey(
    () => hotkeys.current.NEXT_SNAP_POINT,
    (event) => {
      event.preventDefault()
      const currentFrame = usePlaybackStore.getState().currentFrame
      const nextEdge = getSnapPoints().find((edge) => edge > currentFrame)
      if (nextEdge !== undefined) {
        commitTimelineSeek(nextEdge)
      }
    },
  )

  // Navigation: Up - Jump to previous snap point (clip edge or marker)
  useTimelineHotkey(
    () => hotkeys.current.PREVIOUS_SNAP_POINT,
    (event) => {
      event.preventDefault()
      const currentFrame = usePlaybackStore.getState().currentFrame
      const snapPoints = getSnapPoints()
      let previousEdge: number | undefined
      for (let i = snapPoints.length - 1; i >= 0; i--) {
        if (snapPoints[i]! < currentFrame) {
          previousEdge = snapPoints[i]!
          break
        }
      }
      if (previousEdge !== undefined) {
        commitTimelineSeek(previousEdge)
      }
    },
  )
}
