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
