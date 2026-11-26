<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { VectorKeyframe } from '@/types/keyframe'

  const GRAPH_WIDTH = 1000
  const GRAPH_HEIGHT = 360
  const GRAPH_PADDING_X = 28
  const GRAPH_PADDING_Y = 24
  const DEFAULT_INFLUENCE = 100 / 3
  const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1]

  function vectorDistance(left: VectorKeyframe, right: VectorKeyframe): number {
    return Math.hypot(right.value.x - left.value.x, right.value.y - left.value.y)
  }

  function averageSegmentSpeed(
    left: VectorKeyframe | undefined,
    right: VectorKeyframe | undefined,
    fps: number,
  ): number {
    if (!left || !right || right.frame <= left.frame) return 0
    return vectorDistance(left, right) / ((right.frame - left.frame) / Math.max(1, fps))
  }
</script>

<script lang="ts">
  import Gauge from '@lucide/svelte/icons/gauge'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { sampleVectorSpeedGraph } from '@/features/timeline/deps/keyframes'
  import type { TemporalEaseHandle } from '@/types/keyframe'
  import NumberField from './number-field.svelte'
  import type { VectorSpeedGraphProps } from './types'

  let {
    property,
    label,
    keyframes,
    currentKeyframeId,
    fps,
    resetLabel,
    onTemporalEaseCommit,
    onSelectKeyframe,
  }: VectorSpeedGraphProps = $props()

  const currentIndex = $derived(
    Math.max(
      0,
      keyframes.findIndex((keyframe) => keyframe.id === currentKeyframeId),
    ),
  )
  const current = $derived(keyframes[currentIndex])

  const graph = $derived.by(() => {
    if (keyframes.length < 2 || !current) return null
    const previous = keyframes[currentIndex - 1]
    const next = keyframes[currentIndex + 1]
    const incomingFallback = averageSegmentSpeed(previous, current, fps)
    const outgoingFallback = averageSegmentSpeed(current, next, fps)
    const incoming: TemporalEaseHandle = current.temporalEase?.in ?? {
      speed: incomingFallback,
      influence: DEFAULT_INFLUENCE,
    }
    const outgoing: TemporalEaseHandle = current.temporalEase?.out ?? {
      speed: outgoingFallback,
      influence: DEFAULT_INFLUENCE,
    }

    const samples = sampleVectorSpeedGraph(property, keyframes, fps)
    const firstFrame = keyframes[0]!.frame
    const lastFrame = keyframes.at(-1)!.frame
    const frameRange = Math.max(1, lastFrame - firstFrame)
    const maxSpeed = Math.max(
      1,
      incoming.speed,
      outgoing.speed,
      ...samples.map((sample) => sample.speed),
    )
    const xForFrame = (frame: number) =>
      GRAPH_PADDING_X + ((frame - firstFrame) / frameRange) * (GRAPH_WIDTH - GRAPH_PADDING_X * 2)
    const yForSpeed = (speed: number) =>
      GRAPH_HEIGHT -
      GRAPH_PADDING_Y -
      (Math.max(0, speed) / maxSpeed) * (GRAPH_HEIGHT - GRAPH_PADDING_Y * 2)
    const speedPath = samples
      .map(
        (sample, index) =>
          `${index === 0 ? 'M' : 'L'} ${xForFrame(sample.frame)} ${yForSpeed(sample.speed)}`,
      )
      .join(' ')
    const currentX = xForFrame(current.frame)
    const incomingHandleX = previous
      ? currentX - (currentX - xForFrame(previous.frame)) * (incoming.influence / 100)
      : currentX
    const outgoingHandleX = next
      ? currentX + (xForFrame(next.frame) - currentX) * (outgoing.influence / 100)
      : currentX
    const points = keyframes.map((keyframe) => {
      const nearest = samples.reduce((best, sample) =>
        Math.abs(sample.frame - keyframe.frame) < Math.abs(best.frame - keyframe.frame)
          ? sample
          : best,
      )
      return { keyframe, cy: yForSpeed(nearest.speed), selected: keyframe.id === current.id }
    })
    return {
      current,
      previous,
      next,
      incoming,
      outgoing,
      lastFrame,
      firstFrame,
      maxSpeed,
      xForFrame,
      yForSpeed,
      speedPath,
      currentX,
      incomingHandleX,
      outgoingHandleX,
      points,
    }
  })

  const updateHandle = (side: 'in' | 'out', field: keyof TemporalEaseHandle, value: number) => {
    if (!graph) return
    const fallback = side === 'in' ? graph.incoming : graph.outgoing
    const nextHandle = {
      ...fallback,
      [field]: field === 'influence' ? Math.max(0, Math.min(100, value)) : Math.max(0, value),
    }
    onTemporalEaseCommit(graph.current.id, { ...graph.current.temporalEase, [side]: nextHandle })
  }
</script>

