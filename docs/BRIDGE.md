# Bridge

The bridge drives an editor from outside its page: from the page that embeds it in an iframe, or from a native shell that shows it in a WebView. It's JSON messages mapped onto the SDK's `Editor`, so anything a host can do with `createEditor` it can do over the bridge. `sdk/src/bridge/` is the implementation; this page is the reference another implementation (Dart, Swift, Kotlin) follows.

The protocol is versioned on its own: `BRIDGE_VERSION` (1) changes when a message's shape changes, independently of the SDK's version and of the data formats in [`SCHEMAS.md`](SCHEMAS.md).

## Connecting

| Where the editor runs | Transport | How it connects |
| --- | --- | --- |
| An iframe (`mountEditorFrame`) | a `MessagePort` | The editor page posts `{"protocol":"embeddablecut.bridge","version":1,"type":"hello"}` to its parent. The host answers with `{…,"type":"connect"}` and the port, posted to the frame's origin only. The page accepts connections only from the origins in its `?parent=` parameter. |
| A WebView | strings | The shell adds a JavaScript channel named `EmbeddableCutHost` before the page loads. The page sends JSON with `EmbeddableCutHost.postMessage(json)`, and the shell sends JSON by running `window.embeddableCutBridge.receive(json)`. |

Both start with the guest's `ready` event. Send nothing before it.

## Messages

Every message carries `"protocol": "embeddablecut.bridge"` and `"version": 1`.

```jsonc
// host → editor: a request
{ "protocol": "embeddablecut.bridge", "version": 1, "id": 7, "method": "timeline.apply",
  "params": { "operations": [{ "op": "addText", "text": "Hello" }] } }

// editor → host: its response, matched by id
{ "protocol": "embeddablecut.bridge", "version": 1, "id": 7, "ok": true, "result": [{ "op": "addText", "detail": { "id": "…" } }] }
{ "protocol": "embeddablecut.bridge", "version": 1, "id": 8, "ok": false,
  "error": { "code": "SCHEMA_TOO_NEW", "message": "…", "details": [] } }

// editor → host: an event
{ "protocol": "embeddablecut.bridge", "version": 1, "event": "playback", "payload": { "frame": 120, "playing": true } }
```

`id` is the host's to choose; responses can arrive out of order. A request in another protocol version is answered with `BRIDGE_VERSION`, an unknown method with `UNKNOWN_METHOD`. Every other error code is the editor's own: `EditorError` codes (`NO_PROJECT`, `EXTENSION_MISSING`, `MEDIA_SOURCE_DISABLED`, …) and `SchemaError` codes (`SCHEMA_INVALID`, `SCHEMA_TOO_NEW`, …).

### Methods

| Method | Params | Result |
| --- | --- | --- |
| `editor.describe` | — | `sdkVersion`, `bridgeVersion`, `schemaVersions`, `operations` |
| `project.create` | `name`, `width?`, `height?`, `fps?`, `backgroundColor?` | the project's `id`, `name`, `width`, `height`, `fps` |
| `project.load` | `document`: a project document | `project`, `migrated`, `warnings` |
| `project.open` | `projectId`, `allowUpgrade?` | the project (a workspace project) |
| `project.toDocument` | — | the project document |
| `project.save`, `project.close` | — | `null` |
| `timeline.apply` | `operations`: edit operations ([`schemas/edit-operation.v1.schema.json`](../schemas/edit-operation.v1.schema.json)) | each op's `op`, `callerId`, `detail` |
| `timeline.undo`, `timeline.redo` | — | `null` |
| `timeline.get` | — | the timeline as it would be saved |
| `playback.play`, `playback.pause` | — | `null` |
| `playback.seek` | `frame` | `null` |
| `playback.state` | — | `frame`, `playing` |
| `media.list` | — | asset records |
| `media.addUrl` | `url`, `fileName?`, `mimeType?`, `key?`, `expiresAt?` | the new asset record |
| `render.frame` | `frame?`, `atSeconds?`, `width?`, `height?`, `format?`, `quality?` | a binary result |
| `render.export` | `settings?`, `inFrame?`, `outFrame?` | a binary result with `durationSeconds`, `settings`, `warnings` |
| `settings.setPolicy` | `policy`: `{ "values"?, "locked"?, "hidden"? }` (setting keys), or `null` | `null` |
| `ui.setTheme` | `theme`: `"dark"`, `"light"`, `"system"`, or `{ "mode", "tokens" }` | `null` |
| `ui.setFeatures` | `features`: `{ "<feature id>": true \| false \| "locked" }`, replacing the last set ([EMBEDDING.md](EMBEDDING.md#hiding-and-locking-features)) | `null` |
| `ui.setActions` | `actions`: `{ "save"?, "exportVideo"?, "exportBundle"?, "help"?: true, "deliver"?: { "label", "icon"? } }`, the actions the host takes over, replacing the last set ([Actions](#actions)) | `null` |
| `ui.runDefaultAction` | `id` of a waiting action | `null`, once the editor's own behavior has run |
| `ui.completeAction` | `id` of a waiting action, `error?` | `null` |

A **binary result** is `{ "mimeType", "fileName"?, "data", "encoding"? }`. Over a port `data` is an `ArrayBuffer`, transferred; over strings it's base64 and `encoding` is `"base64"`.

### Events

| Event | Payload |
| --- | --- |
| `ready` | — |
| `project` | the project's `id`, `name`, `width`, `height`, `fps`, after a create, load or open |
| `change` | — (the timeline changed: an edit, undo or redo) |
| `playback` | `frame`, `playing` |
| `notification` | `level` (`info`, `success`, `warning`, `error`), `message`, for a host showing no editor UI |
| `action` | `id`, `action`, and `trigger` for a save or `file` for a delivery: an action the host took over ([Actions](#actions)) |

### Actions

A host can take over saving, exporting, the export dialog's download and help ([EMBEDDING.md](EMBEDDING.md#taking-over-saving-and-exporting)). It names them in `ui.setActions`; from then on, when the user saves or exports, the editor sends an `action` event instead of doing it, and waits.

```jsonc
// editor → host
{ "protocol": "embeddablecut.bridge", "version": 1, "event": "action",
  "payload": { "id": 3, "action": "save", "trigger": "auto" } }
// host → editor: optionally, the editor's own behavior first (here, the workspace save)
{ "protocol": "embeddablecut.bridge", "version": 1, "id": 41, "method": "ui.runDefaultAction", "params": { "id": 3 } }
// host → editor: always, once the host is done; an error is shown to the user
{ "protocol": "embeddablecut.bridge", "version": 1, "id": 42, "method": "ui.completeAction", "params": { "id": 3 } }
```

- `action` is `save`, `exportVideo`, `exportBundle`, `deliver` or `help`. A `save` carries its `trigger` (`user`, `auto`, `leave`, `export`); a `deliver` carries the rendered `file` as a binary result, with `subtitles` (`fileName`, `content`) when the export wrote a sidecar.
- Every action waits for its `ui.completeAction`: the Save button spins and the unsaved marker stays until then. `error` fails it as the editor's own failures do.
- When the host disconnects, the actions it took go back to the editor's own, and those still waiting fail.
