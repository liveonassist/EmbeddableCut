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

## Media

- `media.addUrl({ url, key })` adds a remote file, read in place with range requests; `media.resolve` in the options signs and renews URLs ([`docs/MEDIA.md`](../docs/MEDIA.md)).
- `media.addFiles(files)` adds `File`s: into the workspace, or held in memory when the editor has none. `media.accept` in the options refuses files by type, length or size (`MEDIA_REFUSED`).
- `media.pending()`, `media.read(id)` and `media.replaceWithUrl(id, { url, key })` upload what the timeline uses when the user saves, swapping each asset to its URL in place ([deferred uploads](../docs/MEDIA.md#deferred-uploads)).
- `media.list()`, `media.get(id)` and `media.remove(ids)` read and remove the project's media, as asset records.

## Editing

`apply(op | ops)` runs edit operations as one undo step: `addTrack`, `addText`, `addItem`, `addClip`, `updateItem`, `moveItem`, `removeItems`, `split`, `trimStart`, `trimEnd`, the transition, keyframe, effect and transform ops, and any an extension adds (`editor.operations` lists them). An op can refer to an earlier op's result with `{ "$ref": "<callerId>#/detail/<field>" }`. `undo()`, `redo()`, `canUndo` and `canRedo` work as in the editor.

## Settings and guards

A host decides what its users may change. Both apply to every path into the engine: the editor UI, its shortcuts and `apply`.

```ts
const editor = await createEditor({
  // Forced over the user's persisted values for this editor; their own stay saved.
  settings: { values: { autoSaveInterval: 0 }, locked: ['autoSaveInterval'], hidden: ['hotkeyOverrides'] },
  // Asked with every item an edit would take off the timeline; false rolls the edit back.
  guards: { remove: (items) => !items.some((item) => item.mediaId === streamMediaId) },
})
```

- A locked setting can't be changed; a hidden one is left out of the settings dialog. `setSettingsPolicy(policy | null)` replaces the policy, and `dispose()` removes it.
- A refused edit leaves no undo step. In the UI it raises a `notification`; in `apply` it throws `EDIT_REFUSED` with the protected items as `details`, and the ops after it don't run. `setGuards(guards | null)` replaces the guards.
- Trimming, splitting (the left half keeps its id) or cutting a range out of an item doesn't remove it; deleting its media does, and is refused with it.

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
