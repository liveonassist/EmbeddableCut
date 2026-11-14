<!-- SPDX-License-Identifier: MIT -->
# EmbeddableCut SDK

Drive FreeCut's editing engine from your own app: build and change projects, apply edit operations, render frames and export video in the browser, with or without the editor on screen.

```ts
import { createEditor } from '@embeddablecut/sdk'

const editor = await createEditor({ media: { local: false, url: true } })
await editor.createProject({ name: 'Launch', width: 1920, height: 1080, fps: 30 })

editor.apply([
  { op: 'addTrack', callerId: 'titles', kind: 'video' },
  { op: 'addText', trackId: { $ref: 'titles#/detail/trackId' }, text: 'Hello', durationInFrames: 90 },
])

const poster = await editor.renderFrame({ frame: 45, format: 'image/webp' })
const { blob } = await editor.export({ settings: { codec: 'avc', container: 'mp4', quality: 'high' } })

const document = editor.toDocument() // a portable project document, ready to store
editor.dispose()
```

## Projects

- `createProject({ name, width, height, fps })` starts an empty project.
- `loadDocument(json)` opens a project document. Older documents are migrated; newer or invalid ones are refused with a `SchemaError`, never read partially.
- `toDocument()` returns the project with every media asset it references, and the custom extensions it needs.

## Editing

`apply(op | ops)` runs edit operations as one undo step: `addTrack`, `addText`, `addItem`, `addClip`, `updateItem`, `moveItem`, `removeItems`, `split`, `trimStart`, `trimEnd`, the transition, keyframe, effect and transform ops, and any an extension adds (`editor.operations` lists them). An op can refer to an earlier op's result with `{ "$ref": "<callerId>#/detail/<field>" }`. `undo()`, `redo()`, `canUndo` and `canRedo` work as in the editor.

## Extensions

```ts
editor.extensions.install({
  id: 'acme.looks',
  effects: [tintEffect],             // WebGPU effect definitions
  transitions: [{ definition, renderer, gpu }],
  operations: { addLowerThird: (op) => { /* … */ } },
  mediaProviders: [acmeMediaProvider],
})
```

A document that uses a custom effect or transition lists it in `requires`, and an editor or renderer without that extension refuses the document with `EXTENSION_MISSING` instead of rendering it wrong. Install the same extensions wherever a document is opened: in the editor, in the browser that exports it, and on the render server.

## One editor per page

The engine's state is per page, so one editor is live at a time and `createEditor` refuses a second with `EDITOR_ACTIVE`. Dispose one before creating the next, or run several side by side in iframes.
