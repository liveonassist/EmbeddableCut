<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('TrashSection')

  type ConfirmTarget =
    | { kind: 'single'; id: string; name: string }
    | { kind: 'empty'; count: number }
    | null
</script>

<script lang="ts">
  /**
   * Trash section on the Projects page.
   *
   * Shows a collapsible panel listing every trashed project (soft-deleted via
   * `softDeleteProject`). Each row offers Restore and Delete forever. A top
   * "Empty trash" action permanently deletes every entry in one go.
   *
   * Data flow:
   *   - Trashed projects live on disk as `projects/{id}/.freecut-trashed.json`
   *     markers; the authoritative list comes from `listTrashedProjects()`.
   *   - The live projects store doesn't track trashed items, so this
   *     component self-manages the list.
   *   - Whenever the live projects array changes (soft-delete, restore,
   *     create, delete), we re-fetch the trash list. This covers the Undo
   *     toast path — it calls `restoreProject`, which mutates the live list,
   *     which triggers our refresh.
   *   - Permanent-delete and Empty trash do NOT touch the live list, so
   *     those handlers refresh manually.
   *
   * Auto-hide: when the trash is empty the section collapses to nothing —
   * zero visual noise for the common case. A count badge in the header makes
   * the feature discoverable when something's there.
   */
  import { toast } from 'svelte-sonner'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
  import { Button } from '@/components/ui/button'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import { listTrashedProjects, type TrashedProjectEntry } from '@/infrastructure/storage'
  import { useProjectStore } from '@/features/projects/stores/project-store'
  import { formatRelativeTime } from '@/features/projects/utils/project-helpers'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { usePermanentlyDeleteProject, useRestoreProject } from '../hooks/use-project-actions.svelte'

  let open = $state(false)
  let entries = $state.raw<TrashedProjectEntry[]>([])
  let loaded = $state(false)
  let busyId = $state<string | null>(null)
  let isEmptying = $state(false)
  let confirm = $state.raw<ConfirmTarget>(null)

  const restoreProject = useRestoreProject()
  const permanentlyDeleteProject = usePermanentlyDeleteProject()

  // Subscribe to the live projects array so any soft-delete / restore /
  // create / delete (which mutate the live list) triggers a trash refresh.
  // Zustand returns a new reference on every update we care about here.
  const projects = select(useProjectStore, (s) => s.projects)

  async function refresh() {
    try {
      const next = await listTrashedProjects()
      entries = next
      loaded = true
    } catch (error) {
      logger.warn('Failed to list trashed projects', error)
      entries = []
      loaded = true
    }
  }

  $effect(() => {
    void projects.current
    void refresh()
  })

  async function handleRestore(entry: TrashedProjectEntry) {
    busyId = entry.id
    const result = await restoreProject(entry.id)
    busyId = null
    if (result.success) {
      toast.success(t('projects.toasts.restored', { name: entry.marker.originalName }))
      // `restoreProject` updates the live projects list which cascades
      // to our refresh via the effect on `projects`. No manual call needed.
    } else {
      toast.error(t('projects.toasts.restoreFailed'), { description: result.error ?? undefined })
    }
  }

  async function handleDeleteForever(entry: TrashedProjectEntry) {
    busyId = entry.id
    const result = await permanentlyDeleteProject(entry.id)
    busyId = null
    if (result.success) {
      toast.success(t('projects.trash.deletedForever', { name: entry.marker.originalName }))
      // Permanent delete doesn't touch the live projects list, so we
      // refresh the trash list by hand.
      await refresh()
    } else {
      toast.error(t('projects.toasts.deleteFailed'), { description: result.error ?? undefined })
    }
  }

  async function handleEmptyTrash() {
    // Snapshot the current list so we don't race with refresh() mid-loop.
    const snapshot = entries
    isEmptying = true
    let succeeded = 0
    const failures: string[] = []
    for (const entry of snapshot) {
      const result = await permanentlyDeleteProject(entry.id)
      if (result.success) succeeded++
      else failures.push(entry.marker.originalName)
    }
    isEmptying = false
    await refresh()

    if (failures.length === 0) {
      toast.success(t('projects.trash.emptiedTrash', { count: succeeded }))
    } else {
      toast.error(t('projects.trash.emptiedTrashWithFailures', { count: failures.length }), {
        description: t('projects.trash.couldNotDelete', {
          names: `${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`,
        }),
      })
    }
  }

  async function confirmAction() {
    const target = confirm
    if (!target) return
    if (target.kind === 'single') {
      const entry = entries.find((e) => e.id === target.id)
      confirm = null
      if (entry) await handleDeleteForever(entry)
    } else {
      confirm = null
      await handleEmptyTrash()
    }
  }
