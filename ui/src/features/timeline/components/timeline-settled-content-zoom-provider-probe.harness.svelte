<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useTimelineContentPixelsPerSecond } from '../contexts/timeline-zoom-context.svelte'

  let { preferImmediateRendering = false }: { preferImmediateRendering?: boolean } = $props()
  const pixelsPerSecond = useTimelineContentPixelsPerSecond(() => preferImmediateRendering)
</script>

<span data-testid="pixels-per-second">{pixelsPerSecond.current}</span>
