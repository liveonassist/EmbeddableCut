// SPDX-License-Identifier: MIT

import { createLogger } from '@/shared/logging/logger'
import {
  deleteCompoundClips,
  getCompoundClipDeletionImpact,
  getMediaDeletionImpact,
  removeProjectItems,
  saveTimeline,
  useSequencesStore,
} from '@/features/media-library/deps/timeline-stores'
import { i18n, t } from '$lib/i18n.svelte'

const logger = createLogger('MediaLibrary')

interface PendingLibraryDeletion {
  mediaIds: string[]
  compositionIds: string[]
}

interface UseMediaLibraryDeletionParams {
  container: HTMLDivElement | null
  selectedMediaIds: string[]
  selectedCompositionIds: string[]
  selectedAssetCount: number
  currentProjectId: string | null
  clearSelection: () => void
  deleteMediaBatch: (mediaIds: string[]) => Promise<void>
}

/**
 * Deletion flow for the media library: pending-deletion + dialog state, the
 * Delete-hotkey and focus-scope tracking, the timeline-impact computations
 * (how many timeline clips reference the assets), and the confirm/cancel
 * handlers that remove timeline references, media, and compound clips.
 */
export function useMediaLibraryDeletion(params: () => UseMediaLibraryDeletionParams) {
  let isFocused = false
  let showDeleteDialog = $state(false)
  let pendingDeletion = $state.raw<PendingLibraryDeletion>({
    mediaIds: [],
    compositionIds: [],
  })

  const deleteAssetCount = $derived(
    pendingDeletion.mediaIds.length + pendingDeletion.compositionIds.length,
  )
  const isMediaOnlyDeletion = $derived(
    pendingDeletion.mediaIds.length > 0 && pendingDeletion.compositionIds.length === 0,
  )

  // Track focus scope for the Delete hotkey. Selection itself is only cleared
  // by explicit user action (empty-area click or marquee), never by focus
  // changes — otherwise selection leaks away when the user clicks the timeline
  // or another panel.
  $effect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.composedPath()[0] as Node | undefined
      isFocused = !!(target && params().container?.contains(target))
    }

    document.addEventListener('mousedown', handleMouseDown, true)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
    }
  })

  // Handle Delete key to delete selected items
  $effect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle Delete key
      if (event.key !== 'Delete') return

      // Don't trigger if media library is not focused
      if (!isFocused) return

      const { selectedAssetCount, selectedMediaIds, selectedCompositionIds } = params()
      // Don't trigger if no items selected
      if (selectedAssetCount === 0) return

      // Don't trigger if dialog is already open
      if (showDeleteDialog) return

      // Don't trigger if user is typing in an input or textarea
      const target = (event.composedPath()[0] ?? event.target) as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Prevent default behavior and trigger delete
      event.preventDefault()
      pendingDeletion = {
        mediaIds: [...selectedMediaIds],
        compositionIds: [...selectedCompositionIds],
      }
      showDeleteDialog = true
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  const deleteSummary = $derived.by(() => {
    const parts: string[] = []
    if (pendingDeletion.mediaIds.length > 0) {
      parts.push(t('media.library.mediaItemsCount', { count: pendingDeletion.mediaIds.length }))
    }
    if (pendingDeletion.compositionIds.length > 0) {
      // Sequences and compound clips are the same primitive; only the label
      // differs. Split so the dialog says "sequence" for top-level tabs.
      const isTopLevelSequence = useSequencesStore.getState().isTopLevelSequence
      let sequenceCount = 0
      let compoundClipCount = 0
      for (const id of pendingDeletion.compositionIds) {
        if (isTopLevelSequence(id)) sequenceCount++
        else compoundClipCount++
      }
      if (sequenceCount > 0) {
        parts.push(t('media.library.sequencesCount', { count: sequenceCount }))
      }
      if (compoundClipCount > 0) {
        parts.push(t('media.library.compoundClipsCount', { count: compoundClipCount }))
      }
    }
    // Locale-aware conjunction ("A, B, and C") rather than repeating a joiner,
    // which reads awkwardly for three-or-more parts.
    return new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(parts)
  })

  const affectedMediaImpact = $derived(
    pendingDeletion.mediaIds.length > 0
      ? getMediaDeletionImpact(pendingDeletion.mediaIds)
      : { itemIds: [], rootReferenceCount: 0, nestedReferenceCount: 0, totalReferenceCount: 0 },
  )
  const compoundClipDeleteImpact = $derived(
    pendingDeletion.compositionIds.length > 0
      ? getCompoundClipDeletionImpact(pendingDeletion.compositionIds)
      : { rootReferenceCount: 0, nestedReferenceCount: 0, totalReferenceCount: 0 },
  )
  const affectedAssetInstanceCount = $derived(
    affectedMediaImpact.totalReferenceCount + compoundClipDeleteImpact.totalReferenceCount,
  )

  const handleDeleteSelected = () => {
    const { selectedAssetCount, selectedMediaIds, selectedCompositionIds } = params()
    if (selectedAssetCount === 0) return
    // Capture the IDs BEFORE opening dialog (selection may be cleared by click outside)
    pendingDeletion = {
      mediaIds: [...selectedMediaIds],
      compositionIds: [...selectedCompositionIds],
    }
    showDeleteDialog = true
  }

  const handleConfirmDelete = async () => {
    showDeleteDialog = false
    const pending = pendingDeletion
    const impact = affectedMediaImpact
    const { currentProjectId, deleteMediaBatch, clearSelection } = params()
    try {
      // First remove timeline items that reference selected library assets
      if (impact.itemIds.length > 0) {
        const removedTimelineReferences = removeProjectItems(impact.itemIds)
        if (removedTimelineReferences && currentProjectId) {
          await saveTimeline(currentProjectId)
        }
      }

      if (pending.mediaIds.length > 0) {
        await deleteMediaBatch(pending.mediaIds)
      }

      if (pending.compositionIds.length > 0) {
        deleteCompoundClips(pending.compositionIds)
      }

      clearSelection()
      pendingDeletion = { mediaIds: [], compositionIds: [] }
    } catch (error) {
      logger.error('Delete failed:', error)
      pendingDeletion = { mediaIds: [], compositionIds: [] }
    }
  }

  return {
    get showDeleteDialog() {
      return showDeleteDialog
    },
    setShowDeleteDialog(open: boolean) {
      showDeleteDialog = open
    },
    get pendingDeletion() {
      return pendingDeletion
    },
    setPendingDeletion(next: PendingLibraryDeletion) {
      pendingDeletion = next
    },
    get deleteAssetCount() {
      return deleteAssetCount
    },
    get isMediaOnlyDeletion() {
      return isMediaOnlyDeletion
    },
    get deleteSummary() {
      return deleteSummary
    },
    get affectedAssetInstanceCount() {
      return affectedAssetInstanceCount
    },
    handleDeleteSelected,
    handleConfirmDelete,
  }
}
