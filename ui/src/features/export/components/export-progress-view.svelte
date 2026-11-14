<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { ClientRenderStatus } from '../hooks/use-client-render.svelte'

  /** Translate lookup, narrowed to the key shape this file uses. */
  type Translate = (key: string) => string

  /** Line under the bar: the phase, or the renderer's own message while preparing. */
  function progressLabel(
    status: ClientRenderStatus,
    progressMessage: string | undefined,
    t: Translate,
  ): string {
    switch (status) {
      case 'preparing':
        return progressMessage ?? t('export.progress.preparing')
      case 'rendering':
        return t('export.progress.rendering')
      case 'encoding':
        return t('export.progress.encoding')
      case 'finalizing':
        return t('export.progress.finalizing')
      default:
        return ''
    }
  }
</script>

<script lang="ts">
  /**
   * Progress step of the export dialog: the bar, the phase (or the renderer's own
   * message), the frame/time counters and the cancel action.
   */
  import Clock from 'lucide-svelte/icons/clock'
  import Film from 'lucide-svelte/icons/film'
  import { Button } from '@/components/ui/button'
  import { Progress } from '@/components/ui/progress'
  import { formatTime } from '@/features/export/utils/export-format'
  import { t } from '$lib/i18n.svelte'

  let {
    progress,
    progressMessage,
    renderedFrames,
    totalFrames,
    status,
    elapsedSeconds,
    onCancel,
  }: {
    progress: number
    progressMessage: string | undefined
    renderedFrames: number | undefined
    totalFrames: number | undefined
    status: ClientRenderStatus
    elapsedSeconds: number
    onCancel: () => void
  } = $props()
</script>

<div class="space-y-4 py-4 overflow-hidden">
  <div class="space-y-4 min-w-0">
    <div class="space-y-2 min-w-0">
      <div class="w-full overflow-hidden">
        <Progress value={progress} class="h-2 w-full" />
      </div>
      <div class="flex items-center justify-between text-sm gap-2">
        <span class="text-muted-foreground truncate">
          {progressLabel(status, progressMessage, t)}
        </span>
        <span class="font-medium tabular-nums flex-shrink-0">{Math.round(progress)}%</span>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-6 gap-y-2">
      {#if renderedFrames !== undefined && totalFrames !== undefined}
        <div class="flex items-center gap-2 text-sm">
          <Film class="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span class="text-muted-foreground">{t('export.progress.framesLabel')}</span>
          <span class="font-medium tabular-nums">{renderedFrames}/{totalFrames}</span>
        </div>
      {/if}
      {#if elapsedSeconds > 0}
        <div class="flex items-center gap-2 text-sm">
          <Clock class="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span class="text-muted-foreground">{t('export.progress.elapsedLabel')}</span>
          <span class="font-medium tabular-nums">{formatTime(elapsedSeconds)}</span>
        </div>
      {/if}
    </div>

    <p class="text-xs text-muted-foreground">{t('export.progress.keepTabOpen')}</p>
  </div>

  <div class="flex justify-end">
    <Button variant="outline" onclick={onCancel}>
      {t('export.progress.cancelExport')}
    </Button>
  </div>
</div>
