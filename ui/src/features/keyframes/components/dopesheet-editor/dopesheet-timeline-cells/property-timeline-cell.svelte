<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import type { Keyframe } from '@/types/keyframe'
  import { KEYFRAME_DIAMOND_SIDE_PX, KEYFRAME_EDGE_INSET } from '../layout'
  import SegmentEasingPopover from '../segment-easing-popover.svelte'
  import { buildSegmentSpans } from '../segment-spans'
  import {
    PROCEDURAL_HATCH,
    buildConnectorSegments,
    getTimelineGridLineStyle,
    type PropertyTimelineCellProps,
  } from './types'

  let {
    itemId,
    property,
    keyframes,
    locked,
    ticks,
    axisWidth,
    frameToX,
    gridFrameToX,
    getRenderedKeyframeX,
    renderedKeyframeXById,
    transitionBlockedRanges,
    proceduralBand,
    selectedKeyframeIds,
    disabled,
    onRowPointerDown,
    onKeyframePointerDown,
    onSegmentEasingChange,
    onSegmentDragStart,
    onSegmentDragEnd,
    setKeyframeButtonRef,
    keyframeMetaByIdRef,
    sheetPreviewFrames,
    sheetPreviewDuplicateKeyframeIds,
  }: PropertyTimelineCellProps = $props()

  // During a plain (non-duplicate) drag preview, place this row's keyframes — and
  // the connectors and easing bands between them — at their previewed frames, so
  // the whole row tracks a master/keyframe drag in realtime instead of only the
  // diamonds moving. Duplicate-drag keeps the originals put (the ghost overlay
  // below shows the moved copies), matching the group cell's behaviour.
  const previewFrames = $derived(sheetPreviewDuplicateKeyframeIds ? null : sheetPreviewFrames)
  const displayedFrame = (keyframe: Keyframe) => previewFrames?.[keyframe.id] ?? keyframe.frame
  const xForKeyframe = (keyframe: Keyframe): number | null => {
    const previewFrame = previewFrames?.[keyframe.id]
    if (previewFrame !== undefined) {
      return getRenderedKeyframeX(previewFrame) ?? frameToX(previewFrame)
    }
    return renderedKeyframeXById.get(keyframe.id) ?? frameToX(keyframe.frame)
  }
  const xForSegmentKeyframe = (keyframe: Keyframe): number => frameToX(displayedFrame(keyframe))

  const connectorSegments = $derived(
    buildConnectorSegments(
      keyframes.map((keyframe) => ({
        id: keyframe.id,
        frame: displayedFrame(keyframe),
        x: xForSegmentKeyframe(keyframe),
        held: keyframe.easing === 'hold',
      })),
    ),
  )

  // Clickable easing spans between consecutive keyframes (skipped while locked or
  // during a duplicate-drag preview, which owns pointer interaction on this row).
  const segmentSpans = $derived(
    onSegmentEasingChange && !locked && !disabled && !sheetPreviewDuplicateKeyframeIds
      ? buildSegmentSpans(
          keyframes.map((keyframe) => ({
            from: keyframe,
            frame: displayedFrame(keyframe),
            x: xForSegmentKeyframe(keyframe),
          })),
        )
      : [],
  )

  const gridLineStyle = $derived(getTimelineGridLineStyle(ticks, gridFrameToX ?? frameToX))

  const duplicatePreviews = $derived(
    sheetPreviewDuplicateKeyframeIds?.flatMap((keyframeId) => {
      const meta = keyframeMetaByIdRef.current.get(keyframeId)
      if (!meta || meta.property !== property) {
        return []
      }

      const previewFrame = sheetPreviewFrames?.[keyframeId]
      if (previewFrame === undefined) {
        return []
      }

      return [
        {
          keyframeId,
          previewFrame,
          renderedX: getRenderedKeyframeX(previewFrame) ?? frameToX(previewFrame),
        },
      ]
    }) ?? [],
  )

  const proceduralBandLeft = $derived(proceduralBand ? frameToX(proceduralBand.fromFrame) : 0)
  const proceduralBandWidth = $derived(
    proceduralBand ? Math.max(3, frameToX(proceduralBand.toFrame) - proceduralBandLeft) : 0,
  )
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative h-full border-l border-border/60 overflow-hidden"
  onpointerdown={(event) => onRowPointerDown(property, event)}
