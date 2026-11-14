// SPDX-License-Identifier: MIT

import { usePlaybackShortcuts } from './shortcuts/use-playback-shortcuts.svelte'
import { useEditingShortcuts } from './shortcuts/use-editing-shortcuts.svelte'
import { useToolShortcuts } from './shortcuts/use-tool-shortcuts.svelte'
import { useMarkerShortcuts } from './shortcuts/use-marker-shortcuts.svelte'
import { useInOutShortcuts } from './shortcuts/use-in-out-shortcuts.svelte'
import { useUIShortcuts } from './shortcuts/use-ui-shortcuts.svelte'
import { useClipboardShortcuts } from './shortcuts/use-clipboard-shortcuts.svelte'
import { useSourceMonitorShortcuts } from './shortcuts/use-source-monitor-shortcuts.svelte'

export interface TimelineShortcutCallbacks {
  onPlay?: () => void
  onPause?: () => void
  onSplit?: () => void
  onDelete?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onZoomToFit?: () => void
}

/**
 * Timeline keyboard shortcuts hook
 *
 * Composes domain-specific shortcut hooks for:
 * - Playback & navigation (Space, arrows, Home/End, snap points)
 * - Editing (Delete, split, join, keyframes)
 * - Tools (V/C/R tool switching)
 * - Markers (M add/remove, [ ] navigate)
 * - In/Out markers (I, O, Shift+I/O, Alt+X)
 * - UI (S snap, Z zoom, undo/redo)
 * - Clipboard (Ctrl+C/X/V)
 *
 * Note: Zoom is handled via Ctrl+Scroll only (see TimelineContent component)
 */
export function useTimelineShortcuts(
  callbacks: () => TimelineShortcutCallbacks = () => ({}),
): void {
  usePlaybackShortcuts(callbacks)
  useEditingShortcuts(callbacks)
  useToolShortcuts(callbacks)
  useMarkerShortcuts()
  useInOutShortcuts()
  useUIShortcuts(callbacks)
  useClipboardShortcuts()
  useSourceMonitorShortcuts()
}
