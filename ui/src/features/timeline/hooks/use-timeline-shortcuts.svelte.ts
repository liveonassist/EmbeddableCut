// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

export interface TimelineShortcutCallbacks {
  onPlay?: () => void
  onPause?: () => void
  onSplit?: () => void
  onDelete?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onZoomToFit?: () => void
}

export function useTimelineShortcuts(_callbacks: () => TimelineShortcutCallbacks = () => ({})): void {}
