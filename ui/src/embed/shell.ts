// SPDX-License-Identifier: MIT

import { setHotkeyScope } from '$lib/hotkeys.svelte'
import { ThemeController, type Theme, type ThemeMode } from '../theme/theme'
import appCss from '../styles/app.css?inline'
import { ensureEditorFonts } from './fonts'

export interface EditorShell {
  /** Where the UI mounts: `.ec-root`. */
  readonly root: HTMLElement
  /** The portal layer beside the root, themed as it is. */
  readonly portalTarget: HTMLElement
  readonly themes: ThemeController
  /** Removes the root, the portal layer and the shadow host. */
  dispose(): void
}

/**
 * The DOM a mounted editor lives in: the `.ec-root` it renders into, the
 * `.ec-portal` layer its popovers, menus and dialogs portal to, and the theme
 * controller over both. `shadow` isolation renders inside a shadow root with
 * the editor's own stylesheet; `none` renders straight into `target`.
 */
export function createEditorShell(
  target: HTMLElement,
  {
    isolation,
    theme,
    layout = 'fill',
  }: {
    isolation: 'shadow' | 'none'
    theme: ThemeMode | Theme
    /** `fill` sizes the root to `target` and clips it; `page` leaves it to flow and scroll with the page. */
    layout?: 'fill' | 'page'
  },
): EditorShell {
  let host: HTMLElement
  let container: ParentNode & Node
  if (isolation === 'shadow') {
    host = document.createElement('div')
    host.className = 'ec-host'
    host.style.cssText = 'display:block;width:100%;height:100%;isolation:isolate'
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
  if (layout === 'fill') {
    root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
  }
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

  return {
    root,
    portalTarget,
    themes,
    dispose() {
      themes.dispose()
      syncPortal.disconnect()
      setHotkeyScope(null)
      root.remove()
      portalTarget.remove()
      if (host !== target) host.remove()
    },
  }
}
