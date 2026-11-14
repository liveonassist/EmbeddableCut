<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * All curves for a set of keyframes.
   */
  import type { GraphKeyframePoint } from '../types'
  import GraphCurve from './graph-curve.svelte'

  let {
    points,
    selectedKeyframeIds,
    previewBezierConfigs,
    strokeColor,
  }: {
    points: GraphKeyframePoint[]
    selectedKeyframeIds?: Set<string>
    previewBezierConfigs?: Record<string, { x1: number; y1: number; x2: number; y2: number }> | null
    strokeColor?: string
  } = $props()

  // Sort points by frame (toSorted for immutability)
  const sortedPoints = $derived(points.toSorted((a, b) => a.keyframe.frame - b.keyframe.frame))

  const segments = $derived(
    sortedPoints.slice(0, -1).flatMap((startPoint, index) => {
      const endPoint = sortedPoints[index + 1]
      if (!endPoint) return []
      const previewBezier = previewBezierConfigs?.[startPoint.keyframe.id]
      return [
        {
          key: `${startPoint.keyframe.id}-${endPoint.keyframe.id}`,
          startPoint,
          endPoint,
          easingConfig: previewBezier
            ? { type: 'cubic-bezier' as const, bezier: previewBezier }
            : startPoint.keyframe.easingConfig || { type: startPoint.keyframe.easing },
          isSelected:
            selectedKeyframeIds?.has(startPoint.keyframe.id) ||
            selectedKeyframeIds?.has(endPoint.keyframe.id),
        },
      ]
    }),
  )
</script>

{#if sortedPoints.length >= 2}
  <g class="graph-curves" style:pointer-events="none">
    {#each segments as segment (segment.key)}
      <GraphCurve
        startPoint={segment.startPoint}
        endPoint={segment.endPoint}
        easingConfig={segment.easingConfig}
        isSelected={segment.isSelected}
        {strokeColor}
      />
    {/each}
  </g>
{/if}
