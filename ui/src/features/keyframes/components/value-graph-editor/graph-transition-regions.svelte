<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Graph Transition Regions Component
   * Renders semi-transparent overlay regions on the keyframe graph
   * to indicate frame ranges where keyframes cannot be placed (transition regions).
   */
  import type { GraphViewport } from './types'
  import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'

  interface GraphTransitionRegionsProps {
    /** Viewport dimensions and range */
    viewport: GraphViewport
    /** Padding inside the graph area */
    padding: { top: number; right: number; bottom: number; left: number }
    /** Blocked frame ranges (from transitions) */
    blockedRanges: BlockedFrameRange[]
  }

  let { viewport, padding, blockedRanges }: GraphTransitionRegionsProps = $props()

  // Calculate usable area
  const graphLeft = $derived(padding.left)
  const graphTop = $derived(padding.top)
  const graphWidth = $derived(viewport.width - padding.left - padding.right)
  const graphHeight = $derived(viewport.height - padding.top - padding.bottom)
  const frameRange = $derived(viewport.endFrame - viewport.startFrame)

  // Convert frame ranges to pixel coordinates
  const regions = $derived.by(() => {
    const { startFrame, endFrame } = viewport
    if (blockedRanges.length === 0 || frameRange <= 0) return []

    return blockedRanges
      .map((range, index) => {
        // Clamp range to visible area
        const visibleStart = Math.max(range.start, startFrame)
        const visibleEnd = Math.min(range.end, endFrame)

        // Skip if completely outside viewport
        if (visibleStart >= visibleEnd) return null

        // Convert to pixel coordinates
        const x = graphLeft + ((visibleStart - startFrame) / frameRange) * graphWidth
        const regionWidth = ((visibleEnd - visibleStart) / frameRange) * graphWidth

        return {
          key: `${range.transition.id}-${range.role}-${index}`,
          x,
          width: regionWidth,
          role: range.role,
        }
      })
      .filter((region): region is NonNullable<typeof region> => Boolean(region))
  })

  // Unique pattern ID for defs
  const patternId = 'transition-blocked-stripes'
</script>

{#if regions.length > 0}
  <g class="graph-transition-regions" style:pointer-events="none">
    <!-- Define the diagonal stripes pattern once -->
    <defs>
      <pattern
        id={patternId}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(-45)"
      >
        <!-- Alternating stripes - using direct colors -->
        <rect width="10" height="10" fill="rgba(239, 68, 68, 0.15)" />
        <rect width="4" height="10" fill="rgba(239, 68, 68, 0.35)" />
      </pattern>
    </defs>

    {#each regions as region (region.key)}
      <g>
        <!-- Solid background first for visibility -->
        <rect
          x={region.x}
          y={graphTop}
          width={region.width}
          height={graphHeight}
          fill="rgba(239, 68, 68, 0.1)"
        />
        <!-- Striped overlay -->
        <rect
          x={region.x}
          y={graphTop}
          width={region.width}
          height={graphHeight}
          fill="url(#{patternId})"
        />
        <!-- Solid border edges -->
        <line
          x1={region.x}
          y1={graphTop}
          x2={region.x}
          y2={graphTop + graphHeight}
          stroke="rgba(239, 68, 68, 0.7)"
          stroke-width={2}
        />
        <line
          x1={region.x + region.width}
          y1={graphTop}
          x2={region.x + region.width}
          y2={graphTop + graphHeight}
          stroke="rgba(239, 68, 68, 0.7)"
          stroke-width={2}
        />
        <!-- Label if region is wide enough -->
        {#if region.width > 50}
          <text
            x={region.x + region.width / 2}
            y={graphTop + 16}
            text-anchor="middle"
            fill="rgba(239, 68, 68, 0.9)"
            font-size={10}
            font-weight={600}
          >TRANSITION</text>
        {/if}
      </g>
    {/each}
  </g>
{/if}
