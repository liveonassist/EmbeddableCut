<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TimelineSettledContentZoomProvider from './timeline-settled-content-zoom-provider.svelte'
  import PixelsPerSecondProbe from './timeline-settled-content-zoom-provider-probe.harness.svelte'

  let { preferImmediateRendering = false }: { preferImmediateRendering?: boolean } = $props()
</script>

<TimelineSettledContentZoomProvider>
  <PixelsPerSecondProbe {preferImmediateRendering} />
</TimelineSettledContentZoomProvider>
