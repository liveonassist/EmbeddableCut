<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useMicRecordingStore } from '@/shared/state/mic-recording-store'

  /** Elapsed-time readout — subscribes only to `elapsedMs`. */
  const elapsedMs = select(useMicRecordingStore, (s) => s.elapsedMs)
</script>

<span class="min-w-[3.25rem] text-center font-mono text-xs tabular-nums text-foreground">
  {formatElapsed(elapsedMs.current)}
</span>
