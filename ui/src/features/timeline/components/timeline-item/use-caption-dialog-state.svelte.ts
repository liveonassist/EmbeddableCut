// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { select } from '$lib/store.svelte'
import { i18n } from '@/i18n'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { selectConsolidatableCaptionClipIds } from '@/features/timeline/stores/items-store-indexes'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import {
  importMediaLibraryService,
  useEmbeddedSubtitlePickerStore,
} from '@/features/timeline/deps/media-library-service'

function isEmbeddedSubtitleContainer(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase()
  return (
    mimeType === 'video/x-matroska' ||
    mimeType === 'video/matroska' ||
    mimeType === 'video/webm' ||
    name.endsWith('.mkv') ||
    name.endsWith('.webm')
  )
}

interface UseCaptionDialogStateParams {
  item: TimelineItemType
  isBroken: boolean
  linkedItemsForCaptionOwnership: TimelineItemType[]
}

type TranscriptProgress = NonNullable<
  ReturnType<typeof useMediaLibraryStore.getState>['transcriptProgress'] extends Map<
    string,
    infer V
  >
    ? V
    : never
>

export interface CaptionDialogState {
  readonly canManageCaptions: boolean
  readonly canExtractEmbeddedSubtitles: boolean
  readonly hasConsolidatablePerCueCaptions: boolean
  readonly mediaHasTranscript: boolean
  readonly transcriptStatus: string
  readonly transcriptProgress: TranscriptProgress | null
  readonly mediaFileName: string
  readonly dialogOpen: boolean
  openDialog: () => void
  setDialogOpen: (next: boolean) => void
  setDialogError: (message: string | null) => void
  readonly dialogError: string | null
  markCaptionStarted: () => void
  markCaptionEnded: () => void
  markCaptionStopRequested: () => void
  readonly handleExtractEmbeddedSubtitles: (() => Promise<void>) | undefined
  readonly handleConsolidateCaptionsToSegment: (() => Promise<void>) | undefined
}

