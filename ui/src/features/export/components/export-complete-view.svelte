<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Complete step of the export dialog: the preview player, the success note, the
   * output size and time, and the download/close actions.
   */
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2'
  import Clock from 'lucide-svelte/icons/clock'
  import Download from 'lucide-svelte/icons/download'
  import HardDrive from 'lucide-svelte/icons/hard-drive'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import { Button } from '@/components/ui/button'
  import { formatFileSize, formatTime } from '@/features/export/utils/export-format'
  import { t } from '$lib/i18n.svelte'
  import ExportPreviewPlayer from './export-preview-player.svelte'
  import type { ExportCompleteViewProps } from './types'

  let {
    mode,
    previewUrl,
    isVideoResult,
    fileSize,
    elapsedSeconds,
    onClose,
    onDownload,
  }: ExportCompleteViewProps = $props()
</script>

<div class="space-y-4 py-4">
  {#if previewUrl}
    <ExportPreviewPlayer src={previewUrl} isVideo={isVideoResult} />
  {/if}

  <Alert class="border-green-900 bg-green-950">
    <CheckCircle2 class="h-4 w-4 text-green-500" />
    <AlertDescription class="text-green-400">
      {mode === 'audio' ? t('export.complete.audioSuccess') : t('export.complete.videoSuccess')}
    </AlertDescription>
  </Alert>

  <div class="flex flex-wrap gap-x-6 gap-y-2">
    {#if fileSize}
      <div class="flex items-center gap-2 text-sm">
        <HardDrive class="h-4 w-4 text-muted-foreground" />
        <span class="text-muted-foreground">{t('export.complete.fileSizeLabel')}</span>
        <span class="font-medium">{formatFileSize(fileSize)}</span>
      </div>
    {/if}
    {#if elapsedSeconds > 0}
      <div class="flex items-center gap-2 text-sm">
        <Clock class="h-4 w-4 text-muted-foreground" />
        <span class="text-muted-foreground">{t('export.complete.timeTakenLabel')}</span>
        <span class="font-medium">{formatTime(elapsedSeconds)}</span>
      </div>
    {/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onClose}>
      {t('common.close')}
    </Button>
    <Button onclick={onDownload}>
      <Download class="mr-2 h-4 w-4" />
      {t('export.complete.download')}
    </Button>
  </div>
</div>
