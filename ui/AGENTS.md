# Editor UI

`ui/` is `@embeddablecut/ui`: FreeCut's editor in Svelte 5, mountable in any page. `mountEditor` renders the full editor in a shadow root (or straight into a page, as the app does), `mountEditorFrame` runs it in an iframe over the SDK's bridge, and every piece is a component hosts can reuse, extend or replace. It drives the engine through `@embeddablecut/sdk` and the engine's stores, exactly as the React app does.

## Commands

Run inside `nix develop` from `ui/`:

```bash
npm run check     # oxlint, then svelte-check (TypeScript 6, see below) — CI gate
npx vp test run   # jsdom + @testing-library/svelte
npm run dev       # Vite dev server for embed.html
```

## Layout

`src/` mirrors `web/src/` path for path: **`web/src/<path>/<name>.tsx` is ported to `ui/src/<path>/<name>.svelte`**, and a React hook `use-<name>.ts` to `use-<name>.svelte.ts`. Keep FreeCut's file names (kebab-case), so an upstream change to a React file names the Svelte file to carry it to.

- `src/lib/` — the bindings every component uses: `store.svelte.ts` (`select`), `i18n.svelte.ts` (`t`), `hotkeys.svelte.ts` (`useHotkeys`), `cn.ts`, `context.ts` (`getEditorUi`, `portalTarget`).
- `src/components/ui/` — the primitives, ports of the shadcn/Radix kit on bits-ui, with the React kit's class strings unchanged.
- `src/embed/` — `mountEditor`, `mountEditorFrame`, the iframe page's entry, fonts.
- `src/extensions/` — what hosts and extensions contribute (`UiContributions`), and the `ContributionRegistry` the UI reads them from.
- `src/theme/` — `ThemeController`: dark (FreeCut's), light, system, and token overrides.
- `src/styles/app.css` — FreeCut's stylesheet, scoped for shadow roots, with the light theme.
- `src/app/` — `editor-app.svelte` (the full editor `mountEditor` mounts) and `editor-root.svelte` (context, toaster).

## Porting from React

The bar is FreeCut's editor as it is: same markup, same Tailwind classes, same behavior, same keyboard and pointer handling, same accessibility attributes. A port is a translation, not a redesign.

| React | Svelte 5 |
| --- | --- |
| `useXStore((s) => s.items)` | `const items = select(useXStore, (s) => s.items)`, read `items.current` |
| `useXStore(useShallow((s) => ({ a: s.a, b: s.b })))` | `select(useXStore, (s) => ({ a: s.a, b: s.b }), shallow)` |
| `useXStore.getState()` in handlers | unchanged |
| `useState` | `$state` (`$state.raw` for large arrays and objects replaced wholesale) |
| `useMemo`, derived values | `$derived` / `$derived.by` |
| `useEffect(fn, deps)` | `$effect` returning the cleanup; read the dependencies inside it |
| `useLayoutEffect` | `$effect.pre` |
| `useRef` for a value | a plain `let` |
| `useRef` for an element | `bind:this` |
| `useCallback` | a plain function |
| `useContext` / providers | `getContext` / `setContext` with a typed key, in a `*.svelte.ts` or `context.ts` beside it |
| `forwardRef` | a bindable `ref` prop (`ref = $bindable(null)`) |
| `children`, render props | snippets (`children`, `{#snippet name(args)}`) |
| `asChild` | bits-ui's `child` snippet |
| `onClick` props | `onclick` on elements; component callback props keep their React names (`onSelect`, `onValueChange`) |
| `className` | `class` |
| `style={{ left: x }}` | `style:left="{x}px"` or a `style` string |
| `useTranslation()` / `t('key')` | `import { t } from '$lib/i18n.svelte'`; `t('key')` |
| `useHotkeys(keys, fn, opts)` | `useHotkeys(() => keys, fn, () => opts)` from `$lib/hotkeys.svelte` |
| `toast` from `sonner` | `toast` from `svelte-sonner` |
| `lucide-react` icons | `lucide-svelte` at the same 0.468.0: `import Play from 'lucide-svelte/icons/play'` |
| `@radix-ui/*` | `bits-ui`, through the primitives in `$components/ui/` |
| `react-resizable-panels` | `paneforge` |
| `@tanstack/react-virtual` | `@tanstack/svelte-virtual` |
| `motion` animations | Svelte transitions or CSS, matching the curves and durations |
| React `memo`, `startTransition` | nothing: Svelte updates only what read a changed value |

- **Imports stay as they were.** `@/` resolves against `ui/src` first and then `engine/src`, so a ported file imports engine modules (`@/features/timeline/stores/items-store`, `deps/` adapters, `@/shared/...`) with the same specifiers as the React original. Import Svelte siblings with their `.svelte` extension.
- **The `deps/` seams carry over.** A feature reaches another through its `deps/` adapters. The React app's `deps/*-ui-contract.ts` files re-export components; their Svelte twins live at the same paths here, re-exporting `.svelte` components.
- **Portals render inside the editor.** Every dialog, popover, menu and tooltip portals to `portalTarget()` (the primitives already do), never to the host's `document.body`.
- **Global cursors and drag state** set classes on `document.body` in FreeCut. Set them on `document.body` and on the editor's `.ec-root` (`getEditorUi().portalTarget` and its root), since a shadow root sees only the latter; the CSS matches both.
- **Ports keep FreeCut's comments** where they explain the why, and drop those that described React mechanics.
- New files start with an SPDX header: `<!-- SPDX-License-Identifier: MIT -->` in `.svelte`, `// SPDX-License-Identifier: MIT` in `.ts`.
- **Tests** port the React tests that check behavior (`*.test.tsx` → `*.test.ts` with `@testing-library/svelte`), at about the same density. Snippets in tests come from `createRawSnippet`.
- Formatting: oxfmt from inside `ui/` (`npx vp fmt src`), never from the repo root, which has no config.

## Conventions

- **`svelte-check` runs on TypeScript 6** through `scripts/svelte-check.mjs`: the workspace pins TypeScript 7 for oxlint, which has no language service, so 6 is installed as `typescript6` and resolved for svelte-check alone.
- The UI reaches the engine through the SDK's `Editor` (`getEditorUi().editor`) for anything the SDK offers, and through the engine's stores and actions for the rest, as FreeCut's components do.
- One editor per page (the engine's stores are per page): `mountEditor` refuses a second until the first is unmounted. More than one is `mountEditorFrame`.
- Shortcuts are scoped to the editor's shadow root when it's embedded (`setHotkeyScope`), so keys typed in the host page never reach it.
- Theming goes through tokens only: colors and radii come from the CSS variables in `styles/app.css`, never literal values in a component. `data-theme` on the editor root (or shadow host) picks the theme.
