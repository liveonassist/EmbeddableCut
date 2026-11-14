<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import Loader2 from 'lucide-svelte/icons/loader-2'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import { untrack } from 'svelte'
  import { Button } from '@/components/ui/button'
  import { createLogger } from '@/shared/logging/logger'
  import { listExportFiles, workspaceFolderName, type ExportFileEntry } from '@/infrastructure/storage'
  import { useRenderQueueStore } from '@/features/export/stores/render-queue-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import ExportFileRow from './export-file-row.svelte'

  const log = createLogger('Export')

  let { projectId }: { projectId: string } = $props()

  let entries = $state.raw<ExportFileEntry[] | null>(null)
  let loading = $state(false)
  // Re-list whenever a job finishes saving a new file.
  const completedCount = select(
    useRenderQueueStore,
    (s) => s.jobs.filter((j) => j.status === 'completed').length,
  )
  const folder = workspaceFolderName()

  const load = async () => {
    loading = true
    try {
      entries = await listExportFiles(projectId)
    } catch (err) {
      log.error('Failed to list exports', err)
      entries = []
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void projectId
    void completedCount.current
    untrack(() => void load())
  })
</script>

<div class="space-y-3">
  <!-- Tell users where the files actually live (browsers can't open the OS folder). -->
  <div
    class="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
  >
    <FolderOpen class="mt-0.5 h-4 w-4 flex-shrink-0" />
    <span>
      {folder
        ? t('export.renderQueue.exportsLocation', { folder })
        : t('export.renderQueue.exportsLocationGeneric')}
    </span>
  </div>

  <div class="flex items-center justify-end">
    <Button variant="ghost" size="sm" class="gap-1.5" onclick={() => void load()}>
      <RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
      {t('export.renderQueue.refresh')}
    </Button>
  </div>

  <div class="max-h-[50vh] overflow-y-auto pr-1">
    {#if entries === null}
      <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    {:else if entries.length === 0}
      <div class="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <FolderOpen class="h-6 w-6" />
        {t('export.renderQueue.exportsEmpty')}
      </div>
    {:else}
      <div class="space-y-2">
        {#each entries as entry (entry.path.join('/'))}
          <ExportFileRow {entry} onChanged={() => void load()} />
        {/each}
      </div>
    {/if}
  </div>
</div>
