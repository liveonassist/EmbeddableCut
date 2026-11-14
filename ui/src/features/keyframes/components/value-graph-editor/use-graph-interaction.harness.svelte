<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { DEFAULT_GRAPH_PADDING, type GraphKeyframePoint, type GraphViewport } from './types'

  const viewport: GraphViewport = {
    width: 600,
    height: 300,
    startFrame: 0,
    endFrame: 60,
    minValue: 0,
    maxValue: 100,
  }

  const basePoints: GraphKeyframePoint[] = [
    {
      keyframe: { id: 'kf-1', frame: 10, value: 30, easing: 'linear' },
      itemId: 'item-1',
      property: 'opacity',
      x: 120,
      y: 120,
      isSelected: false,
      isDragging: false,
    },
    {
      keyframe: { id: 'kf-2', frame: 20, value: 50, easing: 'linear' },
      itemId: 'item-1',
      property: 'opacity',
      x: 260,
      y: 180,
      isSelected: false,
      isDragging: false,
    },
  ]

  const sensitivityViewport: GraphViewport = {
    width: 600,
    height: 300,
    startFrame: 0,
    endFrame: 60,
    minValue: 100,
    maxValue: 110,
  }

  const padding = DEFAULT_GRAPH_PADDING
  const EMPTY: Set<string> = new Set()
</script>

<script lang="ts">
  import type { KeyframeRef } from '@/types/keyframe'
  import { useGraphInteraction } from './use-graph-interaction.svelte'

  // Test probes for useGraphInteraction, one per React test component:
  // `marquee` (TestGraph), `drag` (DragGraph), `sensitivity`
  // (DragSensitivityGraph), `zoom` (ZoomGraph), `wheel-zoom`, `wheel-pan`.
  let {
    mode,
    initialSelection = [],
    onKeyframeMove,
    onDuplicateKeyframes,
  }: {
    mode: 'marquee' | 'drag' | 'sensitivity' | 'zoom' | 'wheel-zoom' | 'wheel-pan'
    initialSelection?: string[]
    onKeyframeMove?: (ref: KeyframeRef, frame: number, value: number) => void
    onDuplicateKeyframes?: (
      entries: Array<{ ref: KeyframeRef; frame: number; value: number }>,
    ) => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let selection = $state.raw<Set<string>>(new Set(initialSelection))
  // svelte-ignore state_referenced_locally
  let liveViewport = $state.raw<GraphViewport>(
    mode === 'wheel-pan'
      ? { ...viewport, startFrame: 10, endFrame: 70, minValue: 0, maxValue: 100 }
      : { ...viewport, startFrame: 0, endFrame: 100, minValue: 0, maxValue: 100 },
  )

  const points = $derived(
    mode === 'sensitivity'
      ? [
          {
            keyframe: { id: 'kf-1', frame: 10, value: 105, easing: 'linear' as const },
            itemId: 'item-1',
            property: 'x' as const,
            x: 120,
            y: 120,
            isSelected: selection.has('kf-1'),
            isDragging: false,
          },
        ]
      : basePoints.map((point) => ({ ...point, isSelected: selection.has(point.keyframe.id) })),
  )

  const viewportControlled = $derived(mode === 'zoom' || mode === 'wheel-zoom' || mode === 'wheel-pan')

  const interaction = useGraphInteraction(() =>
    viewportControlled
      ? {
          viewport: liveViewport,
          padding,
          points: basePoints,
          selectedKeyframeIds: EMPTY,
          onViewportChange: (next) => (liveViewport = next),
          maxFrame: 100,
          minValue: 0,
          maxValue: 100,
        }
      : {
          viewport: mode === 'sensitivity' ? sensitivityViewport : viewport,
          padding,
          points,
          selectedKeyframeIds: selection,
          onSelectionChange: (next) => (selection = next),
          onKeyframeMove,
          onDuplicateKeyframes,
        },
  )

  const previewText = $derived(
    interaction.previewValues ? JSON.stringify(interaction.previewValues) : '',
  )
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
{#if mode === 'marquee'}
  <div>
    <svg data-testid="graph" width={viewport.width} height={viewport.height}>
      <rect
        data-testid="background"
        x={padding.left}
        y={padding.top}
        width={viewport.width - padding.left - padding.right}
        height={viewport.height - padding.top - padding.bottom}
        fill="transparent"
        onpointerdown={interaction.handleBackgroundPointerDown}
        onclick={interaction.handleBackgroundClick}
      />
      {#if interaction.marqueeRect}
        <rect
          data-testid="marquee"
          x={interaction.marqueeRect.x}
          y={interaction.marqueeRect.y}
          width={interaction.marqueeRect.width}
          height={interaction.marqueeRect.height}
        />
      {/if}
    </svg>
    <output data-testid="selection">{[...selection].join(',')}</output>
  </div>
{:else if mode === 'drag'}
  <svg
    data-testid="drag-graph"
    width={viewport.width}
    height={viewport.height}
    onpointermove={interaction.handlePointerMove}
    onpointerup={interaction.handlePointerUp}
  >
    {#each points as point (point.keyframe.id)}
      <circle
        data-testid="point-{point.keyframe.id}"
        cx={point.x}
        cy={point.y}
        r={10}
        onpointerdown={(event) => interaction.handleKeyframePointerDown(point, event)}
      />
    {/each}
    <text data-testid="preview-values">{previewText}</text>
  </svg>
{:else if mode === 'sensitivity'}
  <svg
    data-testid="sensitivity-graph"
    width={sensitivityViewport.width}
    height={sensitivityViewport.height}
    onpointermove={interaction.handlePointerMove}
    onpointerup={interaction.handlePointerUp}
  >
    <circle
      data-testid="sensitivity-point"
      cx={points[0]!.x}
      cy={points[0]!.y}
      r={10}
      onpointerdown={(event) => interaction.handleKeyframePointerDown(points[0]!, event)}
    />
    <text data-testid="sensitivity-preview-values">{previewText}</text>
  </svg>
{:else if mode === 'zoom'}
  <div>
    <button type="button" onclick={interaction.zoomIn}>zoom</button>
    <output data-testid="zoom-viewport">{`${liveViewport.startFrame},${liveViewport.endFrame}`}</output>
  </div>
{:else}
  {@const prefix = mode === 'wheel-pan' ? 'pan-wheel' : 'wheel'}
  <div>
    <svg
      data-testid="{prefix}-graph"
      width={viewport.width}
      height={viewport.height}
      onwheel={interaction.handleWheel}
    ></svg>
    <output data-testid="{prefix}-viewport"
      >{`${liveViewport.startFrame},${liveViewport.endFrame},${liveViewport.minValue},${liveViewport.maxValue}`}</output
    >
  </div>
{/if}
