// SPDX-License-Identifier: MIT

/**
 * The editor page (`embed.html`): an editor filling the page, driven over the
 * bridge by whoever embeds it.
 *
 * - In an iframe, `mountEditorFrame` connects with a `MessagePort`;
 *   `?parent=<origin>` names who may (repeatable; this page's own origin when
 *   absent).
 * - In a WebView (Flutter's `webview_flutter`, say), the native shell adds a
 *   JavaScript channel named `EmbeddableCutHost`; messages to the page go to
 *   `window.embeddableCutBridge.receive(json)`. docs/BRIDGE.md has the protocol.
 *
 * `?workspace=opfs` keeps local media in the page origin's private storage;
 * `?productName=` is what the editor's copy calls itself.
 */

import { acceptFrameConnection, serveBridge, stringTransport } from '@embeddablecut/sdk'
import { mountEditor, type MountedEditor } from './mount'
import '../styles/app.css'

interface NativeChannel {
  postMessage(message: string): void
}

declare global {
  interface Window {
    EmbeddableCutHost?: NativeChannel
    embeddableCutBridge?: { receive(json: string): void }
  }
}

const params = new URLSearchParams(location.search)
const parents = params.getAll('parent')
let mounted: MountedEditor | null = null
const setTheme = (theme: string | Record<string, string>) =>
  mounted?.setTheme(theme as Parameters<MountedEditor['setTheme']>[0])
const setFeatures = (features: Record<string, boolean | 'locked'>) =>
  mounted?.setFeatures(features as Parameters<MountedEditor['setFeatures']>[0])

const ready = mountEditor(document.body, {
  isolation: 'none',
  workspace: params.get('workspace') === 'opfs' ? 'opfs' : undefined,
  productName: params.get('productName') ?? undefined,
}).then((editor) => {
  mounted = editor
  return editor.editor
})

const native = window.EmbeddableCutHost
if (native) {
  const listeners = new Set<(json: string) => void>()
  window.embeddableCutBridge = {
    receive: (json) => listeners.forEach((listener) => listener(json)),
  }
  void ready.then((editor) =>
    serveBridge(
      editor,
      stringTransport(
        (json) => native.postMessage(json),
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      ),
      { setTheme, setFeatures },
    ),
  )
} else {
  acceptFrameConnection(ready, parents.length > 0 ? parents : [location.origin], {
    setTheme,
    setFeatures,
  })
}
