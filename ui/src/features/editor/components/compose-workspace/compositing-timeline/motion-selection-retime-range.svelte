<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getRetimeKeyboardDelta, getVisibleMotionRetimeRange } from '../motion-selection-retime'
  import type { getMotionSelectionTimeRange } from '../motion-keyframe-selection'
  import type { MotionTimeViewport } from '../motion-time-viewport-controller'

  type ButtonPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }

  interface MotionSelectionRetimeRangeProps {
    range: ReturnType<typeof getMotionSelectionTimeRange>
    viewport: MotionTimeViewport
    durationInFrames: number
    frameToPercent: (frame: number) => number
    onBegin: (event: ButtonPointerEvent, edge: 'start' | 'end') => void
    onMove: (event: ButtonPointerEvent) => void
    onEnd: (event: ButtonPointerEvent) => void
    onCancel: (event: ButtonPointerEvent) => void
    onNudge: (edge: 'start' | 'end', deltaFrames: number) => void
    rangeElement?: HTMLDivElement | null
  }

  let {
    range,
    viewport,
    durationInFrames,
    frameToPercent,
    onBegin,
    onMove,
    onEnd,
    onCancel,
    onNudge,
    rangeElement = $bindable(null),
  }: MotionSelectionRetimeRangeProps = $props()

  const visibleRange = $derived(getVisibleMotionRetimeRange(range, viewport))

  function handleKeyDown(
    event: KeyboardEvent & { currentTarget: EventTarget & HTMLButtonElement },
    edge: 'start' | 'end',
  ) {
    const deltaFrames = getRetimeKeyboardDelta(event)
    if (deltaFrames === null) return
    event.preventDefault()
    event.stopPropagation()
    onNudge(edge, deltaFrames)
  }
</script>

{#if range && visibleRange}
  {@const selectionDuration = range.endFrame - range.startFrame}
  {@const layerSuffix = range.itemCount === 1 ? '' : 's'}
  <div
    bind:this={rangeElement}
    data-testid="motion-selection-retime-range"
    class="pointer-events-none absolute bottom-0 z-10 h-1 rounded-full bg-primary/70 shadow-[0_0_0_1px_hsl(var(--background)),0_0_6px_hsl(var(--primary)/0.45)]"
    style:left="{frameToPercent(visibleRange.startFrame)}%"
    style:width="{Math.max(0.4, visibleRange.widthPercent)}%"
    title="{range.keyframeCount} selected keyframes across {range.itemCount} layer{layerSuffix} · {selectionDuration}f"
  >
    {#if visibleRange.widthPercent >= 8}
      <span
        data-motion-selection-retime-label
        class="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-primary/30 bg-background/95 px-1 py-0.5 text-[8px] font-medium normal-case tracking-normal text-primary shadow-sm"
      >
        {range.keyframeCount} keys · {selectionDuration}f
      </span>
    {/if}
    {#if range.startFrame >= viewport.startFrame}
      <button
        type="button"
        role="slider"
        data-motion-selection-retime-edge="start"
        aria-label="Retime selected keyframes start"
        aria-valuemin={0}
        aria-valuemax={range.endFrame - 1}
        aria-valuenow={range.startFrame}
        onpointerdown={(event) => onBegin(event, 'start')}
        onpointermove={onMove}
        onpointerup={onEnd}
        onpointercancel={onCancel}
        onkeydown={(event) => handleKeyDown(event, 'start')}
        class="pointer-events-auto absolute -bottom-1.5 -left-1.5 h-4 w-3 cursor-ew-resize touch-none rounded-sm border border-primary bg-background shadow-sm outline-none hover:bg-primary/15 focus-visible:ring-1 focus-visible:ring-primary"
      ></button>
    {/if}
    {#if range.endFrame <= viewport.endFrame}
      <button
        type="button"
        role="slider"
        data-motion-selection-retime-edge="end"
        aria-label="Retime selected keyframes end"
        aria-valuemin={range.startFrame + 1}
        aria-valuemax={Math.max(1, durationInFrames - 1)}
        aria-valuenow={range.endFrame}
        onpointerdown={(event) => onBegin(event, 'end')}
        onpointermove={onMove}
        onpointerup={onEnd}
        onpointercancel={onCancel}
        onkeydown={(event) => handleKeyDown(event, 'end')}
        class="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-4 w-3 cursor-ew-resize touch-none rounded-sm border border-primary bg-background shadow-sm outline-none hover:bg-primary/15 focus-visible:ring-1 focus-visible:ring-primary"
      ></button>
    {/if}
  </div>
{/if}
