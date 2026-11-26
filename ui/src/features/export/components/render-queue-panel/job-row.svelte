<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { framesToSeconds } from '@/shared/utils/time-utils'
  import type { RenderJob } from '@/features/export/stores/render-queue-store'

  function formatDuration(frames: number, fps: number): string {
    const seconds = framesToSeconds(frames, fps)
    if (seconds < 60) return `${Math.round(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = Math.round(seconds % 60)
    return `${minutes}m ${remaining}s`
  }

  function getJobProgressText(job: RenderJob, fallback: string): string {
    if (job.progressMessage) return job.progressMessage
    if (job.renderedFrames !== undefined && job.totalFrames !== undefined) {
      return `${job.renderedFrames}/${job.totalFrames}`
    }
    return fallback
  }
</script>

<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import FolderCheck from '@lucide/svelte/icons/folder-check'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import X from '@lucide/svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { Progress } from '@/components/ui/progress'
  import { formatBytes } from '@/features/export/deps/renderer'
  import { useRenderQueueStore } from '@/features/export/stores/render-queue-store'
  import { t } from '$lib/i18n.svelte'
  import StatusIcon from './status-icon.svelte'

  let { job }: { job: RenderJob } = $props()

  const { cancelJob, removeJob, retryJob, moveJob } = useRenderQueueStore.getState()

  const fps = $derived(job.snapshot.fps)
  const formatBits = $derived(
    job.exportMode === 'audio'
      ? job.clientSettings.container.toUpperCase()
      : `${job.clientSettings.container.toUpperCase()} · ${job.clientSettings.resolution.width}×${job.clientSettings.resolution.height}`,
  )
  const rangeText = $derived(
    job.inPoint == null || job.outPoint == null
      ? t('export.renderQueue.wholeProject')
      : `${Math.round(framesToSeconds(job.inPoint, fps))}s–${Math.round(framesToSeconds(job.outPoint, fps))}s`,
  )

  const isQueued = $derived(job.status === 'queued')
  const isRendering = $derived(job.status === 'rendering')
  const isFinished = $derived(
    job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled',
  )
  const progressText = $derived(getJobProgressText(job, t(`export.renderQueue.status.${job.status}`)))
</script>

<div class="rounded-lg border border-border bg-muted/20 p-3">
  <div class="flex items-start gap-2.5">
    <div class="mt-0.5">
      <StatusIcon status={job.status} />
    </div>

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium">{job.name}</div>
      <div class="mt-0.5 text-xs text-muted-foreground">
        {formatBits} · {rangeText} · {formatDuration(job.durationFrames, fps)}
      </div>

      {#if isRendering}
        <div class="mt-2 space-y-1">
          <Progress value={job.progress} class="h-1.5 w-full" />
          <div class="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span class="min-w-0 truncate pr-2" title={job.progressMessage}>
              {progressText}
            </span>
            <span>{Math.round(job.progress)}%</span>
          </div>
        </div>
      {/if}

      {#if job.status === 'completed' && job.savedPath}
        <div class="mt-1 flex items-center gap-1.5 text-xs text-green-500">
          <FolderCheck class="h-3.5 w-3.5 flex-shrink-0" />
          <span class="truncate"
            >{t('export.renderQueue.savedTo', { path: job.savedPath })}{job.fileSize
              ? ` (${formatBytes(job.fileSize)})`
              : ''}</span
          >
        </div>
      {/if}

      {#if job.status === 'failed' && job.error}
        <div class="mt-1 truncate text-xs text-destructive" title={job.error}>
          {job.error}
        </div>
      {/if}
    </div>

    <div class="flex flex-shrink-0 items-center gap-0.5">
      {#if isQueued}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => moveJob(job.id, -1)}
          aria-label={t('export.renderQueue.moveUp')}
          data-tooltip={t('export.renderQueue.moveUp')}
        >
          <ChevronUp class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => moveJob(job.id, 1)}
          aria-label={t('export.renderQueue.moveDown')}
          data-tooltip={t('export.renderQueue.moveDown')}
        >
          <ChevronDown class="h-4 w-4" />
        </Button>
      {/if}

      {#if isFinished && job.status !== 'completed'}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => retryJob(job.id)}
          aria-label={t('export.renderQueue.retry')}
          data-tooltip={t('export.renderQueue.retry')}
        >
          <RotateCcw class="h-4 w-4" />
        </Button>
      {/if}

      {#if isQueued || isRendering}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => cancelJob(job.id)}
          aria-label={t('export.renderQueue.cancel')}
          data-tooltip={t('export.renderQueue.cancel')}
        >
          <X class="h-4 w-4" />
        </Button>
      {/if}

      {#if isFinished}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => removeJob(job.id)}
          aria-label={t('export.renderQueue.remove')}
          data-tooltip={t('export.renderQueue.remove')}
        >
          <Trash2 class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </div>
</div>
