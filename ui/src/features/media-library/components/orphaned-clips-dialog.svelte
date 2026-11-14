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
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import Search from 'lucide-svelte/icons/search'
  import Video from 'lucide-svelte/icons/video'
  import Music from 'lucide-svelte/icons/music'
  import Image from 'lucide-svelte/icons/image'
  import Wand2 from 'lucide-svelte/icons/wand-sparkles'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { MediaPickerDialog } from './media-picker-dialog'
  import { autoMatchOrphanedClips } from '@/features/media-library/deps/timeline-utils'
  import type { OrphanedClipInfo } from '@/features/media-library/types'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'

  const logger = createLogger('OrphanedClipsDialog')

  const itemTypeIcons = {
    video: Video,
    audio: Music,
    image: Image,
  }

  const showDialog = select(useMediaLibraryStore, (s) => s.showOrphanedClipsDialog)
  const orphanedClips = select(useMediaLibraryStore, (s) => s.orphanedClips)
  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)

  let relinking = $state<string | null>(null)
  let autoMatching = $state(false)
  let relinkedIds = $state.raw<Set<string>>(new Set())
  let pickerOpen = $state(false)
  let selectedOrphan = $state.raw<OrphanedClipInfo | null>(null)

  const remainingOrphans = $derived(orphanedClips.current.filter((o) => !relinkedIds.has(o.itemId)))

  async function handleAutoMatch() {
    autoMatching = true
    try {
      const matches = autoMatchOrphanedClips(remainingOrphans, mediaItems.current)

      if (matches.size === 0) {
        logger.info('No auto-matches found')
        return
      }

      // Relink all matches
      for (const [itemId, mediaId] of matches) {
        relinking = itemId
        const success = await useMediaLibraryStore.getState().relinkOrphanedClip(itemId, mediaId)
        if (success) {
          relinkedIds = new Set([...relinkedIds, itemId])
        }
      }

      logger.info(`Auto-matched ${matches.size} clip(s)`)
    } catch (error) {
      logger.error('Auto-match failed:', error)
    } finally {
      autoMatching = false
      relinking = null
    }
  }

  function handleSelectMedia(orphan: OrphanedClipInfo) {
    selectedOrphan = orphan
    pickerOpen = true
  }

  async function handleMediaSelected(mediaId: string) {
    const orphan = selectedOrphan
    if (!orphan) return

    pickerOpen = false
    relinking = orphan.itemId

    try {
      const success = await useMediaLibraryStore
        .getState()
        .relinkOrphanedClip(orphan.itemId, mediaId)
      if (success) {
        relinkedIds = new Set([...relinkedIds, orphan.itemId])
      }
    } catch (error) {
      logger.error('Relink failed:', error)
    } finally {
      relinking = null
      selectedOrphan = null
    }
  }

  function handleRemoveSingle(itemId: string) {
    useMediaLibraryStore.getState().removeOrphanedClips([itemId])
    relinkedIds = new Set([...relinkedIds, itemId])
  }

  function handleRemoveAll() {
    const itemIds = remainingOrphans.map((o) => o.itemId)
    useMediaLibraryStore.getState().removeOrphanedClips(itemIds)
    relinkedIds = new Set()
    useMediaLibraryStore.getState().closeOrphanedClipsDialog()
  }

  function handleDismiss() {
    // Keep clips as broken in timeline, just close the dialog
    relinkedIds = new Set()
    useMediaLibraryStore.getState().closeOrphanedClipsDialog()
  }

  function handleClose() {
    relinkedIds = new Set()
    useMediaLibraryStore.getState().closeOrphanedClipsDialog()
  }

  // Auto-close if no more orphaned clips
  $effect(() => {
    if (showDialog.current && remainingOrphans.length === 0) {
      untrack(handleClose)
    }
  })
</script>

{#if showDialog.current && remainingOrphans.length > 0}
  <Dialog bind:open={() => showDialog.current, (open) => !open && handleClose()}>
    <DialogContent class="max-h-[80vh] w-[min(92vw,960px)] max-w-[960px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Link2Off class="w-5 h-5 text-destructive" />
          {t('media.orphanedClips.title')}
        </DialogTitle>
        <DialogDescription>
          {t('media.orphanedClips.description', { count: remainingOrphans.length })}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Auto-match button -->
        <Button
          variant="outline"
          class="w-full"
          onclick={handleAutoMatch}
          disabled={autoMatching || mediaItems.current.length === 0}
        >
          {#if autoMatching}
            <RefreshCw class="w-4 h-4 mr-2 animate-spin" />
          {:else}
            <Wand2 class="w-4 h-4 mr-2" />
          {/if}
          {t('media.orphanedClips.autoMatch')}
        </Button>

        <!-- List of orphaned clips -->
        <div class="max-h-[300px] overflow-y-auto space-y-2 pr-2">
          {#each remainingOrphans as orphan (orphan.itemId)}
            {@const IconComponent = itemTypeIcons[orphan.itemType]}
            <div
              class="flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3"
            >
              <div class="p-1.5 rounded bg-destructive/20">
                <IconComponent class="w-4 h-4 text-destructive" />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium leading-snug break-words">
                  {orphan.fileName}
                </p>
                <p class="text-xs text-muted-foreground">
                  {t(`media.orphanedClips.clipMediaDeleted.${orphan.itemType}`)}
                </p>
              </div>

              <div class="flex shrink-0 gap-1 self-center">
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => handleSelectMedia(orphan)}
                  disabled={relinking === orphan.itemId}
                >
                  {#if relinking === orphan.itemId}
                    <RefreshCw class="w-3 h-3 animate-spin" />
                  {:else}
                    <Search class="w-3 h-3 mr-1" />
                    {t('media.orphanedClips.select')}
                  {/if}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => handleRemoveSingle(orphan.itemId)}
                  class="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 class="w-3 h-3" />
                </Button>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <DialogFooter class="flex-col sm:flex-row gap-2">
        <Button variant="destructive" onclick={handleRemoveAll} class="order-2 sm:order-1">
          <Trash2 class="w-4 h-4 mr-2" />
          {t('media.orphanedClips.removeAll')}
        </Button>
        <div class="flex-1"></div>
        <Button
          variant="ghost"
          onclick={handleDismiss}
          class="text-muted-foreground order-1 sm:order-2"
        >
          {t('media.orphanedClips.keepAsBroken')}
        </Button>
        <Button variant="outline" onclick={handleClose} class="order-3">
          {t('common.close')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Media picker for manual selection -->
  <MediaPickerDialog
    open={pickerOpen}
    onClose={() => {
      pickerOpen = false
      selectedOrphan = null
    }}
    onSelect={handleMediaSelected}
    filterType={selectedOrphan?.itemType}
    title={t('media.orphanedClips.selectReplacement', { name: selectedOrphan?.fileName ?? '' })}
  />
{/if}
