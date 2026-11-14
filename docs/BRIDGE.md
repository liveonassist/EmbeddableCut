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
| `ui.setTheme` | `theme`: `"dark"`, `"light"`, `"system"`, or `{ "mode", "tokens" }` | `null` |

A **binary result** is `{ "mimeType", "fileName"?, "data", "encoding"? }`. Over a port `data` is an `ArrayBuffer`, transferred; over strings it's base64 and `encoding` is `"base64"`.

### Events

| Event | Payload |
| --- | --- |
| `ready` | — |
| `project` | the project's `id`, `name`, `width`, `height`, `fps`, after a create, load or open |
| `change` | — (the timeline changed: an edit, undo or redo) |
| `playback` | `frame`, `playing` |
| `notification` | `level` (`info`, `success`, `warning`, `error`), `message`, for a host showing no editor UI |
