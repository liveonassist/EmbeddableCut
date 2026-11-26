<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import Upload from '@lucide/svelte/icons/upload'
  import Link from '@lucide/svelte/icons/link'
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert'
  import { createLogger } from '@/shared/logging/logger'
  import { GridMediaCard, ListMediaCard } from '../media-card'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { useFilteredMediaItems } from '@/features/media-library/stores/use-filtered-media-items.svelte'
  import {
    getMediaDeletionImpact,
    removeProjectItems,
    editRefusedDuring,
    saveTimeline,
  } from '@/features/media-library/deps/timeline-stores'
  import { useEditorStore } from '@/shared/state/editor'
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
  import { GRID_MIN_SIZE_PX, GRID_GAP_BY_SIZE } from '../media-grid-constants'
  import {
    showMediaFilePicker,
    getSupportedMediaFormatLabels,
  } from '@/features/media-library/utils/media-file-picker'
  import { cn } from '@/shared/ui/cn'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import type { MediaGridProps } from './types'

  const logger = createLogger('MediaGrid')

  let {
    onMediaSelect,
    layout,
    itemSize = 3,
    items,
    localImport = true,
    onAddFromUrl,
  }: MediaGridProps & {
    layout: 'grid' | 'list'
  } = $props()

  let showDeleteDialog = $state(false)
  let mediaIdsToDelete = $state.raw<string[]>([])
  let lastSelectedId: string | null = null

  const allFilteredItems = useFilteredMediaItems()
  const filteredItems = $derived(items ?? allFilteredItems.current)
  const isLoading = select(useMediaLibraryStore, (s) => s.isLoading)
  const selectedMediaIds = select(useMediaLibraryStore, (s) => s.selectedMediaIds)
  const brokenMediaIds = select(useMediaLibraryStore, (s) => s.brokenMediaIds)
  const selectedMediaIdSet = $derived(new Set(selectedMediaIds.current))
  const brokenMediaIdSet = $derived(new Set(brokenMediaIds.current))

  const affectedMediaImpact = $derived(
    mediaIdsToDelete.length > 0
      ? getMediaDeletionImpact(mediaIdsToDelete)
      : { itemIds: [], rootReferenceCount: 0, nestedReferenceCount: 0, totalReferenceCount: 0 },
  )

  function handleCardSelect(mediaId: string, event?: MouseEvent) {
    const currentFilteredItems = filteredItems
    const mediaStore = useMediaLibraryStore.getState()

    // Shift click: select range from last selected item to this item
    if (event?.shiftKey && lastSelectedId) {
      const lastIndex = currentFilteredItems.findIndex((item) => item.id === lastSelectedId)
      const currentIndex = currentFilteredItems.findIndex((item) => item.id === mediaId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex)
        const endIndex = Math.max(lastIndex, currentIndex)
        const rangeIds = currentFilteredItems.slice(startIndex, endIndex + 1).map((item) => item.id)

        // If Ctrl/Cmd is also held, add range to existing selection
        if (event.ctrlKey || event.metaKey) {
          const newSelection = [...new Set([...mediaStore.selectedMediaIds, ...rangeIds])]
          mediaStore.setSelection({
            mediaIds: newSelection,
            compositionIds: mediaStore.selectedCompositionIds,
          })
        } else {
          // Replace selection with range
          mediaStore.setSelection({ mediaIds: rangeIds, compositionIds: [] })
        }
      }
    } else if (event?.ctrlKey || event?.metaKey) {
      // Ctrl/Cmd click: toggle selection (add/remove from current selection)
      mediaStore.toggleMediaSelection(mediaId)
      lastSelectedId = mediaId
    } else {
      // Normal click: select only this item (clear others)
      mediaStore.setSelection({ mediaIds: [mediaId], compositionIds: [] })
      lastSelectedId = mediaId
    }
    onMediaSelect?.(mediaId)
  }

  // Show delete confirmation dialog (called from MediaCard)
  function handleCardDelete(mediaIds: string[]) {
    if (mediaIds.length === 0) return
    mediaIdsToDelete = mediaIds
    showDeleteDialog = true
  }

  // Actually delete after confirmation
  async function handleConfirmDelete() {
    // The dialog's close clears the pending ids before the awaits below finish.
    const ids = mediaIdsToDelete
    const impact = affectedMediaImpact
    if (ids.length === 0) return

    showDeleteDialog = false
    try {
      // First remove timeline items that reference this media
      if (impact.itemIds.length > 0) {
        let removedTimelineReferences = false
        // Media whose clips the host keeps on the timeline stays in the library.
        const refused = editRefusedDuring(() => {
          removedTimelineReferences = removeProjectItems(impact.itemIds)
        })
        if (refused) return
        const currentProjectId = useMediaLibraryStore.getState().currentProjectId
        if (removedTimelineReferences && currentProjectId) {
          await saveTimeline(currentProjectId)
        }
      }

      // Then delete the media from the library
      const store = useMediaLibraryStore.getState()
      if (ids.length === 1) {
        await store.deleteMedia(ids[0]!)
      } else {
        await store.deleteMediaBatch(ids)
      }
    } catch (error) {
      logger.error('Failed to delete media:', error)
      // Error is already set in store
    } finally {
      mediaIdsToDelete = []
    }
  }

  function handleCancelDelete() {
    showDeleteDialog = false
    mediaIdsToDelete = []
  }

  // Handle relinking a broken media file
  async function handleRelink(mediaId: string) {
    try {
      const handles = await showMediaFilePicker({ multiple: false })

      const handle = handles[0]
      if (!handle) return

      await useMediaLibraryStore.getState().relinkMedia(mediaId, handle)
    } catch (error) {
      // User cancelled - ignore AbortError
      if (error instanceof Error && error.name !== 'AbortError') {
        logger.error('Failed to relink media:', error)
      }
    }
  }

  // Handle click on empty state to open file picker
  async function handleEmptyStateClick() {
    try {
      await useMediaLibraryStore.getState().importMedia()
    } catch (error) {
      logger.error('Import failed:', error)
    }
  }

  const cardHandlersById = $derived(
    new Map(
      filteredItems.map((media) => [
        media.id,
        {
          onSelect: (event: MouseEvent) => handleCardSelect(media.id, event),
          onDoubleClick: () => useEditorStore.getState().setSourcePreviewMediaId(media.id),
          onDelete: (mediaIds: string[]) => handleCardDelete(mediaIds),
          onRelink: () => {
            void handleRelink(media.id)
          },
        },
      ]),
    ),
  )
