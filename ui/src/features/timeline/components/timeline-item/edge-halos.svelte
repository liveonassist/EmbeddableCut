<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { CONSTRAINED_COLORS, FREE_COLORS, type ActiveEdgeState } from './trim-constants'

  function getFramePositionStyle(frame: number): string {
    return `calc(${frame} * var(--timeline-percent-per-frame, 0%))`
  }

  interface EdgeHalosProps {
    activeEdges: ActiveEdgeState | null
    visualLeftFrame: number
    visualWidthFrames: number
  }

  let { activeEdges, visualLeftFrame, visualWidthFrames }: EdgeHalosProps = $props()

  const startColors = $derived(
    activeEdges?.constrainedEdge === 'start' || activeEdges?.constrainedEdge === 'both'
      ? CONSTRAINED_COLORS
      : FREE_COLORS,
  )
  const endColors = $derived(
    activeEdges?.constrainedEdge === 'end' || activeEdges?.constrainedEdge === 'both'
      ? CONSTRAINED_COLORS
      : FREE_COLORS,
  )
</script>

{#if activeEdges}
  <div
    class="absolute inset-y-0 pointer-events-none"
    style:left={getFramePositionStyle(visualLeftFrame)}
    style:width={getFramePositionStyle(visualWidthFrames)}
    style:z-index="2"
  >
    {#if activeEdges.start}
      <div
        class="absolute inset-y-0 left-0"
        style:width="2px"
        style:background={startColors.edge}
        style:box-shadow={startColors.glow}
      ></div>
      <div
        class="absolute inset-y-0"
        style:left="2px"
        style:width="8px"
        style:background="linear-gradient(to right, {startColors.fade}, transparent)"
      ></div>
    {/if}
    {#if activeEdges.end}
      <div
        class="absolute inset-y-0 right-0"
        style:width="2px"
        style:background={endColors.edge}
        style:box-shadow={endColors.glow}
      ></div>
      <div
        class="absolute inset-y-0"
        style:right="2px"
        style:width="8px"
        style:background="linear-gradient(to left, {endColors.fade}, transparent)"
      ></div>
    {/if}
  </div>
{/if}
