<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { computeIoGripWidth, IO_HANDLE_WIDTH } from '../io-range-geometry.svelte'
  import IoRangeHandle from './io-range-handle.svelte'
  import type { PositionDataset } from './shared'

  const DEFAULT_HIT_WIDTH = 18
  const DEFAULT_HIT_HEIGHT_EXTRA = 6

  interface IoRangeHandlesProps {
    /** CSS `left` of the in point, or null when unset. */
    inLeft: string | null
    /** CSS `left` of the out point, or null when unset. */
    outLeft: string | null
    /** Pixel distance between in and out (for collapse-safe grip sizing). */
    spanPx: number | null
    laneHeight: number
    handleWidth?: number
    hitWidth?: number
    hitHeightExtra?: number
    onInDragStart?: (e: PointerEvent) => void
    onOutDragStart?: (e: PointerEvent) => void
    inTitle?: string
    outTitle?: string
    /** Prefix for `{prefix}-in-handle` / `{prefix}-out-handle` test ids. */
    testIdPrefix?: string
    inDataset?: PositionDataset
    outDataset?: PositionDataset
    /** Stacking order within the caller's lane (see IoRangeStrip). */
    zIndex?: number
  }

  /**
   * The two collapse-safe in/out drag handles (grip + hit area each). Render after
   * IoRangeStrip so the grips paint above the bar.
   */
  let {
    inLeft,
    outLeft,
    spanPx,
    laneHeight,
    handleWidth = IO_HANDLE_WIDTH,
    hitWidth = DEFAULT_HIT_WIDTH,
    hitHeightExtra = DEFAULT_HIT_HEIGHT_EXTRA,
    onInDragStart,
    onOutDragStart,
    inTitle,
    outTitle,
    testIdPrefix,
    inDataset,
    outDataset,
    zIndex = 22,
  }: IoRangeHandlesProps = $props()

  const gripWidth = $derived(computeIoGripWidth(spanPx, handleWidth))
</script>

{#if inLeft !== null}
  <IoRangeHandle
    side="in"
    left={inLeft}
    {gripWidth}
    {laneHeight}
    {hitWidth}
    {hitHeightExtra}
    {zIndex}
    onDragStart={onInDragStart}
    title={inTitle}
    testId={testIdPrefix ? `${testIdPrefix}-in-handle` : undefined}
    dataset={inDataset}
  />
{/if}
{#if outLeft !== null}
  <IoRangeHandle
    side="out"
    left={outLeft}
    {gripWidth}
    {laneHeight}
    {hitWidth}
    {hitHeightExtra}
    {zIndex}
    onDragStart={onOutDragStart}
    title={outTitle}
    testId={testIdPrefix ? `${testIdPrefix}-out-handle` : undefined}
    dataset={outDataset}
  />
{/if}