</script>

<!-- Main container with dropzone functionality -->
<div>
  <!-- Content -->
  {#if !items && isLoading.current}
    <div class="flex items-center justify-center py-24">
      <div class="flex flex-col items-center gap-4">
        <div class="relative">
          <Loader2 class="w-12 h-12 animate-spin text-primary" />
          <div
            class="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary/20 animate-pulse"
          ></div>
        </div>
        <div class="text-center">
          <p class="text-sm font-mono text-foreground tracking-wider mb-1">
            {t('media.grid.loadingTitle')}
          </p>
          <p class="text-xs text-muted-foreground font-mono">
            {t('media.grid.loadingSubtitle')}
          </p>
        </div>
      </div>
    </div>
  {:else if !items && filteredItems.length === 0 && !localImport}
    <!-- The host turned local media off: offer URL media, or nothing to import. -->
    <div class="flex items-center justify-center py-24">
      {#if onAddFromUrl}
        <button
          type="button"
          class="text-center max-w-md rounded-xl border border-dashed border-border/80 p-6 transition-colors hover:border-primary/60 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onclick={onAddFromUrl}
        >
          <div
            class="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-secondary transition-colors"
          >
            <Link class="w-10 h-10 text-muted-foreground" />
          </div>
          <p class="text-base font-bold text-foreground mb-2 tracking-wide">
            {t('media.grid.emptyTitle')}
          </p>
          <p class="text-sm text-muted-foreground font-light mb-4">
            {t('media.urlMedia.streamDescription')}
          </p>
          <span
            class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {t('media.urlMedia.streamTitle')}
          </span>
        </button>
      {:else}
        <div class="text-center max-w-md rounded-xl border border-dashed border-border/80 p-6">
          <div
            class="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-secondary"
          >
            <Link class="w-10 h-10 text-muted-foreground" />
          </div>
          <p class="text-base font-bold text-foreground tracking-wide">
            {t('media.grid.emptyTitle')}
          </p>
        </div>
      {/if}
    </div>
  {:else if !items && filteredItems.length === 0}
    <div class="flex items-center justify-center py-24">
      <button
        type="button"
        class="text-center max-w-md rounded-xl border border-dashed border-border/80 p-6 transition-colors hover:border-primary/60 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onclick={handleEmptyStateClick}
      >
        <div
          class="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-secondary transition-colors"
        >
          <Upload class="w-10 h-10 text-muted-foreground" />
        </div>
        <p class="text-base font-bold text-foreground mb-2 tracking-wide">
          {t('media.grid.emptyTitle')}
        </p>
        <p class="text-sm text-muted-foreground font-light mb-4">
          {t('media.grid.emptyHint')}
        </p>
        <span
          class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground mb-4"
        >
          {t('media.grid.importButton')}
        </span>
        <div class="flex flex-wrap justify-center gap-2">
          {#each getSupportedMediaFormatLabels() as label (label)}
            <span
              class="px-2 py-0.5 bg-secondary border border-border rounded text-xs font-mono text-muted-foreground"
            >
              {label}
            </span>
          {/each}
        </div>
      </button>
    </div>
  {:else}
    <div
      class={layout === 'grid'
        ? `grid ${GRID_GAP_BY_SIZE[itemSize] ?? GRID_GAP_BY_SIZE[3]}`
        : 'space-y-1'}
      style:grid-template-columns={layout === 'grid'
        ? `repeat(auto-fill, minmax(min(${GRID_MIN_SIZE_PX[itemSize] ?? GRID_MIN_SIZE_PX[3]}px, 100%), 1fr))`
        : undefined}
    >
      {#each filteredItems as media (media.id)}
        {@const handlers = cardHandlersById.get(media.id)}
        <div data-media-id={media.id}>
          {#if layout === 'grid'}
            <GridMediaCard
              {media}
              selected={selectedMediaIdSet.has(media.id)}
              isBroken={brokenMediaIdSet.has(media.id)}
              onSelect={handlers?.onSelect}
              onDoubleClick={handlers?.onDoubleClick}
              onDelete={handlers?.onDelete}
              onRelink={handlers?.onRelink}
            />
          {:else}
            <ListMediaCard
              {media}
              selected={selectedMediaIdSet.has(media.id)}
              isBroken={brokenMediaIdSet.has(media.id)}
              onSelect={handlers?.onSelect}
              onDoubleClick={handlers?.onDoubleClick}
              onDelete={handlers?.onDelete}
              onRelink={handlers?.onRelink}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Delete confirmation dialog with timeline warning -->
  <AlertDialog
    bind:open={
      () => showDeleteDialog,
      (open) => {
        if (!open) handleCancelDelete()
      }
    }
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {mediaIdsToDelete.length > 1
            ? t('media.deleteDialog.titleMultiple', { count: mediaIdsToDelete.length })
            : t('media.deleteDialog.titleSingle')}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {#snippet child({ props })}
            <div {...props} class={cn(props.class as string | undefined, 'space-y-3')}>
              <p>
                {mediaIdsToDelete.length > 1
                  ? t('media.deleteDialog.bodyMultiple', { count: mediaIdsToDelete.length })
                  : t('media.deleteDialog.bodySingle', {
                      name: filteredItems.find((m) => m.id === mediaIdsToDelete[0])?.fileName ?? '',
                    })}
              </p>
              {#if affectedMediaImpact.totalReferenceCount > 0}
                <div
                  class="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md"
                >
                  <AlertTriangle class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div class="text-sm text-yellow-600 dark:text-yellow-400">
                    <p class="font-medium">{t('media.deleteDialog.timelineClipsRemoved')}</p>
                    <p class="text-xs mt-1 text-yellow-600/80 dark:text-yellow-400/80">
                      {t('media.deleteDialog.timelineClipsDetail', {
                        count: affectedMediaImpact.totalReferenceCount,
                      })}
                    </p>
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onclick={handleCancelDelete}>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onclick={handleConfirmDelete}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {affectedMediaImpact.totalReferenceCount > 0
            ? t('media.deleteDialog.confirmWithClips', {
                count: affectedMediaImpact.totalReferenceCount,
              })
            : t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
