// SPDX-License-Identifier: MIT

/**
 * Mounting the full editor into any page, whatever framework the page uses.
 * `mountEditor` runs it in this page (one at a time, the engine's state being
 * per page); `mountEditorFrame` runs it in an iframe, so several can run side
 * by side, each fully isolated.
 */

import { mount, unmount } from 'svelte'
import {
  connectToFrame,
  createEditor,
  type Editor,
  type EditorOptions,
  type RemoteEditor,
  type UiContributions,
} from '@embeddablecut/sdk'
import { ContributionRegistry } from '../extensions/registry.svelte'
import { FeatureGate } from '../extensions/feature-gate.svelte'
import { HostActions, type EditorActions } from '../extensions/actions.svelte'
import type { EditorFeatures, FeatureId, FeatureSetting } from '../extensions/features'
import type { Theme, ThemeMode } from '../theme/theme'
import { createEditorShell } from './shell'
import { answerFrameActions, toBridgeActions, type FrameActions } from './frame-actions'
import { setProductName } from '@/i18n/product-name'
import EditorApp from '../app/editor-app.svelte'

export interface MountEditorOptions extends EditorOptions {
  /**
   * `shadow` (default) renders inside a shadow root with the editor's own
   * stylesheet, so neither the host's styles nor the editor's cross over.
   * `none` renders straight into `target`, sharing the page's styles, as
   * FreeCut's own app does.
   */
  isolation?: 'shadow' | 'none'
  theme?: ThemeMode | Theme
  /** Panels, toolbar items, inspector sections, menus and replacements from the host. */
  ui?: UiContributions
  /** Built-in features to hide (`false`) or lock (`'locked'`), by id; see `FEATURE_IDS`. */
  features?: EditorFeatures
  /** What the host does in place of saving, exporting and help. */
  actions?: EditorActions
  /** A project document to open. */
  document?: unknown
  /** A workspace project to open instead (needs `workspace`). */
  projectId?: string
  /** Lets `projectId` migrate a project from an older schema. */
  allowUpgrade?: boolean
  /** What the editor's copy calls itself (`EmbeddableCut`), for a host shipping it under its own name. */
  productName?: string
}

export interface MountedEditor {
  readonly editor: Editor
  setTheme(theme: ThemeMode | Theme | Record<string, string>): void
  /** Replaces the host's own UI contributions. */
  configure(ui: UiContributions): void
  /** Replaces every feature switch given in `features`. */
  setFeatures(features: EditorFeatures): void
  /** Replaces the handlers given in `actions`. */
  setActions(actions: EditorActions): void
  /** Removes the editor and disposes it, so another can be mounted. */
  unmount(): Promise<void>
}

/** Mounts the full editor into `target`. Resolves once a project given in `options` is open. */
export async function mountEditor(
  target: HTMLElement,
  options: MountEditorOptions = {},
): Promise<MountedEditor> {
  const {
    isolation = 'shadow',
    theme = 'dark',
    ui = {},
    features = {},
    actions = {},
    document: doc,
    projectId,
    allowUpgrade,
    productName,
    ...editorOptions
  } = options
  const editor = await createEditor(editorOptions)
  setProductName(productName)
  const shell = createEditorShell(target, { isolation, theme })
  const { root, portalTarget, themes } = shell

  const contributions = new ContributionRegistry(editor, ui)
  const gate = new FeatureGate(editor, features)
  const hostActions = new HostActions(actions)
  const app = mount(EditorApp, {
    target: root,
    props: {
      ui: {
        editor,
        contributions,
        features: gate,
        actions: hostActions,
        theme: themes,
        portalTarget,
      },
    },
  })

  try {
    if (doc !== undefined) await editor.loadDocument(doc)
    else if (projectId) await editor.openProject(projectId, { allowUpgrade })
  } catch (error) {
    await teardown()
    throw error
  }

  async function teardown() {
    await unmount(app)
    contributions.dispose()
    gate.dispose()
    shell.dispose()
    editor.dispose()
    setProductName()
  }

  return {
    editor,
    setTheme: (next) => themes.setTheme(next),
    configure: (next) => contributions.setHost(next),
    setFeatures: (next) => gate.set(next),
    setActions: (next) => hostActions.set(next),
    unmount: teardown,
  }
}

export interface MountEditorFrameOptions {
  /** The editor page: `embed.html` from the UI build, served with COOP and COEP. */
  src: string
  theme?: ThemeMode | Theme
  /** Built-in features to hide or lock, as in `mountEditor`; values only, as they cross to the frame. */
  features?: Partial<Record<FeatureId, FeatureSetting>>
  /** What the editor's copy calls itself, as in `mountEditor`. */
  productName?: string
  /** What the host does in place of saving, exporting and help, as in `mountEditor`. */
  actions?: FrameActions
  /** Attributes for the iframe element, such as `title` or `class`. */
  attributes?: Record<string, string>
}

export interface MountedEditorFrame {
  readonly editor: RemoteEditor
  readonly frame: HTMLIFrameElement
  setTheme(theme: ThemeMode | Theme | Record<string, string>): Promise<void>
  setFeatures(features: Partial<Record<FeatureId, FeatureSetting>>): Promise<void>
  /** Replaces the handlers given in `actions`. */
  setActions(actions: FrameActions): Promise<void>
  unmount(): void
}

/**
 * Mounts the editor page in an iframe in `target` and connects to it. Each
 * frame has its own engine, so any number can run at once; the host drives
 * one through its `RemoteEditor`.
 */
export async function mountEditorFrame(
  target: HTMLElement,
  options: MountEditorFrameOptions,
): Promise<MountedEditorFrame> {
  const url = new URL(options.src, location.href)
  url.searchParams.set('parent', location.origin)
  if (options.productName) url.searchParams.set('productName', options.productName)
  const frame = document.createElement('iframe')
  frame.src = url.href
  frame.allow = 'cross-origin-isolated; clipboard-read; clipboard-write; fullscreen; local-fonts'
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0'
  for (const [name, value] of Object.entries(options.attributes ?? {}))
    frame.setAttribute(name, value)
  const connected = connectToFrame(frame, url.origin)
  target.append(frame)
  const editor = await connected
  if (options.theme) await editor.call('ui.setTheme', { theme: options.theme as never })
  if (options.features) await editor.call('ui.setFeatures', { features: options.features })
  let actions = options.actions ?? {}
  const stopAnswering = answerFrameActions(editor, () => actions)
  if (options.actions) await editor.call('ui.setActions', { actions: toBridgeActions(actions) })
  return {
    editor,
    frame,
    setTheme: async (theme) => {
      await editor.call('ui.setTheme', { theme: theme as never })
    },
    setFeatures: async (features) => {
      await editor.call('ui.setFeatures', { features })
    },
    setActions: async (next) => {
      actions = next
      await editor.call('ui.setActions', { actions: toBridgeActions(next) })
    },
    unmount: () => {
      stopAnswering()
      editor.close()
      frame.remove()
    },
  }
}
