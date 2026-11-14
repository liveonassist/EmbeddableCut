<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Renders bezier handles for selected keyframes with cubic-bezier easing.
   * Each handle uses pointer events for reliable drag behavior.
   */
  import { cn } from '@/shared/ui/cn'
  import { getBezierPresetForEasing } from '@/features/keyframes/utils/easing-presets'
  import type { BezierControlPoints } from '@/types/keyframe'
  import type { GraphBezierHandle, GraphKeyframePoint } from './types'

  const MIN_VISIBLE_HANDLE_DISTANCE = 2

  interface GraphHandlesProps {
    /** All keyframe points */
    points: GraphKeyframePoint[]
    /** Selected keyframe IDs (only show handles for selected keyframes) */
    selectedKeyframeIds: Set<string>
    /** Callback when handle pointer down (starts drag) */
    onHandlePointerDown?: (handle: GraphBezierHandle, event: PointerEvent) => void
    /** Currently dragging handle (for visual feedback) */
    draggingHandle?: { keyframeId: string; type: 'in' | 'out' } | null
    /** Preview bezier configs during drag (overrides keyframe data for lag-free rendering) */
    previewBezierConfigs?: Record<string, BezierControlPoints> | null
    /** Which bezier handles should be visible */
    handleVisibility?: 'selected' | 'all'
    /** Whether the graph is disabled */
    disabled?: boolean
  }

  let {
    points,
    selectedKeyframeIds,
    onHandlePointerDown,
    draggingHandle,
    previewBezierConfigs,
    handleVisibility = 'selected',
    disabled = false,
  }: GraphHandlesProps = $props()

  const showAllHandles = $derived(handleVisibility === 'all')

  // Sort points by frame (toSorted for immutability)
  const sortedPoints = $derived(points.toSorted((a, b) => a.keyframe.frame - b.keyframe.frame))

  // Generate handles for selected keyframes with cubic-bezier easing
  const handles = $derived.by(() => {
    const result: GraphBezierHandle[] = []

    sortedPoints.forEach((point, index) => {
      const nextPoint = sortedPoints[index + 1]
      if (!nextPoint) return

      const startSelected = selectedKeyframeIds.has(point.keyframe.id)
      const endSelected = selectedKeyframeIds.has(nextPoint.keyframe.id)

      if (!showAllHandles && !startSelected && !endSelected) {
        return
      }

      // Use preview bezier config if available (during drag), otherwise use keyframe data
      const previewBezier = previewBezierConfigs?.[point.keyframe.id]
      const config = point.keyframe.easingConfig
      const bezier =
        previewBezier ??
        (config?.type === 'cubic-bezier'
          ? config.bezier
          : getBezierPresetForEasing(point.keyframe.easing))
      if (!bezier) return

      // Calculate the curve segment dimensions
      const segmentWidth = nextPoint.x - point.x
      const segmentHeight = nextPoint.y - point.y

      // Determine which handles to show based on easing type
      const easing = point.keyframe.easing
      const showOut = easing !== 'ease-out' // ease-in and ease-in-out show the out handle
      const showIn = easing !== 'ease-in' // ease-out and ease-in-out show the in handle

      // Control point 1 (outgoing, anchored at startPoint) — only show if startPoint is selected
      if (showOut && (showAllHandles || startSelected)) {
        const cp1X = point.x + bezier.x1 * segmentWidth
        const cp1Y = point.y + bezier.y1 * segmentHeight

        if (Math.hypot(cp1X - point.x, cp1Y - point.y) > MIN_VISIBLE_HANDLE_DISTANCE) {
          result.push({
            keyframeId: point.keyframe.id,
            type: 'out',
            x: cp1X,
            y: cp1Y,
            anchorX: point.x,
            anchorY: point.y,
          })
        }
      }

      // Control point 2 (incoming, anchored at endPoint) — only show if endPoint is selected
      if (showIn && (showAllHandles || endSelected)) {
        const cp2X = point.x + bezier.x2 * segmentWidth
        const cp2Y = point.y + bezier.y2 * segmentHeight

        if (Math.hypot(cp2X - nextPoint.x, cp2Y - nextPoint.y) > MIN_VISIBLE_HANDLE_DISTANCE) {
          result.push({
            keyframeId: point.keyframe.id,
            type: 'in',
            x: cp2X,
            y: cp2Y,
            anchorX: nextPoint.x,
            anchorY: nextPoint.y,
          })
        }
      }
    })

    return result
  })

  function handlePointerDown(handle: GraphBezierHandle, e: PointerEvent) {
    if (disabled) return
    // Don't prevent default - let the hook handle pointer capture
    onHandlePointerDown?.(handle, e)
  }
</script>

{#if handles.length > 0}
  <g class="graph-handles">
    {#each handles as handle (`${handle.keyframeId}-${handle.type}`)}
      {@const isDragging =
        draggingHandle?.keyframeId === handle.keyframeId && draggingHandle?.type === handle.type}
      <g class="bezier-handle" style:touch-action="none">
        <!-- Line from anchor to handle -->
        <line
          x1={handle.anchorX}
          y1={handle.anchorY}
          x2={handle.x}
          y2={handle.y}
          stroke="#e5e7eb"
          stroke-width={1}
          stroke-opacity={0.8}
          style:pointer-events="none"
        />

        <!-- Handle circle - larger hit area -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <circle
          cx={handle.x}
          cy={handle.y}
          r={12}
          fill="transparent"
          onpointerdown={(e) => handlePointerDown(handle, e)}
          class={cn(!disabled && 'cursor-grab', isDragging && 'cursor-grabbing')}
          style:touch-action="none"
        />

        <!-- Handle circle - visual -->
        <circle
          cx={handle.x}
          cy={handle.y}
          r={5}
          fill={isDragging ? '#f8fafc' : '#d1d5db'}
          stroke="#111827"
          stroke-width={1.25}
          class={cn(
            'transition-colors',
            !disabled && 'hover:fill-[#f3f4f6]',
            isDragging && 'r-[6]',
          )}
          style:pointer-events="none"
        />
      </g>
    {/each}
  </g>
{/if}
