// SPDX-License-Identifier: MIT

import type { KeyframeEditorMode } from './use-keyframe-graph-panel-view-state.svelte'

export interface KeyframeGraphPanelHeaderProps {
  surface: 'default' | 'edit' | 'motion'
  selectedItemForEditor: { label?: string | null; type: string; id: string } | null
  effectiveEditorMode: KeyframeEditorMode
  splitView: boolean
  setEditorMode: (mode: KeyframeEditorMode) => void
  isFocusMode: boolean
  onFocusModeChange?: (isFocusMode: boolean) => void
  showCloseButton: boolean
  onClose: () => void
}
