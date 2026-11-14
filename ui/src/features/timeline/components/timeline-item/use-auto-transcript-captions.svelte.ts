// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { mediaTranscriptionService } from '@/features/timeline/deps/media-transcription-service'
import type { CaptionDialogState } from './use-caption-dialog-state.svelte'

interface UseAutoTranscriptCaptionsParams {
  item: TimelineItemType
  caption: CaptionDialogState
  hasGeneratedCaptions: boolean
  isBroken: boolean
}

/**
 * Auto-enables transcript-backed captions for a video/audio clip the first time
 * its media has a transcript and no captions yet. Runs once per item+media pair
 * (tracked by a plain variable) and stays silent on failure — the explicit
 * "Generate Captions" action remains the user-facing fallback.
 */
export function useAutoTranscriptCaptions(params: () => UseAutoTranscriptCaptionsParams): void {
  const canManageCaptions = $derived(params().caption.canManageCaptions)
  const mediaHasTranscript = $derived(params().caption.mediaHasTranscript)
  const hasGeneratedCaptions = $derived(params().hasGeneratedCaptions)
  const isBroken = $derived(params().isBroken)
  const itemId = $derived(params().item.id)
  const itemMediaId = $derived(params().item.mediaId)
  const itemType = $derived(params().item.type)
  let attempt: string | null = null

  $effect(() => {
    void [
      canManageCaptions,
      mediaHasTranscript,
      hasGeneratedCaptions,
      isBroken,
      itemId,
      itemMediaId,
      itemType,
    ]
    untrack(() => {
      if (
        !canManageCaptions ||
        !mediaHasTranscript ||
        hasGeneratedCaptions ||
        isBroken ||
        (itemType !== 'video' && itemType !== 'audio') ||
        !itemMediaId
      ) {
        return
      }

      const attemptKey = `${itemId}:${itemMediaId}`
      if (attempt === attemptKey) {
        return
      }
      attempt = attemptKey

      void mediaTranscriptionService
        .enableTranscriptCaptions(itemMediaId, {
          clipIds: [itemId],
          replaceExisting: false,
          selectUpdatedClips: false,
        })
        .catch(() => {
          // Keep this silent: the explicit Generate Captions action remains the user-facing fallback.
        })
    })
  })
}
