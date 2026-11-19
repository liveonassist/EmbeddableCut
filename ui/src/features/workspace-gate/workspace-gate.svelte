<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  /**
   * Routes that read/write the workspace and therefore need the gate to be
   * ready before their loaders run. Anything else renders freely without
   * waiting on storage initialization.
   */
  function isStorageProtectedPath(pathname: string): boolean {
    return pathname.startsWith('/projects') || pathname.startsWith('/editor')
  }

  const logger = createLogger('WorkspaceGate')

  /** FreeCut's own activation: the folder becomes the workspace root. */
  async function activateWorkspaceRoot(handle: FileSystemDirectoryHandle): Promise<void> {
    setWorkspaceRoot(handle)
    try {
      const { bootstrapWorkspace } = await import('@/infrastructure/storage/workspace-fs/bootstrap')
      await bootstrapWorkspace(handle)
    } catch (error) {
      logger.warn('bootstrapWorkspace failed', error)
    }
  }
</script>

<script lang="ts">
  /**
   * WorkspaceGate
   *
   * Wraps the router and, when the current URL is a storage-dependent route
   * (`/projects*` or `/editor*`), blocks it until the user has picked a
   * workspace folder and granted read/write permission:
   *
   *   1. Check handles-db for a saved workspace handle
   *   2. If missing → show splash prompting user to pick a folder
   *   3. If present → queryPermission; if granted, set the active root and
   *      render the children. If revoked, show a Reconnect splash.
   *
   * The landing page (`/`) is not a storage-dependent route — it renders
   * without waiting for the gate, so users see no splash flash on first
   * visit. Navigating into a protected route after the handle is initialized
   * falls through to the "ready" path without additional UI.
   *
   * Also listens for permission-lost signals from fs-primitives and flips
   * back to the Reconnect state mid-session.
   *
   * `openWorkspace` replaces how a granted folder becomes the workspace: the
   * app opens its SDK editor on it. Without it, the gate sets the workspace
   * root itself, as FreeCut's does.
   */
  import type { Snippet } from 'svelte'
  import {
    ensureKnownWorkspaceForCurrent,
    getWorkspaceHandleRecord,
    isFileSystemAccessSupported,
    queryHandlePermission,
    requestHandlePermission,
    saveWorkspaceHandleRecord,
  } from '@/infrastructure/storage/handles-db'
  import { onPermissionLost, setWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
  import { t } from '$lib/i18n.svelte'
  import WorkspaceGateSplash from './workspace-gate-splash.svelte'
  import { usePathname } from './use-pathname.svelte'
  import type { GateStatus } from './types'

  let {
    children,
    openWorkspace = activateWorkspaceRoot,
  }: {
    children?: Snippet
    openWorkspace?: (handle: FileSystemDirectoryHandle) => Promise<void>
  } = $props()

  let status = $state.raw<GateStatus>({ kind: 'initializing' })
  let error = $state<string | null>(null)
  const pathname = usePathname()
  const needsWorkspace = $derived(isStorageProtectedPath(pathname.current))

  async function activate(handle: FileSystemDirectoryHandle) {
    await openWorkspace(handle)
    // Fire the auto-purge sweep for long-trashed projects in the
    // background — it touches disk and we don't want it to block the
    // app render. Wrapped in setTimeout so it runs after first paint.
    setTimeout(() => {
      void import('./deps/trash-auto-purge').then(({ autoPurgeExpiredTrash }) =>
        autoPurgeExpiredTrash(),
      )
    }, 0)
    status = { kind: 'ready' }
  }

  // Initial load: check if we have a saved handle, check its permission.
  // Skipped on routes that never touch storage (landing page) so first paint
  // doesn't wait on IndexedDB; the effect re-runs when a protected route mounts.
  $effect(() => {
    if (!needsWorkspace) return
    let cancelled = false
    ;(async () => {
      if (!isFileSystemAccessSupported()) {
        if (!cancelled) status = { kind: 'unavailable' }
        return
      }
      // Promote any legacy `workspace:current` into a proper known-workspace
      // record before we read it, so the indicator's "known workspaces" list
      // includes the one the user is about to use.
      await ensureKnownWorkspaceForCurrent()
      const record = await getWorkspaceHandleRecord()
      if (!record) {
        if (!cancelled) status = { kind: 'pick' }
        return
      }
      const handle = record.handle as FileSystemDirectoryHandle
      const permission = await queryHandlePermission(handle)
      if (cancelled) return
      if (permission === 'granted') {
        await activate(handle)
      } else {
        status = { kind: 'reconnect', handleName: record.name }
      }
    })().catch((error) => {
      logger.error('Gate initialization failed', error)
      if (!cancelled) status = { kind: 'pick' }
    })
    return () => {
      cancelled = true
    }
  })

  // Permission-lost mid-session → flip to reconnect.
  $effect(() =>
    onPermissionLost(() => {
      void (async () => {
        const record = await getWorkspaceHandleRecord()
        status = { kind: 'reconnect', handleName: record?.name ?? 'workspace' }
      })()
    }),
  )

  async function handlePick() {
    error = null
    try {
      const handle = await window.showDirectoryPicker({
        id: 'embeddablecut-workspace',
        mode: 'readwrite',
        startIn: 'documents',
      })
      const queryState = await queryHandlePermission(handle)
      const finalState =
        queryState === 'granted' ? queryState : await requestHandlePermission(handle)
      if (finalState !== 'granted') {
        error = t('projects.workspaceGate.folderPermissionDenied')
        status = { kind: 'reconnect', handleName: handle.name }
        return
      }
      await saveWorkspaceHandleRecord(handle)
      await activate(handle)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        // User cancelled the picker; stay on splash.
        return
      }
      logger.error('Folder pick failed', cause)
      error = t('projects.workspaceGate.folderPickFailed')
    }
  }

  async function handleReconnect() {
    error = null
    const record = await getWorkspaceHandleRecord()
    if (!record) {
      status = { kind: 'pick' }
      return
    }
    const handle = record.handle as FileSystemDirectoryHandle
    const permission = await requestHandlePermission(handle)
    if (permission === 'granted') {
      await activate(handle)
      return
    }
    error = t('projects.workspaceGate.reconnectPermissionDenied')
  }
</script>

<!--
  Routes that don't touch storage never wait on the gate — no splash, no
  flash, even on first load while we're checking handles-db.
-->
{#if !needsWorkspace || status.kind === 'ready'}
  {@render children?.()}
{:else if status.kind === 'initializing'}
  <!--
    On protected routes during initialization, render a bare background
    block so the transition from "checking" to "ready" or "splash" is
    invisible instead of a logo+spinner flash.
  -->
  <div class="min-h-screen bg-background" aria-hidden="true"></div>
{:else}
  <WorkspaceGateSplash
    {status}
    {error}
    onPickFolder={() => void handlePick()}
    onReconnect={() => void handleReconnect()}
  />
{/if}
