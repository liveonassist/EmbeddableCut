<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TimelineMarkers from './timeline-markers.svelte'

  let {
    scrollContainerMarker = false,
    tracksPlayhead = false,
    track = false,
  }: { scrollContainerMarker?: boolean; tracksPlayhead?: boolean; track?: boolean } = $props()
</script>

<div class="timeline-container" data-timeline-scroll-container={scrollContainerMarker || undefined}>
  <TimelineMarkers duration={10} width={1000} />
  {#if tracksPlayhead}
    <div data-timeline-playhead="tracks"></div>
  {/if}
  {#if track}
    <div data-testid="timeline-track"></div>
  {/if}
</div>
