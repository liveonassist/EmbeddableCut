<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { blockMouseDown, type PositionDataset } from './shared'

  /*
   * Single source of truth for in/out (IO) range markers, shared by every
   * workspace that renders an IO bar: the Edit-workspace timeline ruler
   * (`timeline-in-out-markers` / `timeline-markers`), the Color/Animate
   * mini-timeline (`mini-timeline-io-lane`), and the source monitor
   * (`source-monitor`). Consolidating the grip/strip markup + geometry here means
   * a bug (e.g. handles overlapping into a solid block when the range collapses to
   * a few pixels at low zoom / short ranges) is fixed once, not three times.
   *
   * Positions are passed as CSS `left`/`width` strings so callers stay in whatever
   * coordinate space is natural (absolute px for the scrollable ruler, `%` for the
   * fixed-width lanes). The pixel span between in and out (`spanPx`) is passed
   * separately and used only to keep the two side grips from overlapping.
   */

  interface IoRangeStripProps {
    /** CSS `left` of the strip within the caller's coordinate box. */
    left: string
    /** CSS `width` of the strip. */
    width: string
    /** Lane height in px. */
    height: number
    onDragStart?: (e: PointerEvent) => void
    title?: string
    testId?: string
    class?: string
    /** Stacking order within the caller's lane. Defaults suit the Edit ruler; the
        mini-timeline passes lower values so the strip stays under its playhead. */
    zIndex?: number
    dataset?: PositionDataset
  }

  /**
   * The draggable range strip (slide the whole in/out range, preserving length).
   * Flat muted-gray bar — the blue accent lives on the handles.
   */
  let {
    left,
    width,
    height,
    onDragStart,
    title,
    testId,
    class: className,
    zIndex = 11,
    dataset,
  }: IoRangeStripProps = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  data-testid={testId}
  {...dataset}
  {title}
  class={cn('absolute', onDragStart && 'cursor-grab active:cursor-grabbing', className)}
  style:left
  style:width
  style:top="0px"
  style:height="{height}px"
  style:min-width="2px"
  style:background="color-mix(in oklch, var(--muted-foreground) 82%, black)"
  style:border="1px solid color-mix(in oklch, var(--muted-foreground) 70%, transparent)"
  style:border-radius="5px"
  style:z-index={zIndex}
  style:pointer-events={onDragStart ? 'auto' : 'none'}
  onpointerdown={onDragStart}
  onmousedown={onDragStart ? blockMouseDown : undefined}
></div>