{#if !graph}
  <div
    class="flex h-full min-h-0 items-center justify-center bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.05),transparent_48%)]"
    data-testid="vector-speed-graph"
  >
    <div class="max-w-sm text-center">
      <Gauge class="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
      <div class="text-xs font-medium text-foreground">{label}</div>
      <div class="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        Add at least two keyframes to shape velocity and influence over time.
      </div>
    </div>
  </div>
{:else}
  <div class="flex h-full min-h-0 flex-col bg-background/20" data-testid="vector-speed-graph">
    <div
      class="flex min-h-9 flex-wrap items-center gap-1 border-b border-border/60 bg-background/75 px-2 py-1"
    >
      <div
        class="mr-2 flex min-w-24 items-center gap-1.5 text-[10px] font-medium text-foreground"
      >
        <Gauge class="h-3 w-3 text-sky-400" />{label}<span class="text-muted-foreground"
          >· {graph.current.frame}f</span
        >
      </div>
      <NumberField
        label="In speed"
        value={graph.incoming.speed}
        suffix="/s"
        disabled={!graph.previous}
        onCommit={(value) => updateHandle('in', 'speed', value)}
      />
      <NumberField
        label="In influence"
        value={graph.incoming.influence}
        suffix="%"
        disabled={!graph.previous}
        onCommit={(value) => updateHandle('in', 'influence', value)}
      />
      <NumberField
        label="Out speed"
        value={graph.outgoing.speed}
        suffix="/s"
        disabled={!graph.next}
        onCommit={(value) => updateHandle('out', 'speed', value)}
      />
      <NumberField
        label="Out influence"
        value={graph.outgoing.influence}
        suffix="%"
        disabled={!graph.next}
        onCommit={(value) => updateHandle('out', 'influence', value)}
      />
      <button
        type="button"
        aria-label={resetLabel}
        class="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:opacity-40"
        disabled={!graph.current.temporalEase}
        title={resetLabel}
        onclick={() => onTemporalEaseCommit(graph.current.id, undefined)}
      >
        <RotateCcw class="h-3 w-3" />
      </button>
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden bg-slate-950/45">
      <svg
        aria-label={`${label} speed graph`}
        class="h-full w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      >
        {#each GRID_RATIOS as ratio (ratio)}
          {@const y = GRAPH_PADDING_Y + ratio * (GRAPH_HEIGHT - GRAPH_PADDING_Y * 2)}
          <line
            x1={GRAPH_PADDING_X}
            x2={GRAPH_WIDTH - GRAPH_PADDING_X}
            y1={y}
            y2={y}
            stroke="rgba(148, 163, 184, 0.12)"
            vector-effect="non-scaling-stroke"
          />
        {/each}
        {#each keyframes as keyframe (`grid:${keyframe.id}`)}
          <line
            x1={graph.xForFrame(keyframe.frame)}
            x2={graph.xForFrame(keyframe.frame)}
            y1={GRAPH_PADDING_Y}
            y2={GRAPH_HEIGHT - GRAPH_PADDING_Y}
            stroke="rgba(148, 163, 184, 0.12)"
            vector-effect="non-scaling-stroke"
          />
        {/each}
        <path
          d={`${graph.speedPath} L ${graph.xForFrame(graph.lastFrame)} ${GRAPH_HEIGHT - GRAPH_PADDING_Y} L ${graph.xForFrame(graph.firstFrame)} ${GRAPH_HEIGHT - GRAPH_PADDING_Y} Z`}
          fill="rgba(56, 189, 248, 0.08)"
        />
        <path
          d={graph.speedPath}
          fill="none"
          stroke="rgb(56 189 248)"
          stroke-width={2}
          vector-effect="non-scaling-stroke"
        />
        <line
          x1={graph.currentX}
          x2={graph.currentX}
          y1={GRAPH_PADDING_Y}
          y2={GRAPH_HEIGHT - GRAPH_PADDING_Y}
          stroke="rgba(250, 204, 21, 0.75)"
          stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke"
        />
        {#if graph.previous}
          <line
            x1={graph.incomingHandleX}
            x2={graph.currentX}
            y1={graph.yForSpeed(graph.incoming.speed)}
            y2={graph.yForSpeed(graph.incoming.speed)}
            stroke="rgb(250 204 21)"
            vector-effect="non-scaling-stroke"
          />
          <circle
            cx={graph.incomingHandleX}
            cy={graph.yForSpeed(graph.incoming.speed)}
            r={4}
            fill="rgb(250 204 21)"
          />
        {/if}
        {#if graph.next}
          <line
            x1={graph.currentX}
            x2={graph.outgoingHandleX}
            y1={graph.yForSpeed(graph.outgoing.speed)}
            y2={graph.yForSpeed(graph.outgoing.speed)}
            stroke="rgb(250 204 21)"
            vector-effect="non-scaling-stroke"
          />
          <circle
            cx={graph.outgoingHandleX}
            cy={graph.yForSpeed(graph.outgoing.speed)}
            r={4}
            fill="rgb(250 204 21)"
          />
        {/if}
        {#each graph.points as point (point.keyframe.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <circle
            cx={graph.xForFrame(point.keyframe.frame)}
            cy={point.cy}
            r={point.selected ? 5 : 4}
            fill={point.selected ? 'rgb(250 204 21)' : 'rgb(226 232 240)'}
            stroke="rgb(15 23 42)"
            stroke-width={2}
            class="cursor-pointer"
            onclick={() => onSelectKeyframe?.(point.keyframe)}
          />
        {/each}
      </svg>
      <div class="pointer-events-none absolute bottom-1 left-2 text-[9px] text-muted-foreground">
        0 {property === 'scale' ? '%/s' : 'px/s'}
      </div>
      <div class="pointer-events-none absolute left-2 top-1 text-[9px] text-muted-foreground">
        {graph.maxSpeed.toFixed(1)}
        {property === 'scale' ? '%/s' : 'px/s'}
      </div>
    </div>
  </div>
{/if}
