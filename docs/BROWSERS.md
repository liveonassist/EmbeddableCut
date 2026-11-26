# Browsers

Chromium (Chrome, Edge, Brave, Arc) has everything the editor uses. Firefox runs the same editor, with the differences below handled in the engine. Safari isn't supported yet.

Hosts can see what the browser offers without sniffing it: `getPlatformSupport()` in the SDK, and `platform` in the bridge's `editor.describe`.

## Support

| | Chromium 113+ | Firefox, Windows 141+ and Apple Silicon 147+ | Firefox, Linux and Intel Macs |
| --- | --- | --- | --- |
| Editing, preview, export | ✓ | ✓ | ✓ |
| GPU effects, transitions, color, GPU AI tools | ✓ | ✓ | ✗: no WebGPU in release Firefox |
| Workspace | A folder on disk, or private storage | Private storage | Private storage |
| Imported files | Linked in place, or copied | Copied | Copied |
| H.264, VP9, AV1 decode and encode | ✓ | ✓ | ✓, H.264 through the system's FFmpeg |
| HEVC decode | ✓ where the OS has it | Through the media element: correct, slower | Through the media element, on Linux with the system's FFmpeg |
| AAC encode | Native, or WASM on Linux | WASM | WASM |
| HLS preview | `<video>`, with adaptive bitrate | The engine decodes it | The engine decodes it |

## The differences

### Workspace

Firefox has no File System Access API, and Mozilla has no plans for one, so a page can't open a folder on disk.

- **The workspace is the origin's private storage (OPFS).** The app opens it without asking; an SDK editor gets it by default (`workspace: 'opfs'`). `Editor.workspaceKind` is `'folder'`, `'private'` or `'none'`.
- **Imports are copied in.** Files from a file input or a drop are wrapped as read-only handles (`fileBackedHandle`), which the import code takes like any other; they can't be linked, so `importFiles(…, { storageMode: 'link' })` copies (`getPlatformSupport().linkedMedia`).
- **Private storage can be evicted.** Best-effort storage is capped (10 GiB in Firefox) and cleared under disk pressure. The app asks once to keep it; hosts call `editor.requestPersistentStorage()` from a user gesture, since Firefox asks the user, and read `editor.storagePersisted()`.
- **Clearing site data deletes every project.** Project bundles are the backup: the app's **Download Project**, the SDK's `toBundle()`.
- **Bundles import beside the workspace** (`embeddablecut-imports` in private storage), since there's no folder to pick.
- **Pickers are file inputs and downloads**, for media, LUTs, relinking missing media (a directory input) and saving bundles.
- A window that refuses private storage too (some private windows) gets the "Storage unavailable" page.

### Getting frames to the GPU

Firefox's `copyExternalImageToTexture` refuses `<video>` elements and `VideoFrame`s, and its canvas uploads read pixels back to the CPU. `uploadExternalImage` (`infrastructure/gpu-media/external-image-upload.ts`) takes every upload:

- Where the browser copies frames (Chromium), it copies as before.
- Where it doesn't but imports them (Firefox on Windows and macOS), the frame is imported as an external texture, zero-copy from the decoder, and drawn 1:1 into the destination with `textureLoad`. Plain video items also take the direct GPU path there, skipping the 2D canvas.
- Otherwise (Linux, 10-bit software-decoded frames), the frame is staged through a 2D canvas.

Mozilla's open work here is Linux-only (external textures over DMA-buf, bug 2008705); its patch for copying frames (bug 1922100) would still read them back. Nothing better is coming for Windows and macOS.

### HEVC

Firefox's WebCodecs has no HEVC; its `<video>` plays it through the OS. Shipping a software HEVC decoder would carry HEVC's patent licensing, so the engine decodes it through the media element instead (`infrastructure/browser/media-element-video-decoder.ts`), as a mediabunny decoder on the main thread:

- Each GOP so far is remuxed into a small MP4, loaded into a `<video>`, and its frames captured by seeking, emitted in presentation order once HEVC's reorder window has passed. Open GOPs keep their leading pictures with the GOP they reference.
- **It's slow.** Each seek decodes from the GOP's keyframe: about 13 s for 60 frames of 1080p in headless Firefox on Linux. Preview playback is the `<video>` itself and runs at full speed; scrubbing, transitions, thumbnails and export pay the cost.
- Workers have no media element: import thumbnails are taken on the main thread, filmstrips fall back to `<video>` extraction, and export falls back from its worker to the main thread.
- Untagged SD HEVC can look slightly different in color: Firefox's `<video>` and WebCodecs assume different YUV matrices for video that doesn't say. Camera footage is tagged.

### HLS

Chromium and Safari play an HLS playlist in a `<video>`; Firefox doesn't. There the preview decodes it like ProRes, through mediabunny and the same fetch layer export uses, and its audio goes through the custom decoder. The highest-bandwidth variant is decoded; there's no adaptive bitrate.

### Smaller things

- Scrollbars are styled with `scrollbar-color` behind a Firefox-only `@supports`, since Chromium lets the standard properties replace its `::-webkit-scrollbar` styling.
- The eyedropper is the editor's own, in every browser.
- `performance.memory` and `navigator.userAgentData` have fallbacks.

## Testing

`just render test-firefox` renders through the harness in stock Firefox over WebDriver BiDi and probes the output: H.264 to H.264/AAC, HLS, a GPU effect and HEVC, checked against their sources. WebGPU is forced on, as Linux release Firefox doesn't enable it. Zero-copy uploads need Windows or macOS, so they aren't exercised on Linux.
