<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { createLogger } from '@/shared/logging/logger'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import Link2Off from 'lucide-svelte/icons/link-2-off'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import X from 'lucide-svelte/icons/x'
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert'
  import Search from 'lucide-svelte/icons/search'
  import Folder from 'lucide-svelte/icons/folder'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { importMediaLibraryService } from '@/features/media-library/services/media-library-service-loader'
  import { useProjectStore } from '@/features/media-library/deps/projects'
  import { showMediaFilePicker } from '@/features/media-library/utils/media-file-picker'
  import { getProjectBrokenMediaInfo } from '@/features/media-library/utils/broken-media'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'

  const logger = createLogger('MissingMediaDialog')

  const showDialog = select(useMediaLibraryStore, (s) => s.showMissingMediaDialog)
  const brokenMediaInfo = select(useMediaLibraryStore, (s) => s.brokenMediaInfo)
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)

  // Project folder for smart relinking
  const currentProject = select(useProjectStore, (s) => s.currentProject)
  const projectRootFolderHandle = $derived(currentProject.current?.rootFolderHandle)
  const projectRootFolderName = $derived(currentProject.current?.rootFolderName)

  let relinking = $state<string | null>(null)
  let locatingFolder = $state(false)
  let scanningProjectFolder = $state(false)
  let relinkedIds = $state.raw<Set<string>>(new Set())
  let autoScanned = $state(false)

  const brokenItems = $derived(
    getProjectBrokenMediaInfo(brokenMediaInfo.current, mediaById.current).filter(
      (item) => !relinkedIds.has(item.mediaId),
    ),
  )
  type BrokenItem = (typeof brokenItems)[number]

  const permissionDenied = $derived(brokenItems.filter((b) => b.errorType === 'permission_denied'))
  const fileMissing = $derived(brokenItems.filter((b) => b.errorType === 'file_missing'))

  // Helper to scan a directory for matching files
  async function scanDirectoryForMatches(
    dirHandle: FileSystemDirectoryHandle,
    itemsToMatch: BrokenItem[],
  ): Promise<Array<{ mediaId: string; handle: FileSystemFileHandle }>> {
    const foundRelinks: Array<{
      mediaId: string
      handle: FileSystemFileHandle
    }> = []

    // Scan directory for matching filenames
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const matchingBroken = itemsToMatch.find(
          (b) => b.fileName.toLowerCase() === entry.name.toLowerCase(),
        )
        if (matchingBroken) {
          foundRelinks.push({
            mediaId: matchingBroken.mediaId,
            handle: entry as FileSystemFileHandle,
          })
        }
      }
    }

    return foundRelinks
  }

  // Auto-scan project folder when dialog opens
  async function handleScanProjectFolder() {
    const folder = projectRootFolderHandle
    if (!folder || brokenItems.length === 0) return

    scanningProjectFolder = true
    try {
      // Request permission if needed
      const permission = await folder.queryPermission({ mode: 'read' })
      if (permission !== 'granted') {
        const newPermission = await folder.requestPermission({ mode: 'read' })
        if (newPermission !== 'granted') {
          logger.warn('Permission denied for project folder')
          return
        }
      }

      const foundRelinks = await scanDirectoryForMatches(folder, brokenItems)

      if (foundRelinks.length > 0) {
        const { success } = await useMediaLibraryStore.getState().relinkMediaBatch(foundRelinks)
        relinkedIds = new Set([...relinkedIds, ...success])
        logger.info(`Auto-relinked ${success.length} files from project folder`)
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        logger.error('Project folder scan failed:', error)
      }
    } finally {
      scanningProjectFolder = false
    }
  }

  // Auto-scan project folder when dialog opens (only once per dialog open)
  $effect(() => {
    if (showDialog.current && projectRootFolderHandle && brokenItems.length > 0 && !autoScanned) {
      autoScanned = true
      untrack(() => void handleScanProjectFolder())
    }
  })

  // Reset auto-scan flag when dialog closes
  $effect(() => {
    if (!showDialog.current) {
      autoScanned = false
    }
  })

  async function handleRestoreSingle(item: BrokenItem) {
    relinking = item.mediaId
    try {
      if (item.errorType === 'permission_denied') {
        const { mediaLibraryService } = await importMediaLibraryService()
        const granted = await mediaLibraryService.requestPermission(item.mediaId)
        if (granted) {
          useMediaLibraryStore.getState().markMediaHealthy(item.mediaId)
          relinkedIds = new Set([...relinkedIds, item.mediaId])
        }
        return
      }

      const handles = await showMediaFilePicker({ multiple: false })

      const handle = handles[0]
      if (!handle) return

      const success = await useMediaLibraryStore.getState().relinkMedia(item.mediaId, handle)
      if (success) {
        relinkedIds = new Set([...relinkedIds, item.mediaId])
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        logger.error('Media restore failed:', error)
      }
    } finally {
      relinking = null
    }
  }

  async function handleLocateFolder() {
    locatingFolder = true
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      })

      const foundRelinks = await scanDirectoryForMatches(dirHandle, brokenItems)

      if (foundRelinks.length > 0) {
        const { success } = await useMediaLibraryStore.getState().relinkMediaBatch(foundRelinks)
        relinkedIds = new Set([...relinkedIds, ...success])
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        logger.error('Folder scan failed:', error)
      }
    } finally {
      locatingFolder = false
    }
  }

  function handleDismissAll() {
    // Dismiss the warning only. The media remains broken so export preflight and
    // health summaries still protect the project until the files are actually relinked.
    useMediaLibraryStore
      .getState()
      .dismissMissingMediaWarnings(brokenItems.map((item) => item.mediaId))
    relinkedIds = new Set()
  }

  function handleClose() {
    relinkedIds = new Set()
    useMediaLibraryStore.getState().closeMissingMediaDialog()
  }

  // Auto-close if no more broken items.
  $effect(() => {
    if (showDialog.current && brokenItems.length === 0) {
      untrack(handleClose)
    }
  })
