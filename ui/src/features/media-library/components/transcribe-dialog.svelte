<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'

  interface TranscribeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    fileName: string
    hasTranscript: boolean
    isRunning: boolean
    progressPercent: number | null
    progressIndeterminate?: boolean
    progressLabel: string
    progressDetail?: string | null
    errorMessage?: string | null
    onStart: (values: {
      model: MediaTranscriptModel
      quantization: MediaTranscriptQuantization
      language: string
    }) => void
    onCancel: () => void
  }

  let { open }: TranscribeDialogProps = $props()
</script>

{#if open}<div></div>{/if}
