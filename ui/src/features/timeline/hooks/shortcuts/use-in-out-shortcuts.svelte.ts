// SPDX-License-Identifier: MIT

/**
 * Timeline in/out shortcuts: I, O, Shift+I/O, Alt+X.
 */

import { usePlaybackStore } from '@/shared/state/playback'
import {
  clearInOutPoints,
  setInPoint,
  setOutPoint,
} from '@/features/timeline/stores/timeline-actions'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { useTimelineHotkey } from './timeline-hotkey'

function addShiftModifier(binding: string): string {
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.some((part) => part.toLowerCase() === 'shift')) {
    return binding
  }

  const key = parts.pop()
  if (!key) return `shift+${binding}`
  return [...parts, 'shift', key].join('+')
}

export function useInOutShortcuts(): void {
  const hotkeys = useResolvedHotkeys()
  const markInAtPreview = $derived(addShiftModifier(hotkeys.current.MARK_IN))
  const markOutAtPreview = $derived(addShiftModifier(hotkeys.current.MARK_OUT))

  useTimelineHotkey(
    () => hotkeys.current.MARK_IN,
    (event) => {
      event.preventDefault()
      const { currentFrame } = usePlaybackStore.getState()
      setInPoint(currentFrame)
    },
  )

  useTimelineHotkey(
    () => markInAtPreview,
    (event) => {
      event.preventDefault()
      const { previewFrame, currentFrame } = usePlaybackStore.getState()
      setInPoint(previewFrame ?? currentFrame)
    },
  )

  useTimelineHotkey(
    () => hotkeys.current.MARK_OUT,
    (event) => {
      event.preventDefault()
      const { currentFrame } = usePlaybackStore.getState()
      setOutPoint(currentFrame)
    },
  )

  useTimelineHotkey(
    () => markOutAtPreview,
    (event) => {
      event.preventDefault()
      const { previewFrame, currentFrame } = usePlaybackStore.getState()
      setOutPoint(previewFrame ?? currentFrame)
    },
  )

  useTimelineHotkey(
    () => hotkeys.current.CLEAR_IN_OUT,
    (event) => {
      event.preventDefault()
      clearInOutPoints()
    },
  )
}
