# Embedding the editor

`@embeddablecut/ui` puts FreeCut's editor, or just its preview, in any page, whatever framework the page uses. The editor is driven through the SDK's `Editor` ([`sdk/README.md`](../sdk/README.md)), the same API a host without the UI uses.

## Choosing a mode

| | What you get | Instances per page |
| --- | --- | --- |
| `mountEditor(target, options)` | The full editor in a shadow root (or straight in the page with `isolation: 'none'`), driven by an in-page `Editor` | one at a time |
| `mountEditorFrame(target, { src })` | The full editor in an iframe, driven by a `RemoteEditor` over the [bridge](BRIDGE.md) | any number |
| `mountPreview(target, { editor })` | Only the playable composition, for hosts with their own editing UI | one, beside the editor's engine |
| `mountApp(target)` | FreeCut's whole app: landing page, projects, docs, editor (what `web/` ships) | one |
| `createEditor()` from the SDK | No UI: edit, play, render and export headless | one per page |

The engine's state is per page, so a second `mountEditor` is refused until the first is unmounted. Editors in iframes each have their own engine.

## Serving

- The editor needs WebGPU, WebCodecs and a cross-origin-isolated page: serve the host page (and the iframe page) with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`).
- `npm run build` in `ui/` writes the library to `dist/lib/` (`embeddablecut.js`, with the stylesheet inside it, plus its workers and chunks) and the iframe page to `dist/embed/` (`embed.html`, which loads its assets relatively, so it can be served from any path).
- Hosts in this workspace can import `@embeddablecut/ui` as source and bundle it with Vite and `@sveltejs/vite-plugin-svelte`, resolving `@/` and `$lib` as `web/vite.config.ts` does.

## The editor in the page

```ts
import { mountEditor } from '@embeddablecut/ui'

const mounted = await mountEditor(document.getElementById('editor')!, { theme: 'light' })
const { editor } = mounted
await editor.createProject({ name: 'Promo', width: 1920, height: 1080, fps: 30 })
const track = editor.timeline.tracks.find((t) => t.kind !== 'audio')!
await editor.apply([{ op: 'addText', id: 'title', text: 'Hello', from: 0, durationInFrames: 90, trackId: track.id }])

// Later:
await mounted.unmount()
```

- **Size:** the editor fills its container, which needs a height. The shadow host has inline-size containment, so the editor's minimum width never widens a host's grid or flex track; FreeCut's layout is dense, and works best from about 1280px wide.
- **Isolation:** in a shadow root, the editor's stylesheet stays inside and the host's styles stay out; dialogs, menus and tooltips portal inside the editor. Keyboard shortcuts only see keys typed inside it.
- **Opening a project:** `document` (a project document) or `projectId` with a `workspace` in the options open one while mounting; `editor.loadDocument`, `openProject` and `createProject` do it any time.

## The editor in an iframe

```ts
import { mountEditorFrame } from '@embeddablecut/ui'

