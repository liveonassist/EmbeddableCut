// SPDX-License-Identifier: MIT

/**
 * The editor page `mountEditorFrame` loads (`embed.html`): an editor
 * filling the frame, served over the bridge to the page that embeds it.
 * `?parent=<origin>` names who may connect; `?workspace=opfs` keeps media in
 * the frame origin's private storage.
 */

import { acceptFrameConnection } from '@embeddablecut/sdk'
import { mountEditor, type MountedEditor } from './mount'
import '../styles/app.css'

const params = new URLSearchParams(location.search)
const parents = params.getAll('parent')
let mounted: MountedEditor | null = null
const ready = mountEditor(document.body, {
  isolation: 'none',
  workspace: params.get('workspace') === 'opfs' ? 'opfs' : undefined,
}).then((editor) => {
  mounted = editor
  return editor.editor
})

acceptFrameConnection(ready, parents.length > 0 ? parents : [location.origin], {
  setTheme: (theme) => mounted?.setTheme(theme as Parameters<MountedEditor['setTheme']>[0]),
})
