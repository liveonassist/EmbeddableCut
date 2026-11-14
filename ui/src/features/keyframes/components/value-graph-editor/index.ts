// SPDX-License-Identifier: MIT

/**
 * Value Graph Editor - interactive graph for editing keyframe values and timing.
 * `index.svelte` is the full editor; `embedded-value-graph-editor.svelte` drops
 * the chrome for hosts (the dopesheet's graph pane) that draw their own.
 */

export { default as ValueGraphEditor } from './index.svelte'
export { default as EmbeddedValueGraphEditor } from './embedded-value-graph-editor.svelte'
export type {
  EmbeddedValueGraphEditorProps,
  ValueGraphEditorProps,
  ValueGraphEditorSharedProps,
} from './value-graph-editor-props'