const framed = await mountEditorFrame(document.getElementById('editor')!, {
  src: '/embeddablecut/embed.html',
  theme: 'dark',
})
await framed.editor.call('project.create', { name: 'Framed' })
const doc = await framed.editor.call('project.toDocument')
framed.unmount()
```

`embed.html` accepts connections only from its own origin and those named in `?parent=` (`mountEditorFrame` adds yours). A WebView talks to the same page over a string channel instead ([`FLUTTER.md`](FLUTTER.md)).

## Theming

- `theme: 'dark' | 'light' | 'system'` picks a theme; `mounted.setTheme(...)` switches it at runtime. Dark is FreeCut's.
- Any token can be overridden: `setTheme({ mode: 'dark', tokens: { primary: 'oklch(0.7 0.15 250)', 'preview-surround': '#101418' } })`, or a plain `{ token: value }` record, which keeps the current mode and replaces the overrides. `THEME_TOKENS` lists them: the semantic colors (`background`, `primary`, `border`, …), panel and timeline surfaces, the surfaces around footage (`preview-surround`, `preview-letterbox`, `meter-well`, `strip`, `waveform-well`, …) and `radius`. [`DESIGN.md`](DESIGN.md) gives FreeCut's values.
- With `isolation: 'none'`, `data-theme` on the editor's `.ec-root` picks the theme, and the tokens can be set in the page's CSS.
- `productName: 'Acme Studio'` (`mountEditor` or `mountEditorFrame`) is what the editor's copy calls itself, in notices like "Acme Studio cannot access 2 media files" and its accessible label. It's `EmbeddableCut` otherwise. A mounted editor shows no logo and links nowhere outside itself: its help is the host's ([actions](#taking-over-saving-and-exporting)).

## Extending the UI

Contributions come from the host (`ui` in the mount options, or `mounted.configure(ui)` to replace them) and from extensions (`Extension.ui`, see [`sdk/README.md`](../sdk/README.md)). Each piece of content is a Svelte component or, for any other framework, `{ render(container, context) }` returning a cleanup.

```ts
await mountEditor(target, {
  ui: {
    toolbar: [
      { id: 'publish', label: 'Publish', icon: 'upload', region: 'right', onSelect: ({ editor }) => publish(editor.toDocument()) },
    ],
    panels: [
      {
        id: 'brand-assets',
        title: 'Brand',
        icon: 'palette',
        region: 'media',
        content: {
          render(container, { editor }) {
            const root = createRoot(container) // e.g. React
            root.render(<BrandPanel editor={editor} />)
            return () => root.unmount()
          },
        },
      },
    ],
    menus: [
      { id: 'approve', menu: 'clip', label: 'Send for review', onSelect: ({ item }) => review(item.id) },
    ],
    components: { 'project-menu': { render: (el) => mountProjectSwitcher(el) } },
  },
})
```

| Contribution | Where it appears |
| --- | --- |
| `toolbar` | The top bar's left, center or right group: a button (`onSelect`) or your own control (`content`) |
| `panels` | `media`: a tab in the left sidebar; `inspector`: beside the properties sidebar; `bottom`: beside the timeline |
| `inspector` | A section in the clip inspector, for the items `when` accepts |
| `menus` | The context menu of a clip, track, media item or the timeline |
| `components` | Replaces a built-in region: `toolbar`, `media-sidebar`, `properties-sidebar`, `preview`, `timeline`, `project-menu` |

Icons are Lucide names (`'upload'`) or components. `order` places a contribution among the built-ins, which sit at multiples of 100.

## Taking over saving and exporting

`actions` replaces what the editor does when the user saves, exports or asks for help, wherever they ask: the toolbar, the menus, the shortcuts and auto-save. Each handler gets `{ editor, runDefault }`, and `runDefault()` still does what the editor would have.

```ts
const mounted = await mountEditor(target, {
  document: await api.load(projectId),
  actions: {
    save: async ({ editor, trigger }) => {
      await api.save(projectId, editor.toDocument())   // trigger: 'user', 'auto', 'leave' or 'export'
    },
    exportVideo: async ({ editor, runDefault }) => {
      if (await api.canRender()) await api.render(projectId, editor.toDocument())  // a server render, no dialog
      else await runDefault()                                                      // the export dialog after all
    },
    deliver: {
      label: 'Publish',
      icon: 'upload',
      run: async ({ file }) => api.publish(projectId, file.blob, file.mimeType),
    },
    help: () => openHelpPanel(),
  },
  settings: { values: { autoSaveInterval: 1 }, locked: ['autoSaveInterval'] },
})
mounted.setActions({ help: () => openHelpPanel() })   // replaces every handler given before
```

| Action | Replaces | `runDefault()` |
| --- | --- | --- |
| `save` | Save, its shortcut, auto-save, saving before leaving for the projects page (`trigger: 'leave'`) and before a project zip (`'export'`) | Writes a workspace project to its workspace; nothing for a project opened from a document |
| `exportVideo` | Export › Video and its shortcut | Opens the export dialog |
| `exportBundle` | Export › Project zip | Asks where to save the zip and writes it |
| `deliver` | The export dialog's Download, which becomes `label` | Downloads the file |
| `help` | The toolbar's User Guide | Opens the app's user guide; a mounted editor has none, so it shows the button only with a handler |

- **Saving marks the project clean** once the handler resolves, unless the timeline changed while it ran; a handler that throws leaves it dirty, and the user sees the save fail. Other handlers' errors are shown to the user too.
- **Auto-save** runs `save` every `autoSaveInterval` minutes while there are unsaved changes. To save on every edit instead, listen to `editor.on('change')` and save from there.
- A project zip is built from the workspace's copy, so a `save` handler wanting the zip to have the latest edits calls `runDefault()` when `trigger` is `'export'`.
- In an iframe, `mountEditorFrame(target, { src, actions })` and `framed.setActions(...)` take the same handlers, given `{ editor: RemoteEditor, runDefault }`; `deliver.icon` is a Lucide name. Over the bridge they're `ui.setActions` and the `action` event ([BRIDGE.md](BRIDGE.md#actions)).

## Hiding and locking features

A host can switch off the editor's own features: hidden ones don't render, locked ones render disabled and take no input, and either way their keyboard shortcuts don't fire. Settings and edits are policed by the engine itself, so they hold for shortcuts and the SDK too.

```ts
const mounted = await mountEditor(target, {
  features: {
    'toolbar.workspaces': false,
    ai: false,                                  // every ai.* feature, wherever it appears
    'project.size': 'locked',                   // a fixed 1080×1920 canvas
    'clip.delete': ({ items }) => !items.some((item) => item.mediaId === streamMediaId),
  },
  settings: { values: { autoSaveInterval: 0 }, locked: ['autoSaveInterval'] },
  guards: { remove: (items) => !items.some((item) => item.mediaId === streamMediaId) },
})
mounted.setFeatures({ export: 'locked' })       // replaces every switch given before
```

- **Ids are hierarchical.** `toolbar` covers every `toolbar.*`; a value on a parent and one on a child combine, the more restrictive winning. `FEATURE_IDS` lists them all.
- **A value** is `true` (the default), `false` (hidden), `'locked'`, or a predicate returning one. A predicate gets `{ editor, id, items, track? }`: `items` are the clips the feature acts on (the selection, unless the UI names them), `track` the track a track action is for. It's asked again as the selection changes.
- **Features hide UI; guards forbid edits.** `clip.delete: false` removes the menu item and the Delete shortcut, but the clip can still go by ripple delete, cutting, deleting its track or its media. To keep it on the timeline whatever the user does, add a guard (`EditorOptions.guards`, [`sdk/README.md`](../sdk/README.md#settings-and-guards)); a refused edit is rolled back and the user is told why.
- **Settings** (`EditorOptions.settings`) force values, lock keys (enforced in the settings store, so no toggle or shortcut changes them) and hide keys from the settings dialog. The user's own values stay saved for other editors on the origin.
- In an iframe, `mountEditorFrame(target, { src, features })` and `framed.setFeatures(...)` take values only (predicates can't cross to the frame), and the bridge's `settings.setPolicy` sets the settings policy.

| Ids | What they switch |
| --- | --- |
| `toolbar.project`, `.workspaces`, `.docs`, `.whats-new`, `.settings`, `.shortcuts`, `.language`, `.save`, `.render-queue` | The top bar's built-in pieces: the back button and project name, the Edit/Color/Animate switcher, help, What's New, the settings and shortcuts dialogs, the language picker, Save, the render queue |
| `export`, `export.video`, `export.bundle` | The Export menu, and its video and project-zip entries |
| `project.size`, `project.frame-rate`, `project.background` | Changing the canvas: the canvas panel's size and background, and the offer to match the project to the first clip added |
| `sidebar.media`, `.text`, `.shapes`, `.effects`, `.transitions`, `.stickers`, `.transcript`, `.ai` | The left sidebar's tabs; `sidebar` is the whole sidebar |
| `media.relink`, `media.proxy`, `media.delete` | A media item's menu entries, and deleting from the library |
| `inspector.canvas`, `inspector.video`, `.audio`, `.effects`, `.animation` | The properties sidebar's canvas panel and clip tabs; `inspector` is the whole sidebar |
| `timeline.trim-tool`, `.razor`, `.rate-stretch`, `.slip-slide`, `.history`, `.in-out`, `.markers`, `.record`, `.snap`, `.audio-skimming`, `.keyframes`, `.linked-selection` | The timeline header's tools and toggles, with their shortcuts |
| `clip.delete`, `.ripple-delete`, `.clipboard`, `.join`, `.link`, `.reverse`, `.freeze-frame`, `.compound` | A clip's menu entries and shortcuts |
| `track.add`, `track.delete`, `track.close-gaps` | A track header's menu entries |
| `ai.generate`, `.transcript`, `.captions`, `.speech`, `.scenes`, `.cleanup`, `.media` | AI wherever it appears: the AI and transcript tabs, caption generation, text to speech, scene detection, silence and filler removal, media analysis, interpolation and upscaling |
