<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useMicRecordingStore } from '@/shared/state/mic-recording-store'

  /** Live input-level meter — subscribes only to `level` so the toolbar body doesn't re-render. */
  const level = select(useMicRecordingStore, (s) => s.level)
  // Gentle perceptual curve so quiet speech is still visible.
  const width = $derived(Math.min(100, Math.round(Math.pow(level.current, 0.6) * 130)))
</script>

<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
  <div
    class="h-full rounded-full transition-[width] duration-75"
    style:width="{width}%"
    style:background-color={width > 85 ? 'var(--color-destructive)' : 'var(--color-primary)'}
  ></div>
</div>
