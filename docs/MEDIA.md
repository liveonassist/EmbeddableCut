# Media

EmbeddableCut edits two kinds of media side by side: files from the user's disk, as FreeCut does, and media at URLs, read where they live. A project can mix both, and a host decides which its editor accepts.

## Local files

FreeCut's workflows are unchanged. Dropped or imported files are copied into the workspace folder (`copy`) or referenced on the user's disk (`link`), with proxies, filmstrips, waveforms and caches beside them. A linked file asks for permission again in a later session, and relinking finds a moved one.

An editor with no workspace holds what users import in the page's memory instead (`storageType: 'memory'`, `source.type: 'memory'` in a document), probed and thumbnailed as usual. Those files are gone with the page unless the host uploads them; see [deferred uploads](#deferred-uploads).

## Deferred uploads

A host that keeps its media at URLs can let users add files freely and upload only what a project uses, when the user saves. Nothing is uploaded on import, and nothing is probed twice.

```ts
const editor = await createEditor({
  // Added files are kept in the origin's private storage (OPFS), across reloads; `workspace: 'none'` holds them in memory.
  media: {
    accept: ({ mimeType, duration, width, height }) => {
      if (!['video/mp4', 'audio/mpeg', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType))
        return 'Use an MP4, MP3, PNG, JPEG or WebP file.'
      if (mimeType.startsWith('video/') && duration > 15.5) return 'Clips can be at most 15 seconds.'
      if (width > 8192 || height > 8192) return 'Frames can be at most 8192 pixels on a side.'
      return true
    },
    resolve: (asset) => myBackend.sign(asset), // renews uploads' URLs from their `key`
  },
})

// Users drop files on the media library, or the host adds them:
await editor.media.addFiles(pickedFiles)

async function save() {
  for (const asset of editor.media.pending()) {
    const bytes = await editor.media.read(asset.id)
    const { url, uploadId } = await uploadToStorage(bytes, asset) // e.g. S3 multipart
    await editor.media.replaceWithUrl(asset.id, { url, key: `assist:${uploadId}` })
  }
  await backend.saveProject(editor.toDocument()) // every asset is a URL now
}
```

- **`pending()`** lists the assets the timeline uses that aren't at a URL: held in memory, or in a workspace. Media the user added but didn't use is left out.
- **`replaceWithUrl(id, media)`** keeps the asset's id, so no clip changes, and everything extracted from it: metadata, thumbnail, keyframe index. Readers move to the URL through the host's resolver, as they do when a signed URL renews, and the uploaded bytes seed the block cache, so nothing is downloaded back. Give it a URL that stays valid or a `key` the resolver renews it from.
- **`accept`** sees each file's probed metadata before anything is stored, for files the host adds and files users drop or pick alike. A string refuses the file: `addFiles` throws `MEDIA_REFUSED` (with `details.fileName` and `details.reason`), and the media library shows the reason as a notification.
- **A document can be a draft.** `toDocument()` writes held files as `source.type: 'memory'`. Store it as a draft if you like, but only this page has those bytes: a later session that loads it shows them missing. Refuse to save a document with `memory` assets anywhere else, or upload them first.

## URL media

URL media is a first-class kind of asset (`storageType: 'url'` in the media library, `source.type: 'url'` in a project document). Nothing downloads it whole:

- **Probing reads a few ranges.** `editor.media.addUrl({ url })` reads the container's index and one frame for the thumbnail through range requests, with FreeCut's own metadata extraction running in its worker.
- **Playback streams.** The preview's `<video>` elements read the URL directly, and seeking fetches only what the new position needs.
- **Decoding reads ranges, once.** Everything that decodes through mediabunny (scrub frames, filmstrips, waveforms, export, server renders) reads through one fetch layer (`infrastructure/remote-media/remote-fetch.ts`). It fetches 1 MiB blocks into a cache in Cache Storage that every worker and tab shares, so a byte the preview fetched isn't fetched again by the waveform worker or by an export. Reads stream block by block, so a reader that stops early fetches no more.
- **The cache survives renewal.** Blocks are keyed by the asset's stable `key`, or its URL without the query, so a re-signed URL still hits them. The cache is capped at 2 GiB by default (`setRemoteMediaCacheBudget`) and evicts whole assets, least recently used first.

Measured by `render/remote-media-e2e.mjs` on a 10 MB clip: a frame grab from its middle reads 69% of the file in three requests (mostly mediabunny's read-ahead), and exporting the whole clip afterwards downloads only the rest, so each byte crosses the network once.

### Authentication and signed URLs

Credentials are never stored with a project. The host resolves URL assets when they're opened, through `EditorOptions.media.resolve` or a media provider an extension contributes:

```ts
const editor = await createEditor({
  media: {
    resolve: async (asset, reason) => {
      // reason: 'open', 'expiring' (shortly before expiresAt), or 'refused' (a 401 or 403)
      const { url, expiresAt } = await myBackend.sign(asset.source.key)
      return { url, expiresAt }
    },
  },
})
```

- **Signed URLs** are renewed five minutes before `expiresAt`, and again whenever a server refuses one. Readers move to the new URL without reloading, and the saved document carries the newest URL.
- **Headers** (`{ headers: { Authorization } }`) are sent with every request the engine makes: probing, decoding, export. A preview `<video>` can't send headers, so an asset that needs them to play should use a signed URL, or cookies with `credentials: 'include'`.
- **Routing:** an asset whose `key` starts with a media provider's id and a colon (`acme:clip-42`) is resolved by that provider.

### What a media server must do

- **Allow CORS** (`Access-Control-Allow-Origin`, and `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`). The editor runs cross-origin isolated, and its GPU overlays draw video frames, which needs CORS either way.
- **Support `Range`** for streaming and partial reads. A server that doesn't is still read, sequentially and uncached.
- **Put the index first** (`-movflags +faststart` for MP4) so opening and seeking don't need the end of the file.

### Rendering on servers

A project document's URL assets render on the render service exactly as in the browser: the harness page reads them through the same fetch layer, so the render server needs network access to them, not copies.

## Turning sources off

```ts
createEditor({ media: { local: false, url: true } })   // URL media only: nothing from the user's disk
createEditor({ media: { local: true, url: false } })   // FreeCut's behavior: files only
```

A turned-off source is refused with `MEDIA_SOURCE_DISABLED`, both when adding media and when loading a document that uses it.
