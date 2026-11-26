<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * The render queue: pause/clear controls plus the job list. Presentational —
   * no dialog chrome — so it can be embedded in the Exports dialog's Queue tab.
   */
  import Pause from '@lucide/svelte/icons/pause'
  import Play from '@lucide/svelte/icons/play'
  import { Button } from '@/components/ui/button'
  import { useRenderQueueStore } from '@/features/export/stores/render-queue-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import JobRow from './job-row.svelte'

  const jobs = select(useRenderQueueStore, (s) => s.jobs)
  const isPaused = select(useRenderQueueStore, (s) => s.isPaused)
  const { setPaused, clearFinished, clearAll } = useRenderQueueStore.getState()

  const hasFinished = $derived(
    jobs.current.some((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'),
  )
  const hasActive = $derived(jobs.current.some((j) => j.status === 'queued' || j.status === 'rendering'))
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-2">
    <Button
      variant="outline"
      size="sm"
      class="gap-1.5"
      onclick={() => setPaused(!isPaused.current)}
      disabled={!hasActive}
    >
      {#if isPaused.current}
        <Play class="h-4 w-4" />
      {:else}
        <Pause class="h-4 w-4" />
      {/if}
      {isPaused.current ? t('export.renderQueue.resume') : t('export.renderQueue.pause')}
    </Button>
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="sm" onclick={clearFinished} disabled={!hasFinished}>
        {t('export.renderQueue.clearFinished')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive"
        onclick={clearAll}
        disabled={jobs.current.length === 0}
      >
        {t('export.renderQueue.clearAll')}
      </Button>
    </div>
  </div>

  {#if isPaused.current && jobs.current.some((j) => j.status === 'queued')}
    <p class="text-xs text-amber-500">{t('export.renderQueue.paused')}</p>
  {/if}

  <div class="max-h-[55vh] overflow-y-auto pr-1">
    {#if jobs.current.length === 0}
      <div class="py-10 text-center text-sm text-muted-foreground">
        {t('export.renderQueue.empty')}
      </div>
    {:else}
      <div class="space-y-2">
        {#each jobs.current as job (job.id)}
          <JobRow {job} />
        {/each}
      </div>
    {/if}
  </div>
</div>
