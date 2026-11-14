<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { EditorUi } from '$lib/context'
  import ErrorBoundary from '@/components/error-boundary.svelte'
  import WorkspaceGate from '@/features/workspace-gate/workspace-gate.svelte'
  import EditorRoot from './editor-root.svelte'
  import PwaInstallPrompt from './pwa-install-prompt.svelte'
  import RouteErrorScreen from './route-error.svelte'
  import { Router, RouterProvider } from './router'
  import { routeTree } from './route-tree'

  /**
   * The whole FreeCut app, as `mountApp` mounts it: the workspace gate, the
   * router and its routes. `openWorkspace` turns the folder the gate is
   * granted into the SDK editor's workspace.
   */
  let {
    ui,
    openWorkspace,
  }: { ui: EditorUi; openWorkspace: (handle: FileSystemDirectoryHandle) => Promise<void> } =
    $props()

  const router = new Router(routeTree)

  // Prevent default browser zoom application-wide
  $effect(() => {
    const wheelListenerOptions: AddEventListenerOptions = { passive: false, capture: true }
    const keyListenerOptions: AddEventListenerOptions = { capture: true }

    const preventBrowserZoom = (e: WheelEvent) => {
      // Prevent browser zoom when Ctrl/Cmd is held
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }

    const preventKeyboardZoom = (e: KeyboardEvent) => {
      // Prevent browser zoom shortcuts: Ctrl+=/+/-, Ctrl+0
      // Only preventDefault (blocks browser zoom), the event still reaches the hotkeys
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0') {
          e.preventDefault()
          // DO NOT call stopPropagation() - the hotkeys must still receive this
        }
      }
    }

    // Add listeners at capture phase to intercept before browser handles them
    document.addEventListener('wheel', preventBrowserZoom, wheelListenerOptions)
    document.addEventListener('keydown', preventKeyboardZoom, keyListenerOptions)

    return () => {
      document.removeEventListener('wheel', preventBrowserZoom, wheelListenerOptions)
      document.removeEventListener('keydown', preventKeyboardZoom, keyListenerOptions)
    }
  })
</script>

<!--
  The editor root mounts what FreeCut's app root does: the tooltip provider,
  the global `data-tooltip` tooltip and the toaster.
  WorkspaceGate blocks the router until a workspace handle is granted, so
  route loaders — which run before route components mount — never see an
  uninitialized workspace root.
-->
<EditorRoot {ui}>
  <ErrorBoundary level="app">
    <WorkspaceGate {openWorkspace}>
      <RouterProvider {router} defaultErrorComponent={RouteErrorScreen} />
    </WorkspaceGate>
    <PwaInstallPrompt />
  </ErrorBoundary>
</EditorRoot>