</script>

<!--
  Render nothing until we've finished the first read, and nothing when
  trash is empty. Both cases save a row of visual noise on the Projects
  page for the common "no trash" state.
-->
{#if loaded && entries.length > 0}
  <div class="mt-12" data-testid="trash-section" data-no-marquee>
    <Collapsible bind:open>
      <div class="flex items-center justify-between gap-2 mb-3">
        <CollapsibleTrigger
          data-testid="trash-toggle"
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ChevronRight class={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Trash2 class="w-4 h-4" />
          <span class="font-medium">{t('projects.trash.title')}</span>
          <span
            class="text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-foreground/70"
          >
            {entries.length}
          </span>
          {#if !open}
            <span class="text-xs text-muted-foreground/70 ml-1">
              {t('projects.trash.autoDeletes')}
            </span>
          {/if}
        </CollapsibleTrigger>
        {#if open}
          <Button
            data-testid="trash-empty-all"
            variant="outline"
            size="sm"
            class="text-destructive hover:text-destructive gap-2"
            disabled={isEmptying}
            onclick={() => (confirm = { kind: 'empty', count: entries.length })}
          >
            <Trash2 class="w-3.5 h-3.5" />
            {isEmptying ? t('projects.trash.emptying') : t('projects.trash.emptyTrash')}
          </Button>
        {/if}
      </div>

      <CollapsibleContent>
        <!-- Radix renders a closed collapsible's children not at all; bits-ui only hides them. -->
        {#if open}
          <div class="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {#each entries as entry (entry.id)}
              {@const isBusy = busyId === entry.id}
              <div class="flex items-center gap-3 p-3 panel-bg" data-testid={`trash-row-${entry.id}`}>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">{entry.marker.originalName}</div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    {t('projects.trash.deletedAt', {
                      time: formatRelativeTime(entry.marker.deletedAt),
                    })}
                  </div>
                </div>
                <Button
                  data-testid={`trash-restore-${entry.id}`}
                  variant="ghost"
                  size="sm"
                  class="gap-2"
                  disabled={isBusy || isEmptying}
                  onclick={() => void handleRestore(entry)}
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  {t('projects.trash.restore')}
                </Button>
                <Button
                  data-testid={`trash-delete-${entry.id}`}
                  variant="ghost"
                  size="sm"
                  class="gap-2 text-destructive hover:text-destructive"
                  disabled={isBusy || isEmptying}
                  onclick={() =>
                    (confirm = {
                      kind: 'single',
                      id: entry.id,
                      name: entry.marker.originalName,
                    })}
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  {t('projects.trash.deleteForever')}
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      </CollapsibleContent>
    </Collapsible>

    <AlertDialog
      open={confirm !== null}
      onOpenChange={(next) => {
        if (!next) confirm = null
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle class="flex items-center gap-2">
            <AlertTriangle class="h-5 w-5 text-destructive" />
            {confirm?.kind === 'empty'
              ? t('projects.trash.emptyTrashConfirmTitle')
              : t('projects.trash.deleteForeverConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.kind === 'empty'
              ? t('projects.trash.emptyTrashConfirmDescription', { count: confirm.count })
              : confirm?.kind === 'single'
                ? t('projects.trash.deleteForeverConfirmDescription', { name: confirm.name })
                : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="trash-confirm-action"
            onclick={() => void confirmAction()}
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirm?.kind === 'empty'
              ? t('projects.trash.emptyTrash')
              : t('projects.trash.deleteForever')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
{/if}
