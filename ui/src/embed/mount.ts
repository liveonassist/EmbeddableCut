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
import { setHotkeyScope } from '$lib/hotkeys.svelte'
import { ContributionRegistry } from '../extensions/registry.svelte'
import { ThemeController, type Theme, type ThemeMode } from '../theme/theme'
import appCss from '../styles/app.css?inline'
import { ensureEditorFonts } from './fonts'
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
  /** A project document to open. */
  document?: unknown
  /** A workspace project to open instead (needs `workspace`). */
  projectId?: string
  /** Lets `projectId` migrate a project from an older schema. */
  allowUpgrade?: boolean
}

export interface MountedEditor {
  readonly editor: Editor
  setTheme(theme: ThemeMode | Theme | Record<string, string>): void
  /** Replaces the host's own UI contributions. */
  configure(ui: UiContributions): void
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
    document: doc,
    projectId,
    allowUpgrade,
    ...editorOptions
  } = options
  const editor = await createEditor(editorOptions)

  let host: HTMLElement
  let container: ParentNode & Node
  if (isolation === 'shadow') {
    host = document.createElement('div')
    host.className = 'ec-host'
    host.style.cssText = 'display:block;width:100%;height:100%;contain:content'
    target.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(appCss)
    shadow.adoptedStyleSheets = [sheet]
    container = shadow
    ensureEditorFonts()
    setHotkeyScope(shadow)
  } else {
    host = target
    container = target
  }

  const root = document.createElement('div')
  root.className = 'ec-root'
  root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
  const portalTarget = document.createElement('div')
  portalTarget.className = 'ec-portal'
  container.append(root, portalTarget)

  const themes = new ThemeController(isolation === 'shadow' ? host : root)
  themes.setTheme(theme)
  // A portal outside the root still takes the theme: copy it onto the portal layer.
  const syncPortal = new MutationObserver(() => {
    portalTarget.dataset.theme = root.dataset.theme ?? host.dataset.theme ?? 'dark'
  })
  syncPortal.observe(isolation === 'shadow' ? host : root, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  portalTarget.dataset.theme = themes.mode
  portalTarget.classList.add('ec-root')

  const contributions = new ContributionRegistry(editor, ui)
  const app = mount(EditorApp, {
    target: root,
    props: { ui: { editor, contributions, theme: themes, portalTarget } },
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
    themes.dispose()
    syncPortal.disconnect()
    setHotkeyScope(null)
    root.remove()
    portalTarget.remove()
    if (host !== target) host.remove()
    editor.dispose()
  }

  return {
    editor,
    setTheme: (next) => themes.setTheme(next),
    configure: (next) => contributions.setHost(next),
    unmount: teardown,
  }
}

export interface MountEditorFrameOptions {
  /** The editor page: `embed.html` from the UI build, served with COOP and COEP. */
  src: string
  theme?: ThemeMode | Theme
  /** Attributes for the iframe element, such as `title` or `class`. */
  attributes?: Record<string, string>
}

export interface MountedEditorFrame {
  readonly editor: RemoteEditor
  readonly frame: HTMLIFrameElement
  setTheme(theme: ThemeMode | Theme | Record<string, string>): Promise<void>
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
  return {
    editor,
    frame,
    setTheme: async (theme) => {
      await editor.call('ui.setTheme', { theme: theme as never })
    },
    unmount: () => {
      editor.close()
      frame.remove()
    },
  }
}
