<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CheckCircle2 from 'lucide-svelte/icons/circle-check'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import XCircle from 'lucide-svelte/icons/circle-x'
  import { Button } from '@/components/ui/button'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Progress } from '@/components/ui/progress'
  import { useSubtitleScanProgressStore } from '@/features/media-library/stores/subtitle-scan-progress-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const open = select(useSubtitleScanProgressStore, (s) => s.open)
  const entries = select(useSubtitleScanProgressStore, (s) => s.entries)
  const currentIndex = select(useSubtitleScanProgressStore, (s) => s.currentIndex)
  const summary = select(useSubtitleScanProgressStore, (s) => s.summary)
  const close = () => useSubtitleScanProgressStore.getState().close()

  const isMulti = $derived(entries.current.length > 1)
  const isFinished = $derived(summary.current !== null)
</script>

<Dialog
  bind:open={
    () => open.current,
    (next) => {
      if (!next) close()
    }
  }
>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle>
        {isFinished ? t('media.subtitleScan.titleComplete') : t('media.subtitleScan.titleScanning')}
      </DialogTitle>
      <DialogDescription>
        {isFinished ? t('media.subtitleScan.descComplete') : t('media.subtitleScan.descScanning')}
      </DialogDescription>
    </DialogHeader>

    <div class="flex flex-col gap-3 py-2">
      {#each entries.current as entry, index (`${entry.fileName}-${index}`)}
        {@const fraction =
          entry.totalBytes > 0 ? Math.min(1, entry.bytesRead / entry.totalBytes) : 0}
        {@const percent = Math.round(fraction * 100)}
        {@const isCurrent = index === currentIndex.current && !isFinished}
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2 text-sm">
            {#if entry.status === 'scanning'}
              <Loader2 class="w-3 h-3 shrink-0 animate-spin text-muted-foreground" />
            {/if}
            {#if entry.status === 'done'}
              <CheckCircle2 class="w-3 h-3 shrink-0 text-emerald-500" />
            {/if}
            {#if entry.status === 'error'}
              <XCircle class="w-3 h-3 shrink-0 text-destructive" />
            {/if}
            <span class="truncate flex-1">{entry.fileName}</span>
            <span class="text-xs tabular-nums text-muted-foreground shrink-0">
              {entry.status === 'done'
                ? t('media.subtitleScan.cached')
                : entry.status === 'error'
                  ? t('media.subtitleScan.failed')
                  : `${percent}%`}
            </span>
          </div>
          <Progress value={percent} class="h-2" />
          {#if isCurrent && entry.totalBytes > 0}
            <p class="text-xs text-muted-foreground tabular-nums">
              {formatBytes(entry.bytesRead)} / {formatBytes(entry.totalBytes)}
            </p>
          {/if}
        </div>
      {/each}
      {#if isFinished && summary.current}
        <p class="pt-1 text-sm text-muted-foreground">{summary.current}</p>
      {/if}
    </div>

    <DialogFooter>
      <Button variant={isFinished ? 'default' : 'ghost'} onclick={close}>
        {isFinished
          ? t('common.close')
          : isMulti
            ? t('media.subtitleScan.cancelBatch')
            : t('common.cancel')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