</script>

{#if !(showDialog.current && brokenItems.length === 0)}
  <Dialog bind:open={() => showDialog.current, (open) => !open && handleClose()}>
    <DialogContent class="sm:max-w-[600px] max-h-[80vh]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Link2Off class="w-5 h-5 text-destructive" />
          {t('media.missingMedia.title')}
        </DialogTitle>
        <DialogDescription>
          {t('media.missingMedia.description', { count: brokenItems.length })}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Summary badges -->
        <div class="flex gap-2 text-xs">
          {#if permissionDenied.length > 0}
            <div
              class="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded"
            >
              <AlertTriangle class="w-3 h-3 text-yellow-500" />
              <span>
                {t('media.missingMedia.needPermission', { count: permissionDenied.length })}
              </span>
            </div>
          {/if}
          {#if fileMissing.length > 0}
            <div
              class="flex items-center gap-1 px-2 py-1 bg-destructive/10 border border-destructive/30 rounded"
            >
              <X class="w-3 h-3 text-destructive" />
              <span>{t('media.missingMedia.notFound', { count: fileMissing.length })}</span>
            </div>
          {/if}
        </div>

        <!-- Project folder scan button (if project folder is set) -->
        {#if projectRootFolderHandle}
          <Button
            variant="default"
            class="w-full"
            onclick={handleScanProjectFolder}
            disabled={scanningProjectFolder}
          >
            {#if scanningProjectFolder}
              <RefreshCw class="w-4 h-4 mr-2 animate-spin" />
            {:else}
              <Folder class="w-4 h-4 mr-2" />
            {/if}
            {t('media.missingMedia.scanProjectFolder', { name: projectRootFolderName ?? '' })}
          </Button>
        {/if}

        <!-- Locate Folder button -->
        <Button
          variant="outline"
          class="w-full"
          onclick={handleLocateFolder}
          disabled={locatingFolder}
        >
          {#if locatingFolder}
            <RefreshCw class="w-4 h-4 mr-2 animate-spin" />
          {:else}
            <FolderOpen class="w-4 h-4 mr-2" />
          {/if}
          {projectRootFolderHandle
            ? t('media.missingMedia.browseAnotherFolder')
            : t('media.missingMedia.locateFolder')}
        </Button>

        <!-- List of broken media -->
        <div class="max-h-[300px] overflow-y-auto space-y-2 pr-2">
          {#each brokenItems as item (item.mediaId)}
            <div
              class="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border"
            >
              <div
                class="p-1.5 rounded {item.errorType === 'permission_denied'
                  ? 'bg-yellow-500/20'
                  : 'bg-destructive/20'}"
              >
                {#if item.errorType === 'permission_denied'}
                  <AlertTriangle class="w-4 h-4 text-yellow-500" />
                {:else}
                  <X class="w-4 h-4 text-destructive" />
                {/if}
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{item.fileName}</p>
                <p class="text-xs text-muted-foreground">
                  {item.errorType === 'permission_denied'
                    ? t('media.missingMedia.permissionExpired')
                    : t('media.missingMedia.fileMovedOrDeleted')}
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onclick={() => handleRestoreSingle(item)}
                disabled={relinking === item.mediaId}
              >
                {#if relinking === item.mediaId}
                  <RefreshCw class="w-3 h-3 animate-spin" />
                {:else}
                  <Search class="w-3 h-3 mr-1" />
                  {item.errorType === 'permission_denied'
                    ? t('media.missingMedia.grantAccess')
                    : t('media.missingMedia.locate')}
                {/if}
              </Button>
            </div>
          {/each}
        </div>
      </div>

      <DialogFooter class="flex-col sm:flex-row gap-2">
        <Button variant="ghost" onclick={handleDismissAll} class="text-muted-foreground">
          {t('media.missingMedia.workOffline')}
        </Button>
        <Button variant="outline" onclick={handleClose}>
          {t('common.close')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}
