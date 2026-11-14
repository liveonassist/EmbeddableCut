<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Extension lines showing value beyond keyframe range.
   * Draws flat lines before first keyframe and after last keyframe.
   */
  import type { GraphKeyframePoint, GraphPadding, GraphViewport } from '../types'

  let {
    points,
    viewport,
    padding,
  }: {
    points: GraphKeyframePoint[]
    viewport: GraphViewport
    padding: GraphPadding
  } = $props()

  // Sort points by frame (toSorted for immutability)
  const sortedPoints = $derived(points.toSorted((a, b) => a.keyframe.frame - b.keyframe.frame))
  const firstPoint = $derived(sortedPoints[0])
  const lastPoint = $derived(sortedPoints[sortedPoints.length - 1])

  const graphLeft = $derived(padding.left)
  const graphRight = $derived(viewport.width - padding.right)
</script>

{#if firstPoint && lastPoint}
  <g class="graph-extension-lines" style:pointer-events="none">
    <!-- Line before first keyframe -->
    {#if firstPoint.x > graphLeft}
      <line
        x1={graphLeft}
        y1={firstPoint.y}
        x2={firstPoint.x}
        y2={firstPoint.y}
        stroke="currentColor"
        stroke-width={1.5}
        stroke-dasharray="4 4"
        stroke-opacity={0.3}
      />
    {/if}
    <!-- Line after last keyframe -->
    {#if lastPoint.x < graphRight}
      <line
        x1={lastPoint.x}
        y1={lastPoint.y}
        x2={graphRight}
        y2={lastPoint.y}
        stroke="currentColor"
        stroke-width={1.5}
        stroke-dasharray="4 4"
        stroke-opacity={0.3}
      />
    {/if}
  </g>
{/if}
