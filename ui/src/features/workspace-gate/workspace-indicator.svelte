<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { HandleRecord } from '@/infrastructure/storage/handles-db'

  const logger = createLogger('WorkspaceIndicator')

  interface WorkspaceEntry {
    record: HandleRecord
    isActive: boolean
  }
</script>

<script lang="ts">
  /**
   * WorkspaceIndicator
   *
   * Lists every known workspace in a popover, marks the active one, and
   * exposes inline controls per workspace:
   *   - Switch       activate a different known workspace
   *   - Remove       forget the workspace (with inline Yes/Cancel confirm)
   *   - Add new…     pick another folder and set it as active
   *
   * All mutating actions reload the page so `WorkspaceGate` re-runs with
   * the new state. Reload is a sledgehammer but keeps the UX simple and
   * avoids plumbing a workspace-changed signal through every cached store.
   */
  import Check from 'lucide-svelte/icons/check'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import Plus from 'lucide-svelte/icons/plus'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { cn } from '@/shared/ui/cn'
  import {
    activateWorkspaceHandle,
    getWorkspaceHandleRecord,
    listKnownWorkspaces,
    queryHandlePermission,
    removeKnownWorkspace,
    requestHandlePermission,
    saveWorkspaceHandleRecord,
  } from '@/infrastructure/storage/handles-db'
  import { t } from '$lib/i18n.svelte'

  let entries = $state.raw<WorkspaceEntry[] | null>(null)
  let activeName = $state<string | null>(null)
  let popoverOpen = $state(false)
  let confirmRemoveId = $state<string | null>(null)

  async function loadEntries() {
    try {
      const [known, current] = await Promise.all([
        listKnownWorkspaces(),
        getWorkspaceHandleRecord(),
      ])
      const activeId = current?.activeWorkspaceId ?? null
      activeName = current?.name ?? null
      entries = known.map((record) => ({
        record,
        isActive: record.id === activeId,
      }))
    } catch (error) {
      logger.warn('Failed to load workspaces', error)
      entries = []
    }
  }

  $effect(() => {
    void loadEntries()
  })

  // Reset the per-row remove-confirm whenever the popover closes, so a
  // subsequent open always starts from the list view.
  $effect(() => {
    if (!popoverOpen) confirmRemoveId = null
  })

  async function handleAdd() {
    try {
      const handle = await window.showDirectoryPicker({
        id: 'embeddablecut-workspace',
        mode: 'readwrite',
        startIn: 'documents',
      })
      const existing = await queryHandlePermission(handle)
      const granted = existing === 'granted' ? existing : await requestHandlePermission(handle)
      if (granted !== 'granted') return
      await saveWorkspaceHandleRecord(handle)
      window.location.reload()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      logger.error('Add workspace failed', error)
    }
  }

  async function handleSwitch(workspaceId: string) {
    try {
      const record = await activateWorkspaceHandle(workspaceId)
      if (!record) return
      // A previously-granted handle may have lost permission between sessions;
      // request again before reloading.
      const handle = record.handle as FileSystemDirectoryHandle
      const existing = await queryHandlePermission(handle)
      if (existing !== 'granted') {
        // Reload regardless, so WorkspaceGate surfaces the reconnect splash if refused.
        await requestHandlePermission(handle)
      }
      window.location.reload()
    } catch (error) {
      logger.error(`Switch workspace failed (${workspaceId})`, error)
    }
  }

  async function handleRemove(workspaceId: string, wasActive: boolean) {
    try {
      await removeKnownWorkspace(workspaceId)
      if (wasActive) {
        window.location.reload()
        return
      }
      await loadEntries()
      confirmRemoveId = null
    } catch (error) {
      logger.error(`Remove workspace failed (${workspaceId})`, error)
    }
  }
</script>

<!--
  Nothing until the entries have loaded, and nothing without an active
  workspace: the gate is on-screen instead.
-->
{#if entries !== null && activeName}
  <Popover bind:open={popoverOpen}>
    <PopoverTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="lg"
          class="gap-2 px-4 max-w-[220px]"
          data-tooltip={t('projects.workspaceIndicator.workspaceFolder')}
          data-tooltip-side="bottom"
          aria-haspopup="menu"
          aria-expanded={popoverOpen}
        >
          <FolderOpen class="w-4 h-4 shrink-0" />
          <span class="truncate">{activeName}</span>
          <ChevronDown
            class={cn(
              'w-4 h-4 shrink-0 text-muted-foreground transition-transform',
              popoverOpen && 'rotate-180',
            )}
          />
        </Button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent class="w-80 p-2" align="end">
      <div class="text-xs font-medium text-muted-foreground px-2 py-1">
        {t('projects.workspaceIndicator.workspaces')}
      </div>

      <div class="flex flex-col">
        {#each entries as { record, isActive } (record.id)}
          {@const isConfirming = confirmRemoveId === record.id}
          <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent">
            <FolderOpen class="w-4 h-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 truncate text-sm" title={record.name}>
              {record.name}
            </span>
            {#if isActive}
              <span
                class="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"
              >
                <Check class="w-3 h-3" />
                {t('projects.workspaceIndicator.active')}
              </span>
            {/if}
            {#if isConfirming}
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs"
                onclick={() => (confirmRemoveId = null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                class="h-7 px-2 text-xs"
                onclick={() => void handleRemove(record.id, isActive)}
              >
                {t('projects.workspaceIndicator.remove')}
              </Button>
            {:else}
              {#if !isActive}
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs"
                  onclick={() => void handleSwitch(record.id)}
                >
                  {t('projects.workspaceIndicator.switch')}
                </Button>
              {/if}
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={t('projects.workspaceIndicator.removeWorkspace')}
                onclick={() => (confirmRemoveId = record.id)}
              >
                <Trash2 class="w-3.5 h-3.5" />
              </Button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="h-px bg-border my-1"></div>

      <Button
        variant="ghost"
        size="sm"
        class="w-full justify-start gap-2"
        onclick={() => void handleAdd()}
      >
        <Plus class="w-4 h-4" />
        {t('projects.workspaceIndicator.addWorkspace')}
      </Button>
    </PopoverContent>
  </Popover>
{/if}
