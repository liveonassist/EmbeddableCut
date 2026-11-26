<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { ExportProgress } from '@/features/project-bundle/types/bundle'

  type ExportStatus = 'idle' | 'saving' | 'exporting' | 'completed' | 'failed'

  function getStageLabel(stage: ExportProgress['stage'], t: (key: string) => string): string {
    switch (stage) {
      case 'collecting':
        return t('projects.bundleExport.stageCollecting')
      case 'hashing':
        return t('projects.bundleExport.stageHashing')
      case 'packaging':
        return t('projects.bundleExport.stagePackaging')
      case 'complete':
        return t('projects.bundleExport.stageComplete')
      default:
        return t('projects.bundleExport.stageProcessing')
    }
  }
</script>

<script lang="ts">
  import type { ExportResult } from '@/features/project-bundle/types/bundle'
  import { untrack } from 'svelte'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import FolderArchive from '@lucide/svelte/icons/folder-archive'
  import Clock from '@lucide/svelte/icons/clock'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import FileVideo from '@lucide/svelte/icons/file-video'
  import Download from '@lucide/svelte/icons/download'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import { Progress } from '@/components/ui/progress'
  import { Alert, AlertDescription } from '@/components/ui/alert'
  import {
    exportProjectBundle,
    exportProjectBundleStreaming,
    downloadBundle,
  } from '@/features/project-bundle/services/bundle-export-service'
  import { formatDuration } from '@/shared/utils/time-utils'
  import { formatBytes } from '@/shared/utils/format-utils'
  import { t } from '$lib/i18n.svelte'
  import type { BundleExportDialogProps } from './types'

  let { open, onClose, projectId, onBeforeExport, fileHandle }: BundleExportDialogProps = $props()

  let status = $state<ExportStatus>('idle')
  let progress = $state.raw<ExportProgress>({ percent: 0, stage: 'collecting' })
  let result = $state.raw<ExportResult | null>(null)
  let error = $state<string | null>(null)
  let startTime = $state<number | null>(null)
  let elapsedSeconds = $state(0)

  const isExporting = $derived(status === 'saving' || status === 'exporting')
  const isCompleted = $derived(status === 'completed')
  const isFailed = $derived(status === 'failed')
  const preventClose = $derived(isExporting || isCompleted)

  // Whether the completed export used streaming (file already on disk)
  const usedStreaming = $derived(isCompleted && !!fileHandle)

  // Track elapsed time
  $effect(() => {
    if (isExporting && !startTime) {
      startTime = Date.now()
    }
    if (!isExporting && !isCompleted) {
      startTime = null
      elapsedSeconds = 0
    }
  })

  $effect(() => {
    const start = startTime
    if (!start || !isExporting) return

    const interval = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - start) / 1000)
    }, 1000)

    return () => clearInterval(interval)
  })

  // Start export when dialog opens
  async function startExport() {
    status = 'saving'
    error = null
    result = null
    progress = { percent: 0, stage: 'collecting' }

    try {
      // Save project first if callback provided
      if (onBeforeExport) {
        await onBeforeExport()
      }

      status = 'exporting'

      let exportResult: ExportResult

      if (fileHandle) {
        // Streaming path: write directly to the pre-acquired file handle
        exportResult = await exportProjectBundleStreaming(projectId, fileHandle, (p) => {
          progress = p
        })
      } else {
        // Fallback: in-memory export
        exportResult = await exportProjectBundle(projectId, (p) => {
          progress = p
        })
      }

      result = exportResult
      status = 'completed'
    } catch (err) {
      error = err instanceof Error ? err.message : t('projects.bundleExport.exportFailed')
      status = 'failed'
    }
  }

  // Auto-start export when dialog opens
  $effect(() => {
    if (open && status === 'idle') {
      untrack(() => void startExport())
    }
  })

  // Reset state when dialog closes
  $effect(() => {
    if (!open) {
      status = 'idle'
      progress = { percent: 0, stage: 'collecting' }
      result = null
      error = null
      startTime = null
      elapsedSeconds = 0
    }
  })

  // Handle download
  function handleDownload() {
    if (result) {
      downloadBundle(result)
    }
  }

  // Prevent closing during export
  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && !isExporting) {
      onClose()
    }
  }
</script>

