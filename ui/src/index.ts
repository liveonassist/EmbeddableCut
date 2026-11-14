// SPDX-License-Identifier: MIT

/**
 * EmbeddableCut's editor UI: `mountEditor` for the full editor in any page,
 * `mountEditorFrame` for isolated editors in iframes, `mountApp` for the whole
 * FreeCut app, and the theme and contribution types hosts customize it with.
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