export function useCaptionDialogState(
  params: () => UseCaptionDialogStateParams,
): CaptionDialogState {
  const itemId = $derived(params().item.id)
  const itemMediaId = $derived(params().item.mediaId)
  const itemType = $derived(params().item.type)
  const itemIsReversed = $derived(params().item.isReversed)
  const isBroken = $derived(params().isBroken)
  const linkedItemsForCaptionOwnership = $derived(params().linkedItemsForCaptionOwnership)

  const transcriptStatusSelection = $derived(
    select(useMediaLibraryStore, (s) =>
      itemMediaId ? (s.transcriptStatus.get(itemMediaId) ?? 'idle') : 'idle',
    ),
  )
  const transcriptProgressSelection = $derived(
    select(useMediaLibraryStore, (s) =>
      itemMediaId ? (s.transcriptProgress.get(itemMediaId) ?? null) : null,
    ),
  )
  const mediaForItemSelection = $derived(
    select(useMediaLibraryStore, (s) => (itemMediaId ? (s.mediaById[itemMediaId] ?? null) : null)),
  )
  const transcriptStatus = $derived(transcriptStatusSelection.current)
  const transcriptProgress = $derived(transcriptProgressSelection.current)
  const mediaForItem = $derived(mediaForItemSelection.current)
  const mediaFileName = $derived(mediaForItem?.fileName ?? '')
  let dialogOpen = $state(false)
  let dialogError = $state<string | null>(null)
  const mediaHasTranscript = $derived(transcriptStatus === 'ready')
  let captionStarted = false
  let captionStopRequested = false

  const captionIsActive = $derived(
    transcriptStatus === 'queued' || transcriptStatus === 'transcribing',
  )
  $effect(() => {
    void [captionIsActive, dialogError]
    untrack(() => {
      if (captionStarted && !captionIsActive) {
        captionStarted = false
        const keepOpen = captionStopRequested || dialogError !== null
        captionStopRequested = false
        dialogOpen = dialogOpen && keepOpen
      }
    })
  })

  const linkedVideoCaptionOwner = $derived.by(() => {
    if (itemType !== 'audio' || !itemMediaId) {
      return null
    }
    return (
      linkedItemsForCaptionOwnership.find(
        (linkedItem) =>
          linkedItem.id !== itemId &&
          linkedItem.type === 'video' &&
          linkedItem.mediaId === itemMediaId,
      ) ?? null
    )
  })

  const canManageCaptions = $derived(
    !!itemMediaId &&
      !isBroken &&
      itemIsReversed !== true &&
      (itemType === 'video' || (itemType === 'audio' && linkedVideoCaptionOwner === null)),
  )

  const canExtractEmbeddedSubtitles = $derived(
    !!(
      mediaForItem &&
      !isBroken &&
      itemIsReversed !== true &&
      isEmbeddedSubtitleContainer(mediaForItem.fileName, mediaForItem.mimeType)
    ),
  )

  async function handleExtractEmbeddedSubtitles() {
    const media = mediaForItem
    if (!media) return
    const mediaStore = useMediaLibraryStore.getState()
    try {
      const handle = media.fileHandle
      if (media.storageType === 'handle' && handle) {
        const granted =
          (await handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const)) ===
          'granted'
        if (!granted) {
          mediaStore.showNotification?.({
            type: 'error',
            message: i18n.t('media.card.subtitlesNeedPermission', { name: media.fileName }),
          })
          return
        }
        const blob = await handle.getFile()
        useEmbeddedSubtitlePickerStore.getState().open(media, blob)
        return
      }
      const { mediaLibraryService } = await importMediaLibraryService()
      const blob = await mediaLibraryService.getMediaFile(media.id)
      if (!blob) {
        mediaStore.showNotification?.({
          type: 'error',
          message: `The editor could not load "${media.fileName}".`,
        })
        return
      }
      useEmbeddedSubtitlePickerStore.getState().open(media, blob)
    } catch (error) {
      mediaStore.showNotification?.({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : `Failed to open "${media.fileName}" for subtitle extraction.`,
      })
    }
  }

  const hasConsolidatablePerCueCaptionsSelection = $derived(
    select(
      useItemsStore,
      (s) => itemIsReversed !== true && selectConsolidatableCaptionClipIds(s).has(itemId),
    ),
  )
  const hasConsolidatablePerCueCaptions = $derived(hasConsolidatablePerCueCaptionsSelection.current)

  async function handleConsolidateCaptionsToSegment() {
    const clipId = itemId
    const mediaStore = useMediaLibraryStore.getState()
    try {
      const { subtitleSidecarService } =
        await import('@/features/timeline/deps/subtitle-sidecar-service')
      const result = subtitleSidecarService.consolidatePerCueCaptionsToSegments({
        clipId,
      })
      mediaStore.showNotification?.({
        type: 'success',
        message:
          result.segmentsCreated > 0
            ? `Consolidated ${result.cuesConsolidated} caption${result.cuesConsolidated === 1 ? '' : 's'} into ${result.segmentsCreated} segment${result.segmentsCreated === 1 ? '' : 's'}.`
            : 'No per-cue captions found for this clip.',
      })
    } catch (error) {
      mediaStore.showNotification?.({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to consolidate captions to segment.',
      })
    }
  }

  function openDialog() {
    captionStopRequested = false
    dialogError = null
    dialogOpen = true
  }

  function setDialogOpen(next: boolean) {
    dialogOpen = next
  }

  function setDialogError(message: string | null) {
    dialogError = message
  }

  function markCaptionStarted() {
    captionStarted = true
    captionStopRequested = false
  }

  function markCaptionEnded() {
    captionStarted = false
  }

  function markCaptionStopRequested() {
    captionStopRequested = true
  }

  return {
    get canManageCaptions() {
      return canManageCaptions
    },
    get canExtractEmbeddedSubtitles() {
      return canExtractEmbeddedSubtitles
    },
    get hasConsolidatablePerCueCaptions() {
      return hasConsolidatablePerCueCaptions
    },
    get mediaHasTranscript() {
      return mediaHasTranscript
    },
    get transcriptStatus() {
      return transcriptStatus
    },
    get transcriptProgress() {
      return transcriptProgress
    },
    get mediaFileName() {
      return mediaFileName
    },
    get dialogOpen() {
      return dialogOpen
    },
    openDialog,
    setDialogOpen,
    setDialogError,
    get dialogError() {
      return dialogError
    },
    markCaptionStarted,
    markCaptionEnded,
    markCaptionStopRequested,
    get handleExtractEmbeddedSubtitles() {
      return canExtractEmbeddedSubtitles ? handleExtractEmbeddedSubtitles : undefined
    },
    get handleConsolidateCaptionsToSegment() {
      return hasConsolidatablePerCueCaptions ? handleConsolidateCaptionsToSegment : undefined
    },
  }
}
