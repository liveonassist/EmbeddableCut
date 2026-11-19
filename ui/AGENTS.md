# Editor UI

`ui/` is `@embeddablecut/ui`: FreeCut's editor in Svelte 5, mountable in any page, and the app around it (`mountApp`), which `web/` builds. `mountEditor` renders the full editor in a shadow root (or straight into a page, as the app does), `mountEditorFrame` runs it in an iframe over the SDK's bridge, and every piece is a component hosts can reuse, extend or replace. It drives the engine through `@embeddablecut/sdk` and the engine's stores, exactly as the React app does.

## Commands

Run inside `nix develop` from `ui/`:

```bash
npm run check     # oxlint, then svelte-check (TypeScript 6, see below) — CI gate
npx vp test run   # jsdom + @testing-library/svelte
npm run dev       # Vite dev server for embed.html (the app's is `just web dev`)
npm run build     # dist/embed (the iframe page) and dist/lib (the library)
npm run test:preview-sync:stress   # the preview's sync tests from cold, 20 runs
```

The changelog the app shows is `src/data/changelog.json` and `CHANGELOG.md`, appended by `npm run changelog:append` and rolled up by `npm run changelog:rollup`.

## Layout

`src/` is FreeCut's React UI, ported path for path: **FreeCut's `src/<path>/<name>.tsx` is `ui/src/<path>/<name>.svelte`**, a React hook `use-<name>.ts` is `use-<name>.svelte.ts`, and UI-only helpers keep their `.ts` names. Keep FreeCut's file names (kebab-case), so an upstream change to a React file names the Svelte file to carry it to ([`docs/UPSTREAM.md`](../docs/UPSTREAM.md)). FreeCut's `src/main.tsx` and `src/bootstrap.ts` are `src/main.ts` and `src/bootstrap.ts`, the app's entry (`@embeddablecut/ui/app`).

