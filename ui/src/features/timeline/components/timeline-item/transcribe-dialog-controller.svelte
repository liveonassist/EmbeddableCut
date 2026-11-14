<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cancelMediaTranscriptionJob } from '@/features/timeline/deps/media-transcription-service'
  import {
    TranscribeDialog,
    type TranscribeDialogValues,
  } from '@/features/timeline/deps/transcribe-dialog'
  import {
    getTranscriptionProgressDetail,
    getTranscriptionProgressLabel,
    isIndeterminateTranscriptionProgress,
  } from '@/shared/utils/transcription-progress'
  import {
    isTranscriptionOutOfMemoryError,
    TRANSCRIPTION_OOM_HINT,
  } from '@/shared/utils/transcription-cancellation'
  import type { CaptionDialogState } from './use-caption-dialog-state.svelte'

  interface TranscribeDialogControllerProps {
    itemMediaId: string | undefined
    hasGeneratedCaptions: boolean
    caption: CaptionDialogState
    onGenerate: (
      values: TranscribeDialogValues,
      hasExistingCaptions: boolean,
      onError?: (error: unknown) => void,
    ) => void
  }

  let { itemMediaId, hasGeneratedCaptions, caption, onGenerate }: TranscribeDialogControllerProps =
    $props()

  const transcriptProgress = $derived(caption.transcriptProgress)
  const transcriptStatus = $derived(caption.transcriptStatus)

  function handleStart(values: TranscribeDialogValues) {
    caption.markCaptionStarted()
    caption.setDialogError(null)
    const handleError = (error: unknown) => {
      caption.markCaptionEnded()
      const baseMessage = error instanceof Error ? error.message : 'Failed to generate captions'
      caption.setDialogError(
        isTranscriptionOutOfMemoryError(error) ? TRANSCRIPTION_OOM_HINT : baseMessage,
      )
    }
    try {
      onGenerate(values, hasGeneratedCaptions, handleError)
      caption.setDialogOpen(false)
    } catch (error) {
      handleError(error)
    }
  }
</script>

{#if caption.canManageCaptions && itemMediaId}
  {@const mediaId = itemMediaId}
  <!-- The bar tracks the *current stage*, not the whole job. Overall percent (which the
       collapsed media-library bar still uses, having room for only one number) would crawl
       across the first tenth of the track for a multi-minute download and read as a hang. -->
  <TranscribeDialog
    open={caption.dialogOpen}
    onOpenChange={(next: boolean) => {
      if (!next) caption.setDialogError(null)
      caption.setDialogOpen(next)
    }}
    fileName={caption.mediaFileName}
    hasTranscript={caption.mediaHasTranscript}
    isRunning={transcriptStatus === 'queued' || transcriptStatus === 'transcribing'}
    progressPercent={transcriptProgress ? Math.round(transcriptProgress.progress * 100) : null}
    progressIndeterminate={transcriptProgress
      ? isIndeterminateTranscriptionProgress(transcriptProgress)
      : false}
    progressLabel={transcriptProgress
      ? getTranscriptionProgressLabel(transcriptProgress)
      : 'Transcribing...'}
    progressDetail={transcriptProgress ? getTranscriptionProgressDetail(transcriptProgress) : null}
    errorMessage={caption.dialogError}
    onStart={handleStart}
    onCancel={() => {
      caption.markCaptionStopRequested()
      cancelMediaTranscriptionJob(mediaId)
    }}
  />
{/if}
