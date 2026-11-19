# Media

EmbeddableCut edits two kinds of media side by side: files from the user's disk and media at URLs, read where they live. A project can mix both, and a host decides which its editor accepts.

## Local files

Dropped or imported files are copied into the workspace folder (`copy`) or referenced on the user's disk (`link`), with proxies, filmstrips, waveforms and caches beside them. A linked file asks for permission again in a later session, and relinking finds a moved one.

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

- **Probing reads a few ranges.** `editor.media.addUrl({ url })` reads the container's index and one frame for the thumbnail through range requests, with the editor's own metadata extraction running in its worker.
- **Playback streams.** The preview's `<video>` elements read the URL directly, and seeking fetches only what the new position needs.
- **Decoding reads ranges, once.** Everything that decodes through mediabunny (scrub frames, filmstrips, waveforms, export, server renders) reads through one fetch layer (`infrastructure/remote-media/remote-fetch.ts`). It fetches 1 MiB blocks into a cache in Cache Storage that every worker and tab shares, so a byte the preview fetched isn't fetched again by the waveform worker or by an export. Reads stream block by block, so a reader that stops early fetches no more, and a block two contexts reach at once is fetched once, under a Web Lock.
- **Derived data persists.** Filmstrips, waveforms and thumbnails live in the workspace, which is the origin's private storage (OPFS) unless the host names another, so reopening a project rebuilds none of them. `workspace: 'none'` keeps them in memory for the session.
- **The cache survives renewal.** Blocks are keyed by the asset's stable `key`, or its URL without the query, so a re-signed URL still hits them. The cache is capped at 2 GiB by default (`setRemoteMediaCacheBudget`) and evicts whole assets, least recently used first.

Measured by `render/remote-media-e2e.mjs` on a 10 MB clip: a frame grab from its middle reads 69% of the file in three requests (mostly mediabunny's read-ahead), and exporting the whole clip afterwards downloads only the rest, so each byte crosses the network once.

### HLS

An HLS playlist URL (`.m3u8`, or `application/vnd.apple.mpegurl`) is added like any other: `editor.media.addUrl({ url })`. It's stored with the playlist's MIME type and edited as video.

- **The engine reads the stream itself.** mediabunny parses the master and media playlists and demuxes MPEG-TS, fMP4, AAC and MP3 segments, through the same fetch layer: each segment is cached under its path beside the playlist, and moves with it when the playlist's URL is renewed. Playlists themselves are never cached, since a live one grows.
- **The highest-bandwidth variant** is the one probed, decoded and exported. The preview's `<video>` plays the playlist natively (Chrome, Safari) with its own adaptive bitrate.
- **Time starts at the first segment.** `#EXT-X-PROGRAM-DATE-TIME` doesn't move timestamps into Unix time (`MEDIA_INPUT_FORMAT_OPTIONS`), so source frames count from the stream's start as they do for a file. MPEG-TS has no edit lists: when the encoder delayed the first video frame behind the audio, frame 0 of the stream shows what a player shows at 0, a frame or so after the encoder's first picture.
- **Seeking is a binary search over the playlist**, then one segment. A four-hour stream (2,400 segments) imports in about 0.4 s, renders a frame from its third hour in about 0.2 s, and exports ten seconds from there reading under 10 MB.
- **Signing:** the resolver signs and renews the playlist's URL. Segments are read at the URLs the playlist gives, so ones that need their own signatures must come signed in it; a segment the server refuses is retried beside the renewed playlist.

### Long media

Hours-long sources edit like short ones, as long as nothing reads them whole. Measured on a four-hour 960×540 source in the editor, with the whole stream on the timeline, seeking to the third hour and playing:

| | Read before playing | Read in total | Heap |
| --- | --- | --- | --- |
| MP4, faststart (2.9 GB) | 88 MB | 122 MB | 204 MB |
| HLS, 6 s segments | 15 MB | 23 MB | 146 MB |

- **An MP4's index scales with its length**: about 29 MB for four hours at 30 fps. The probe reads it once into the block cache, but each preview `<video>` reads it again on its own. Prefer HLS for streams longer than an hour or so.
- **Waveforms decode at most ten minutes of a URL asset per request** (`REMOTE_WAVEFORM_MAX_SPAN_SEC`). Audio interleaves with video, so decoding any stretch of audio reads every byte of it: a timeline zoomed out over a whole stream shows no waveform until it's zoomed in that far, and the audio meters read what the visible ranges decoded.
- **Keyframe indexes are only built where they're free.** An MP4's comes from its sample table; for HLS and other remote streams the decoder seeks with a fixed backtrack instead of walking every segment.
- Whole-file jobs (proxies, transcription, scene analysis, bundles) still download the asset. Run them on short media, or on a server.

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
createEditor({ media: { local: true, url: false } })   // files only
```

A turned-off source is refused with `MEDIA_SOURCE_DISABLED`, both when adding media and when loading a document that uses it.
