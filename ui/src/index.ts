// SPDX-License-Identifier: MIT

/**
 * EmbeddableCut's editor UI: `mountEditor` for the full editor in any page,
 * `mountEditorFrame` for isolated editors in iframes, `mountPreview` for just
 * the playable composition, `mountApp` for the whole app, and the
 * theme, contribution and action types hosts customize it with.
 */

export { mountApp, type MountedApp } from './app/mount-app'
export {
  mountEditor,
  mountEditorFrame,
  type MountEditorFrameOptions,
  type MountEditorOptions,
  type MountedEditor,
  type MountedEditorFrame,
} from './embed/mount'
export { mountPreview, type MountPreviewOptions, type MountedPreview } from './embed/mount-preview'
export {
  THEME_TOKENS,
  ThemeController,
  type Theme,
  type ThemeMode,
  type ThemeToken,
} from './theme/theme'
export type {
  HostRender,
  IconRef,
  InspectorContribution,
  MenuContribution,
  MenuTargets,
  PanelContribution,
  Renderable,
  ReplaceableSlot,
  ToolbarContribution,
  UiContext,
} from './extensions/contributions'
export {
  FEATURE_IDS,
  type EditorFeatures,
  type FeatureContext,
  type FeatureId,
  type FeatureMode,
  type FeatureSetting,
  type FeatureTarget,
  type FeatureValue,
} from './extensions/features'
export type {
  ActionContext,
  ActionHandler,
  ActionName,
  DeliverContext,
  EditorActions,
  ExportedFile,
  HostAction,
  NamedAction,
  SaveContext,
  SaveTrigger,
} from './extensions/actions.svelte'
export type {
  FrameActionContext,
  FrameActionHandler,
  FrameActions,
  FrameHostAction,
  FrameNamedAction,
} from './embed/frame-actions'
