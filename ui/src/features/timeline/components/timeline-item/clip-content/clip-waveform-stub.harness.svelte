<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let {
    pixelsPerSecond,
    liveTimelineZoom,
  }: { pixelsPerSecond: number; liveTimelineZoom?: boolean } = $props()
</script>

<div
  data-testid="clip-waveform"
  data-pps={String(pixelsPerSecond)}
  data-live-timeline-zoom={String(!!liveTimelineZoom)}
></div>
