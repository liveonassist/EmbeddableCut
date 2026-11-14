<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import type { TimelineTrack } from '@/types/timeline'
  import type { MotionSpanDragCommands } from '../motion-span-interactions'
  import { RULER_DIVISIONS, type InlineCurveState } from '../motion-timeline-primitives'

  type DivPointerHandler = (event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) => void

  interface MotionGroupLaneCellProps {
    track: TimelineTrack
    groupItemIds: string[]
    groupFrom: number
    groupEnd: number
    activeInlineCurve: InlineCurveState | null
    frameToMotionPercent: (frame: number) => number
    visibleFrameRange: number
    spanDrag: MotionSpanDragCommands
    beginPlayheadScrub: DivPointerHandler
    movePlayheadScrub: DivPointerHandler
    endPlayheadScrub: DivPointerHandler
  }

  /**
   * The group's slice of the motion timeline: the scrub surface, the static
   * divisions and — while no inline curve pane is open — the group span.
   */
  let {
    track,
    groupItemIds,
    groupFrom,
    groupEnd,
    activeInlineCurve,
    frameToMotionPercent,
    visibleFrameRange,
    spanDrag,
    beginPlayheadScrub,
    movePlayheadScrub,
    endPlayheadScrub,
  }: MotionGroupLaneCellProps = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative min-w-0 flex-1 touch-none overflow-hidden"
  onpointerdown={beginPlayheadScrub}
  onpointermove={movePlayheadScrub}
  onpointerup={endPlayheadScrub}
  onpointercancel={endPlayheadScrub}
>
  <div data-motion-viewport-surface class="absolute inset-0 overflow-hidden">
    {#each { length: RULER_DIVISIONS + 1 } as _, tick (tick)}
      <div
        data-motion-static-x
        class="pointer-events-none absolute inset-y-0 border-l border-border/45"
        style:left="{(tick / RULER_DIVISIONS) * 100}%"
      ></div>
    {/each}
    {#if !activeInlineCurve && groupItemIds.length > 0}
      <button
        type="button"
        data-testid="motion-group-span-{track.id}"
        data-from-frame={groupFrom}
        data-to-frame={groupEnd}
        disabled={track.locked}
        onpointerdown={(event) => !track.locked && spanDrag.begin(event, groupItemIds)}
        onpointermove={spanDrag.move}
        onpointerup={spanDrag.end}
        onpointercancel={spanDrag.cancel}
        class={cn(
          'absolute top-1/2 h-6 -translate-y-1/2 touch-none rounded-sm border border-timeline-motion-segment/80 bg-timeline-motion-segment/70 px-1 text-left text-[9px] text-foreground',
          track.locked ? 'cursor-not-allowed opacity-55' : 'cursor-grab active:cursor-grabbing',
        )}
        style:left="{frameToMotionPercent(groupFrom)}%"
        style:width="{Math.max(0.6, ((groupEnd - groupFrom) / visibleFrameRange) * 100)}%"
      >
        <span class="block truncate">{track.name}</span>
      </button>
    {/if}
  </div>
</div>