>
  <div
    data-motion-viewport-surface
    data-motion-viewport-edge-inset={KEYFRAME_EDGE_INSET}
    data-motion-viewport-axis-width={axisWidth}
    class="absolute inset-0"
  >
    <div
      aria-hidden="true"
      data-motion-grid-frames={ticks.join(',')}
      class="pointer-events-none absolute inset-y-0 w-px bg-current text-border/30"
      style:left="{gridLineStyle.left}px"
      style:box-shadow={gridLineStyle.boxShadow}
    ></div>

    {#each transitionBlockedRanges as range, index (`${property}-${index}-${range.start}-${range.end}`)}
      <div
        data-dopesheet-from-frame={range.start}
        data-dopesheet-to-frame={range.end}
        class="absolute inset-y-0 bg-destructive/10 border-x border-destructive/20 pointer-events-none"
        style:left="{frameToX(range.start)}px"
        style:width="{frameToX(range.end) - frameToX(range.start)}px"
      ></div>
    {/each}

    <div data-motion-span-drag-visual class="absolute inset-0">
      {#if proceduralBand}
        <!-- A non-keyframe band marking that a property is driven by a procedural
             motion generator over a frame range. Sky-tinted to match the timeline
             Waves cue. -->
        <div
          data-testid="procedural-band-{proceduralBand.property}"
          data-from-frame={proceduralBand.fromFrame}
          data-to-frame={proceduralBand.toFrame}
          data-dopesheet-from-frame={proceduralBand.fromFrame}
          data-dopesheet-to-frame={proceduralBand.toFrame}
          data-dopesheet-min-width={3}
          class="pointer-events-none absolute top-1/2 z-0 h-2 -translate-y-1/2 overflow-hidden rounded-sm border border-sky-400/40 bg-sky-400/10"
          style:left="{proceduralBandLeft}px"
          style:width="{proceduralBandWidth}px"
          style:background-image={PROCEDURAL_HATCH}
          title={t('timeline.keyframeEditor.proceduralBand')}
        ></div>
      {/if}

      {#each connectorSegments as segment (segment.key)}
        <div
          data-testid="keyframe-connector"
          data-motion-item-id={itemId}
          data-motion-connector-from-keyframe-id={segment.fromKeyframeId}
          data-motion-connector-to-keyframe-id={segment.toKeyframeId}
          data-dopesheet-from-frame={segment.fromFrame}
          data-dopesheet-to-frame={segment.toFrame}
          class={cn(
            'pointer-events-none absolute z-0 -translate-y-1/2',
            segment.held ? 'border-t border-dashed border-neutral-500/50' : 'h-px bg-neutral-400/50',
          )}
          style:left="{segment.left}px"
          style:width="{segment.width}px"
          style:top="50%"
        ></div>
      {/each}

      {#if onSegmentEasingChange}
        {#each segmentSpans as span (`seg-${span.from.id}`)}
          <SegmentEasingPopover
            left={span.left}
            width={span.width}
            fromFrame={span.fromFrame}
            toFrame={span.toFrame}
            refs={[{ itemId, property, keyframeId: span.from.id }]}
            easing={span.from.easing}
            easingConfig={span.from.easingConfig}
            held={span.from.easing === 'hold'}
            onChange={onSegmentEasingChange}
            onDragStart={onSegmentDragStart}
            onDragEnd={onSegmentDragEnd}
          />
        {/each}
      {/if}

      {#each keyframes as keyframe (keyframe.id)}
        {@const renderedX = xForKeyframe(keyframe)}
        {#if renderedX !== null}
          {@const selected = selectedKeyframeIds.has(keyframe.id)}
          {@const label = locked
            ? t('timeline.keyframeEditor.keyframeMarker.locked', { frame: keyframe.frame })
            : t('timeline.keyframeEditor.keyframeMarker.rowLabel', { frame: keyframe.frame })}
          <button
            {@attach (node) => {
              const keyframeId = keyframe.id
              setKeyframeButtonRef(keyframeId, node)
              return () => setKeyframeButtonRef(keyframeId, null)
            }}
            type="button"
            data-testid="row-keyframe-{property}-{keyframe.id}"
            data-motion-item-id={itemId}
            data-motion-keyframe-id={keyframe.id}
            data-dopesheet-frame={displayedFrame(keyframe)}
            class={cn(
              'group absolute z-10 flex h-3 w-3 -ml-1.5 -mt-1.5 items-center justify-center',
              !locked && 'cursor-grab active:cursor-grabbing',
              locked && 'cursor-not-allowed opacity-50',
            )}
            style:left="{renderedX}px"
            style:top="50%"
            disabled={locked || disabled}
            onpointerdown={(event) => onKeyframePointerDown(property, keyframe.id, event)}
            onclick={(event) => event.stopPropagation()}
            title={label}
            aria-label={label}
          >
            <span
              class={cn(
                'pointer-events-none block rotate-45 border transition-colors group-data-[marquee-selected=true]:!border-blue-100 group-data-[marquee-selected=true]:!bg-blue-500 group-data-[marquee-selected=true]:!shadow-[0_0_0_1px_rgba(59,130,246,0.45)] group-data-[marquee-selected=false]:!border-transparent group-data-[marquee-selected=false]:!bg-neutral-200 group-data-[marquee-selected=false]:!shadow-none',
                selected
                  ? 'border-blue-100 bg-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.45)]'
                  : 'border-transparent bg-neutral-200 group-hover:bg-white',
              )}
              style:width="{KEYFRAME_DIAMOND_SIDE_PX}px"
              style:height="{KEYFRAME_DIAMOND_SIDE_PX}px"
            ></span>
          </button>
        {/if}
      {/each}
      {#each duplicatePreviews as preview (`preview-${property}-${preview.keyframeId}`)}
        <div
          data-dopesheet-frame={preview.previewFrame}
          class="absolute z-20 flex h-3 w-3 -ml-1.5 -mt-1.5 items-center justify-center pointer-events-none"
          style:left="{preview.renderedX}px"
          style:top="50%"
        >
          <span
            class="block rotate-45 border border-primary/70 bg-primary/70 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
            style:width="{KEYFRAME_DIAMOND_SIDE_PX}px"
            style:height="{KEYFRAME_DIAMOND_SIDE_PX}px"
          ></span>
        </div>
      {/each}
    </div>
  </div>
</div>
