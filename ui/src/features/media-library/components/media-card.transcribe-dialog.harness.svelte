<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Stands in for TranscribeDialog in media-card tests: just its start and stop buttons.
  import type { TranscribeDialogValues } from './transcribe-dialog-types'

  let {
    open,
    onStart,
    onCancel,
  }: {
    open: boolean
    onStart: (values: TranscribeDialogValues) => void
    onCancel: () => void
  } = $props()
</script>

{#if open}
  <div data-testid="transcribe-dialog">
    <button
      type="button"
      onclick={() =>
        onStart({
          model: 'whisper-base',
          quantization: 'hybrid',
          language: '',
        } as TranscribeDialogValues)}
    >
      Start Transcription
    </button>
    <button type="button" onclick={() => onCancel()}>Stop Transcription</button>
  </div>
{/if}
