<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Format a keyframe value for display.
   */
  function formatDragTooltip(
    frame: number,
    value: number,
    rulerUnit: 'frames' | 'seconds',
    fps: number,
  ): string {
    const timePart =
      rulerUnit === 'seconds' && fps > 0 ? `${(frame / fps).toFixed(2)}s` : `${frame}`

    return `${timePart}  ${formatKeyframeValue(value)}`
  }

  function formatKeyframeValue(value: number): string {
    if (Math.abs(value) >= 100) {
      return value.toFixed(0)
    }
    if (Math.abs(value) >= 10) {
      return value.toFixed(1)
    }
    return value.toFixed(2)
  }
</script>

<script lang="ts">
  /**
   * Keyframe points on the value graph (GraphKeyframes). Each point uses
   * pointer events with pointer capture (taken by the interaction hook) for
   * reliable dragging.
   */
  import type { GraphKeyframePoint } from './types'

  let {
    points,
    size = 10,
    previewValuesById,
    onPointerDown,
    onClick,
    onDoubleClick,
    rulerUnit = 'frames',
    fps = 30,
    disabled = false,
  }: {
    points: GraphKeyframePoint[]
    size?: number
    previewValuesById?: Record<string, { frame: number; value: number }> | null
    onPointerDown?: (point: GraphKeyframePoint, event: PointerEvent) => void
    onClick?: (point: GraphKeyframePoint, event: MouseEvent) => void
    onDoubleClick?: (point: GraphKeyframePoint, event: MouseEvent) => void
    rulerUnit?: 'frames' | 'seconds'
    fps?: number
    disabled?: boolean
  } = $props()

  const halfSize = $derived(size / 2)
  const cursorStyle = $derived(disabled ? 'default' : 'pointer')

  function handlePointerDown(point: GraphKeyframePoint, e: PointerEvent) {
    if (disabled) return
    // Don't prevent default here - let the hook handle pointer capture
    onPointerDown?.(point, e)
  }

  function handleClick(point: GraphKeyframePoint, e: MouseEvent) {
    if (disabled) return
    e.stopPropagation()
    onClick?.(point, e)
  }

  function handleDoubleClick(point: GraphKeyframePoint, e: MouseEvent) {
    if (disabled) return
    e.stopPropagation()
    onDoubleClick?.(point, e)
  }
</script>

<g class="graph-keyframes">
  {#each points as point (point.keyframe.id)}
    {@const previewValue = point.isDragging ? (previewValuesById?.[point.keyframe.id] ?? null) : null}
    {@const showDragPreview = point.isDragging || previewValue !== null}
    <g class="graph-keyframe" style:touch-action="none">
      <!-- Hit area (larger invisible target) - uses pointer events -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <circle
        cx={point.x}
        cy={point.y}
        r={size}
        fill="transparent"
        onpointerdown={(e) => handlePointerDown(point, e)}
        onclick={(e) => handleClick(point, e)}
        ondblclick={(e) => handleDoubleClick(point, e)}
        style:touch-action="none"
        style:cursor={cursorStyle}
      />

      <!-- Selection ring -->
      {#if point.isSelected}
        <circle
          cx={point.x}
          cy={point.y}
          r={halfSize + 4}
          fill="none"
          stroke="hsl(var(--primary))"
          stroke-width={2}
          stroke-opacity={0.5}
        />
      {/if}

      <!-- Diamond shape -->
      <path
        d={`
          M ${point.x} ${point.y - halfSize}
          L ${point.x + halfSize} ${point.y}
          L ${point.x} ${point.y + halfSize}
          L ${point.x - halfSize} ${point.y}
          Z
        `}
        fill={showDragPreview ? '#3b82f6' : point.isSelected ? '#3b82f6' : '#e5e5e5'}
        stroke="#1a1a1a"
        stroke-width={2}
        style:pointer-events="none"
      />

      <!-- Value tooltip when dragging - shows TARGET values -->
      {#if showDragPreview}
        <g data-testid="graph-keyframe-tooltip-{point.keyframe.id}" style:pointer-events="none">
          <rect
            x={point.x + 12}
            y={point.y - 24}
            width={90}
            height={20}
            rx={4}
            fill="#1c1c1c"
            stroke="#3a3a3a"
            stroke-width={1}
          />
          <text
            x={point.x + 57}
            y={point.y - 10}
            text-anchor="middle"
            fill="#e5e5e5"
            font-size={11}
            font-family="monospace"
          >{formatDragTooltip(
              previewValue ? previewValue.frame : point.keyframe.frame,
              previewValue ? previewValue.value : point.keyframe.value,
              rulerUnit,
              fps,
            )}</text>
        </g>
      {/if}
    </g>
  {/each}
</g>
