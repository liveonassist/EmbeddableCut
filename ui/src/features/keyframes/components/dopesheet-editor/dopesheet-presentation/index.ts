// SPDX-License-Identifier: MIT

/**
 * Dopesheet presentation shells.
 * The editor derives the sheet, graph, ruler and playhead state; these shells
 * only place it. Lanes, classic Edit and the default workspace lay the same
 * panes out differently, so each mode owns its tree instead of one function
 * returning three shapes.
 */

export { default as DopesheetLanesPresentation } from './dopesheet-lanes-presentation.svelte'
export { default as DopesheetClassicPresentation } from './dopesheet-classic-presentation.svelte'
export { default as DopesheetEditorPresentation } from './dopesheet-editor-presentation.svelte'
export type {
  DopesheetClassicPresentationProps,
  DopesheetEditorPresentationProps,
  DopesheetHeaderFrameInputsProps,
  DopesheetLanesPresentationProps,
  DopesheetPaneElements,
} from './types'
