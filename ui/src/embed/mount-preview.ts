// SPDX-License-Identifier: MIT

/**
 * Mounting just the playable composition into any page, whatever framework
 * the page uses: the editor's main composition in a player sized to
 * `target`, driven by the engine's playback store, so `editor.play()`,
 * `editor.pause()` and `editor.seek()` show and sound in it. No editor chrome.
 */

import { mount, unmount } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import appCss from '../styles/app.css?inline'
import { ensureEditorFonts } from './fonts'
import PreviewRoot from './preview-root.svelte'

export interface MountPreviewOptions {
  /** The page's live editor; the preview plays its project. */
  editor: Editor
  /**
   * `shadow` (default) renders inside a shadow root with the editor's own
   * stylesheet, so neither the host's styles nor the preview's cross over.
   * `none` renders straight into `target`, sharing the page's styles.
   */
  isolation?: 'shadow' | 'none'
}

export interface MountedPreview {
  /** Removes the preview. The editor stays live. */
  unmount(): Promise<void>
}

/** Mounts the editor's composition, playable, into `target`. */
export function mountPreview(target: HTMLElement, options: MountPreviewOptions): MountedPreview {
  const { editor, isolation = 'shadow' } = options
  if (!editor) throw new Error('mountPreview needs the live editor')

  let host: HTMLElement
  let container: ParentNode & Node
  if (isolation === 'shadow') {
    host = document.createElement('div')
    host.className = 'ec-host'
    host.style.cssText = 'display:block;width:100%;height:100%;isolation:isolate;contain:inline-size'
    target.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(appCss)
    shadow.adoptedStyleSheets = [sheet]
    container = shadow
    ensureEditorFonts()
  } else {
    host = target
    container = target
  }

  const root = document.createElement('div')
  root.className = 'ec-root'
  root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
  container.append(root)

  const app = mount(PreviewRoot, { target: root })
  let mounted = true

  return {
    async unmount() {
      if (!mounted) return
      mounted = false
      await unmount(app)
      root.remove()
      if (host !== target) host.remove()
    },
  }
}
