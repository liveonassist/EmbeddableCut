# Flutter

EmbeddableCut has no Flutter editor and no native renderer yet, and a Flutter app doesn't need either to use it. Everything a client exchanges with EmbeddableCut is plain JSON with a published schema: projects, assets, edit operations, render requests and the bridge. A Flutter app can show the editor, edit projects, and render them today, and a native editor or renderer can grow on the same contracts later.

## What's portable

| Contract | Where | What a client does with it |
| --- | --- | --- |
| Project document | [`schemas/project-document.v1.schema.json`](../schemas/project-document.v1.schema.json) | store, send and receive projects; generate Dart models from it |
| Asset record | [`schemas/asset.v1.schema.json`](../schemas/asset.v1.schema.json) | point projects at media, local or at URLs |
| Edit operations | [`schemas/edit-operation.v1.schema.json`](../schemas/edit-operation.v1.schema.json) | build edits as data: an op log to replay, undo or sync |
| The bridge | [`BRIDGE.md`](BRIDGE.md) | drive the editor in a WebView |
| The render API | [`RENDERING.md`](RENDERING.md) | render documents on a server |

The rules for reading documents are the same everywhere ([`SCHEMAS.md`](SCHEMAS.md)): migrate what's older, refuse what's newer, report repairs, and never write back a document you couldn't fully read.

## Showing the editor

Load the editor page (`embed.html` from the UI build) in a `WebView`, add a JavaScript channel named `EmbeddableCutHost`, and speak the bridge over it:

```dart
final controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..addJavaScriptChannel('EmbeddableCutHost', onMessageReceived: (message) {
    final json = jsonDecode(message.message) as Map<String, dynamic>;
    if (json['event'] == 'ready') {
      // Safe to call methods now.
    } else if (json.containsKey('id')) {
      completePending(json['id'] as int, json);   // your request/response table
    }
  })
  ..loadRequest(Uri.parse('https://editor.example.com/embed.html'));

Future<void> call(int id, String method, Map<String, dynamic>? params) {
  final message = jsonEncode({
    'protocol': 'embeddablecut.bridge',
    'version': 1,
    'id': id,
    'method': method,
    if (params != null) 'params': params,
  });
  return controller.runJavaScript('window.embeddableCutBridge.receive(${jsonEncode(message)})');
}
```

`project.load` opens a document, `project.toDocument` gives it back for the app to store, and `render.export` returns the video base64-encoded. The editor needs what it needs in a browser: WebGPU, WebCodecs, and a cross-origin-isolated page (COOP and COEP headers). That means a Chromium-based WebView on Android, and a WKWebView recent enough for WebGPU on iOS and macOS.

## Editing without a UI

A Flutter app can build and change projects as data and leave the editing to EmbeddableCut:

- **On a server:** `POST /edit` with a `projectObject` and `ops`, or the workspace's `/v1/projects/:id/edit`, applies edit operations and returns the edited project. It runs FreeCut's own editing actions, so ripple, linking and transition repair behave as in the editor.
- **In a hidden WebView:** `timeline.apply` over the bridge, then `project.toDocument`.

Edit operations are small JSON objects (`{ "op": "split", "id": "clip-1", "frame": 120 }`) that can refer to earlier results (`{ "$ref": "track#/detail/trackId" }`), so a client can record them as an op log and replay it.

## Rendering

Send the document to the render service: `POST /v1/render` with `projectDocument` returns the video, and `POST /frame` returns a still for a thumbnail or a scrubber. With URL assets, any render node can take the job. `GET /v1/capabilities` says which schema versions and extensions a node renders with.

## Toward a native editor

A native Flutter editor or renderer would start from the same contracts:

- **Models** generated from the JSON Schema in `schemas/`, read under the same rules.
- **Edits** as the same operations, so a native timeline and the web editor produce interchangeable op logs. The service's `/edit` is the reference for what each one does.
- **Rendering** against the server's output as the oracle: `POST /frame` at any frame is what a native renderer must match, pixel for pixel within tolerance, as `render/frame-oracle.mjs` checks the web renderer. Effects and transitions are named by id (`gpuEffectType`, `presentation`), with their parameters in the document; a native renderer implements those it supports and refuses documents that `require` one it doesn't, as the web renderer does.
