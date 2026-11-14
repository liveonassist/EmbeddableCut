<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TimelinePlayhead from './timeline-playhead.svelte'

  type Layout = 'ruler' | 'container' | 'sibling-ruler' | 'ruler-and-tracks'

  let { layout = 'ruler', maxFrame = 300 }: { layout?: Layout; maxFrame?: number } = $props()

  let ruler = $state<HTMLDivElement | null>(null)
</script>

{#if layout === 'ruler'}
  <div class="timeline-ruler">
    <TimelinePlayhead inRuler {maxFrame} />
  </div>
{:else if layout === 'container'}
  <div class="timeline-container">
    <TimelinePlayhead inRuler {maxFrame} />
  </div>
{:else if layout === 'sibling-ruler'}
  <div class="timeline-container">
    <div bind:this={ruler} class="timeline-ruler"></div>
    <TimelinePlayhead inRuler {maxFrame} coordinateSurface={ruler} />
  </div>
{:else}
  <div class="timeline-container">
    <div class="timeline-ruler">
      <TimelinePlayhead inRuler {maxFrame} />
    </div>
    <div class="timeline-tracks">
      <TimelinePlayhead {maxFrame} />
    </div>
  </div>
{/if}