<Dialog bind:open={() => open, handleOpenChange}>
  <DialogContent
    class="sm:max-w-[425px] overflow-hidden"
    hideCloseButton={preventClose}
    onInteractOutside={(e) => preventClose && e.preventDefault()}
    onEscapeKeydown={(e) => preventClose && e.preventDefault()}
  >
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2">
        {#if isExporting}<Loader2 class="h-5 w-5 animate-spin text-primary" />{/if}
        {#if isCompleted}<CheckCircle2 class="h-5 w-5 text-green-500" />{/if}
        {#if isFailed}<AlertCircle class="h-5 w-5 text-destructive" />{/if}
        {#if status === 'idle'}<FolderArchive class="h-5 w-5" />{/if}
        {#if status === 'saving'}{t('projects.bundleExport.savingProject')}{/if}
        {#if status === 'exporting'}{t('projects.bundleExport.exportingProject')}{/if}
        {#if isCompleted}{t('projects.bundleExport.exportComplete')}{/if}
        {#if isFailed}{t('projects.bundleExport.exportFailed')}{/if}
        {#if status === 'idle'}{t('projects.bundleExport.title')}{/if}
      </DialogTitle>
      <DialogDescription>
        {#if isExporting}{t('projects.bundleExport.creatingBundle')}{/if}
        {#if isCompleted}{usedStreaming
            ? t('projects.bundleExport.bundleSavedDescription')
            : t('projects.bundleExport.bundleReadyDescription')}{/if}
        {#if isFailed}{t('projects.bundleExport.somethingWentWrong')}{/if}
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4 py-4 overflow-hidden">
      <!-- Progress section -->
      {#if isExporting}
        <div class="space-y-4 min-w-0">
          <!-- Progress bar with percentage -->
          <div class="space-y-2 min-w-0">
            <div class="w-full overflow-hidden">
              <Progress value={progress.percent} class="h-2 w-full" />
            </div>
            <div class="flex items-center justify-between text-sm gap-2">
              <span class="text-muted-foreground truncate">
                {status === 'saving'
                  ? t('projects.bundleExport.savingLatestChanges')
                  : getStageLabel(progress.stage, t)}
              </span>
              <span class="font-medium tabular-nums flex-shrink-0">
                {Math.round(progress.percent)}%
              </span>
            </div>
          </div>

          <!-- Current file -->
          {#if progress.currentFile}
            <div class="rounded-md bg-muted/50 px-3 py-2 min-w-0 overflow-hidden">
              <p class="text-xs text-muted-foreground mb-1">
                {t('projects.bundleExport.currentFile')}
              </p>
              <p class="text-sm truncate" title={progress.currentFile}>
                {progress.currentFile}
              </p>
            </div>
          {/if}

          <!-- Elapsed time -->
          {#if elapsedSeconds > 0}
            <div class="flex items-center gap-2 text-sm">
              <Clock class="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span class="text-muted-foreground">
                {t('projects.bundleExport.elapsed')}
              </span>
              <span class="font-medium tabular-nums">{formatDuration(elapsedSeconds)}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Success state -->
      {#if isCompleted && result}
        <div class="space-y-4">
          <Alert class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 class="h-4 w-4 text-green-600" />
            <AlertDescription class="text-green-700 dark:text-green-400">
              {usedStreaming
                ? t('projects.bundleExport.savedSuccess')
                : t('projects.bundleExport.createdSuccess')}
            </AlertDescription>
          </Alert>

          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <FolderArchive class="h-4 w-4 text-muted-foreground" />
              <span class="text-muted-foreground">{t('projects.bundleExport.file')}</span>
              <span class="font-medium truncate">{result.filename}</span>
            </div>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <div class="flex items-center gap-2 text-sm">
                <HardDrive class="h-4 w-4 text-muted-foreground" />
                <span class="text-muted-foreground">{t('projects.bundleExport.size')}</span>
                <span class="font-medium">{formatBytes(result.size)}</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <FileVideo class="h-4 w-4 text-muted-foreground" />
                <span class="text-muted-foreground">
                  {t('projects.bundleExport.mediaFiles')}
                </span>
                <span class="font-medium">{result.mediaCount}</span>
              </div>
              {#if elapsedSeconds > 0}
                <div class="flex items-center gap-2 text-sm">
                  <Clock class="h-4 w-4 text-muted-foreground" />
                  <span class="text-muted-foreground">
                    {t('projects.bundleExport.timeTaken')}
                  </span>
                  <span class="font-medium">{formatDuration(elapsedSeconds)}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Error state -->
      {#if isFailed && error}
        <Alert variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      {/if}
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2">
      {#if isCompleted}
        <Button variant="outline" onclick={onClose}>
          {t('common.close')}
        </Button>
        {#if !usedStreaming}
          <Button onclick={handleDownload}>
            <Download class="mr-2 h-4 w-4" />
            {t('projects.bundleExport.download')}
          </Button>
        {/if}
      {/if}

      {#if isFailed}
        <Button variant="outline" onclick={onClose}>
          {t('common.close')}
        </Button>
      {/if}
    </div>
  </DialogContent>
</Dialog>