- `src/lib/` — the bindings every component uses, standing in for the React libraries: `store.svelte.ts` (`select`), `i18n.svelte.ts` (`t`), `hotkeys.svelte.ts` (`useHotkeys`, react-hotkeys-hook's rules), `router/` (TanStack Router's API on the history API), `cn.ts`, `context.ts` (`getEditorUi`, `portalTarget`).
- `src/components/ui/` — the primitives, ports of the shadcn/Radix kit on bits-ui, with the React kit's class strings unchanged ([Primitives](#primitives)).
- `src/embed/` — `mountEditor`, `mountEditorFrame`, the iframe page's entry, fonts.
- `src/extensions/` — what hosts and extensions contribute (`UiContributions`), and the `ContributionRegistry` the UI reads them from; the built-in features hosts can hide or lock (`features.ts`, `FeatureGate`); the actions hosts can take over (`actions.svelte.ts`, `HostActions`), and their bridge twins in `src/embed/frame-actions.ts`.
- `src/theme/` — `ThemeController`: dark (FreeCut's), light, system, and token overrides.
- `src/styles/app.css` — FreeCut's stylesheet, scoped for shadow roots, with the light theme.
- `src/app/` — `editor-app.svelte` (the full editor `mountEditor` mounts: `editor-root.svelte` around `editor-view.svelte`), `editor-root.svelte` (context, tooltips, toaster), and the app around it: `app.svelte`, `mount-app.ts` (`mountApp`) and `route-tree.ts`.

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
- **The `deps/` seams carry over.** A feature reaches another through its `deps/` adapters. FreeCut's `deps/*-ui-contract.ts` files re-export components; their Svelte twins live at the same paths here, re-exporting `.svelte` components.
- **Portals render inside the editor.** Every dialog, popover, menu and tooltip portals to `portalTarget()` (the primitives already do), never to the host's `document.body`.
- **Global cursors and drag state** set classes on `document.body` in FreeCut. Set them on `document.body` and on the editor's `.ec-root` (`getEditorUi().portalTarget` and its root), since a shadow root sees only the latter; the CSS matches both.
- **Ports keep FreeCut's comments** where they explain the why, and drop those that described React mechanics.
- New files start with an SPDX header: `<!-- SPDX-License-Identifier: MIT -->` in `.svelte`, `// SPDX-License-Identifier: MIT` in `.ts`.
- **A React file exporting several components becomes a folder** named after it: one `.svelte` per component and an `index.ts` re-exporting them under the React names (`io-range-markers.tsx` → `io-range-markers/`, `shapes/components.tsx` → `shapes/components/`). The React file's barrels (`index.ts`) port as barrels of `.svelte` defaults.
- **Element refs passed in become elements.** A `RefObject<El>` prop is the element itself, named without `Ref` (`positionSyncTargetRef` → `positionSyncTarget`, `scrollRef` → `scroll`), bound with `bind:this` to a `$state`. Mutable value refs (`suppressRefs`, `rafRef`) keep their `{ current }` shape.
- **Hooks take getters and return getters.** A hook's arguments are getter functions (`useNaturalHeight(() => el)`), an options object is one getter (`useMarqueeSelection(() => ({ container, items, … }))`) read on every event, so handlers see the latest props. Reactive results come back as `{ current }` or an object with getters (`selection.isActive`, `pickWhip.drag`): never destructure them. React's `containerRef`/`hitAreaRef` options are `container`/`hitArea`.
- **Callbacks passed to hooks are getters too** (`useRafCoalescedValue(() => onValue)`), so the hook calls the latest one. Split an options getter into one `$derived` per option before deriving from them, so each value recomputes only on the inputs React's `useMemo` listed.
- **An element ref threaded through a state bag** (created in one component, attached in a deeper one) stays a reactive `{ current }` box, attached with `bind:this={ref.current}`.
- **Types exported from a single-component `.tsx`** go in a `.ts` of the same name beside the `.svelte`, so importers keep their specifiers.
- **An engine contract exposing React-style store hooks** gets a `deps/<name>-ui*.ts` twin here, never a file of the same name: one in `ui/src` would shadow the engine module for everything.
- **Tagged translations** (react-i18next's `<Trans>`) are `$components/trans.svelte`: each tag renders through a snippet of the same name.
- **`motion` animations** become `{#if}` blocks with `transition:`, or a spring with motion's stiffness, damping and mass; `useReducedMotion` is `MediaQuery('(prefers-reduced-motion: reduce)')`, and reduced motion is instant.
- **A controlled dialog that may refuse to close** binds a getter/setter pair: `bind:open={() => open, setOpen}`.
- **`*ClassName` props are `*Class`** (`triggerClassName` → `triggerClass`, `handleClassName` → `handleClass`), like `className` → `class`.
- **No whitespace where JSX has none.** Svelte keeps one space between sibling elements on separate lines; JSX drops it. In inline contexts (text, `inline-flex` text content), write siblings adjacent (`</span><span>`).
- **Types exported from a component's `<script module>` are invisible to oxlint**: put shared prop types in a `.ts` beside the component (`window-portal/types.ts`).
- **A selector that reads props is `$derived(select(...))`**, read as `.current`: `select` captures its selector once, so one closing over a prop (`selectedItemIds.current`, an `itemId`) must be recreated when it changes.
- **A tooltip- or popover-wrapped button merges its props**: `{...mergeProps(props, { onclick })}` from bits-ui, since spreading `props` after `onclick` would replace the trigger's handler or the other way round.
- **Tab contents render only for the active tab**, as Radix's unmounting `TabsContent` did: gate them on the tab value, so hidden panels don't subscribe to stores.
- **Outside-click and target checks use `event.composedPath()[0]`**: in a shadow root, `event.target` seen from `document` is the shadow host.
- **Tests** port the React tests that check behavior (`*.test.tsx` → `*.test.ts` with `@testing-library/svelte`), at about the same density. Snippets in tests come from `createRawSnippet`; a test that composes components renders a `<name>.harness.svelte` beside it.
- **Mocked components are `<name>.stub.svelte`** beside the test, swapped in with `vi.mock(path, async () => ({ default: (await import('./x.stub.svelte')).default }))`. What a stub records for the test lives in a `<test>.test-state.ts` both import, since `vi.mock` factories can't close over the test's variables.
- Formatting: oxfmt from inside `ui/` (`npx vp fmt src`), never from the repo root, which has no config. oxfmt skips `.svelte` files: format those by hand, as the surrounding code is.

## Primitives

`src/components/ui/` ports FreeCut's shadcn/Radix kit onto bits-ui 2 (and paneforge, svelte-sonner), with every class string as the React kit has it.

- **One folder per React file, imported as the React file was.** FreeCut's `src/components/ui/<name>.tsx` is `ui/src/components/ui/<name>/`: one `.svelte` per exported part (`dropdown-menu/dropdown-menu-content.svelte`) and an `index.ts` exporting them under the React names, so `import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'` works unchanged. Single components follow the same scheme (`input/input.svelte` + `input/index.ts`). `button-variants.ts` stays at `components/ui/button-variants.ts`, where React imports it.
- Parts that Radix and bits-ui share unchanged are re-exported straight from bits-ui (`export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger`); parts with classes or markup are `.svelte` wrappers.
- **Roots accept Radix's uncontrolled defaults** where bits-ui has none: `Tabs`/`Accordion`/`Select` `defaultValue`, `Collapsible`/`Select` `defaultOpen`, `Switch` `defaultChecked`. Controlled props bind (`bind:value`, `bind:open`) or pair with `onValueChange`/`onOpenChange`.
- **`asChild` is the `child` snippet**: `<PopoverTrigger>{#snippet child({ props })}<Button {...props}>…</Button>{/snippet}</PopoverTrigger>`.
- **Every portaling part portals to `portalTarget()`**, or to its `container` prop where the React part had one (dialog, alert-dialog, popover, menus, select, tooltip). Non-Radix overlays (`FloatingPanel`, the eyedropper, the IO readout) portal there through bits-ui's `Portal`.
- **Radix names map to bits-ui's.** CSS variables `--radix-<part>-*` are `--bits-<part>-*`; `--radix-select-trigger-width/height` is `--bits-select-anchor-width/height`. Attributes: `data-radix-scroll-area-viewport` → `data-scroll-area-viewport`, `data-radix-popper-content-wrapper` → `data-bits-floating-content-wrapper`, `data-panel-group-direction` → `data-direction` (paneforge). Content callbacks use bits-ui's names (`onEscapeKeydown`, `onInteractOutside` for Radix's `onPointerDownOutside`).
- **Deliberate differences from Radix, so rendering and behavior match:**
  - `Select` registers each item's children so `SelectValue` shows the selected label while closed (Radix renders closed content offscreen for this); bits-ui highlights select items with `data-highlighted` instead of focus, so `SelectItem` adds `data-[highlighted]:` twins of its `focus:` accents. Only `position="popper"` exists.
  - `AlertDialogAction` closes the dialog after its `onclick` (a bits-ui `Dialog.Close`), as Radix's does; bits-ui's Action doesn't.
  - Menu labels are plain `<div>`s (bits-ui's `GroupHeading` needs a group); `ContextMenuTrigger` renders Radix's `<span>`.
  - bits-ui has no Progress Indicator or Slider Track part: the wrappers render Radix's markup for them.
  - `GlobalTooltip` listens on its own root node: `mouseenter` isn't composed, so the host's document never sees the editor's shadow-root elements.
- `editor-root.svelte` mounts what FreeCut's `app.tsx` does: `TooltipProvider` (bits-ui tooltips need one), `GlobalTooltip`, and the kit's `Toaster`.
- `svelte.config.js` compiles `node_modules` components in their own mode (lucide-svelte is Svelte 4 syntax) with `css: 'injected'`, which Svelte appends to the component's root node, so library styles (svelte-sonner, bits-ui) reach a shadow-root editor.

## Conventions

- **`svelte-check` runs on TypeScript 6** through `scripts/svelte-check.mjs`: the workspace pins TypeScript 7 for oxlint, which has no language service, so 6 is installed as `typescript6` and resolved for svelte-check alone.
- The UI reaches the engine through the SDK's `Editor` (`getEditorUi().editor`) for anything the SDK offers, and through the engine's stores and actions for the rest, as FreeCut's components do.
- One editor per page (the engine's stores are per page): `mountEditor` refuses a second until the first is unmounted. More than one is `mountEditorFrame`.
- Shortcuts are scoped to the editor's shadow root when it's embedded (`setHotkeyScope`), so keys typed in the host page never reach it.
- **Built-in UI a host may switch off checks the feature gate**: wrap it in `<Feature id>` (`@/components/feature.svelte`), or read `useFeatures().mode(id)` for menu items (a locked one is `disabled`). A new id goes in `FEATURE_IDS`, its shortcuts in `FEATURE_HOTKEYS` (`useResolvedHotkeys` unassigns them), and its row in docs/EMBEDDING.md. A setting's control sits in `<SettingGate keys>`, which reads the engine's settings policy.
- **Actions a host may take over** (saving, exporting, delivering the rendered file, help) call its handler from `getEditorUi().actions` instead of the built-in path, through `runAction` with the built-in path as `runDefault`. A new action goes in `EditorActions`, `BridgeActions` (`sdk/src/bridge/protocol.ts`) and `frame-actions.ts`, with its row in docs/EMBEDDING.md.
- **The mounted editor names no product and links nowhere.** Copy that names the product says `{{productName}}` (`setProductName`, `MountEditorOptions.productName`); the brand mark (`components/brand/embeddablecut-logo.svelte`) is for the app's pages only.
- Theming goes through tokens only: colors and radii come from the CSS variables in `styles/app.css`, never literal values in a component, including the dark surfaces around footage (`--preview-surround`, `--preview-letterbox`, `--meter-well`, `--strip`, `--waveform-well`; canvases read them with `getComputedStyle`). Every token is in `THEME_TOKENS`. `data-theme` on the editor root (or shadow host) picks the theme.
- **A color a theme should reach maps in `@theme inline`** (`--color-x: var(--x)`): a plain `@theme` resolves `var()` once at `:root`, where a theme on `.ec-root` can't override it.
