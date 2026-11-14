<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import DopesheetPlayheadLine from './dopesheet-playhead-line.svelte'
  import TimelinePreviewScrubberVisual from '@/shared/ui/timeline-preview-scrubber-visual.svelte'
  import { timelineSkimmerScrubSignal } from '@/shared/timeline/main-timeline-scrub'
  import type { DopesheetPlayheadOverlayProps } from './dopesheet-playhead-overlays'

  /**
   * Playhead overlay for a dopesheet pane. `sheet`/`split` share the GPU playhead
   * line (differing only in stacking/positioning); `skim` shows the preview
   * scrubber visual instead.
   */
  let {
    variant,
    left,
    playheadFrame,
    currentFrame,
    itemFrom,
    totalFrames,
    clampToItemBounds,
    followPreviewFrame,
    localScrubActiveRef,
    localScrubHandoffFrameRef,
    frameToX,
    globalFrameToX,
    positionSyncTargetRef,
    maxLeft,
    fps,
    isRulerScrubbing,
  }: DopesheetPlayheadOverlayProps = $props()

  const isSplit = $derived(variant === 'split')
</script>

{#if variant === 'skim'}
  <div
    class="pointer-events-none absolute bottom-0 right-0 top-0 z-[19] overflow-hidden"
    style:left="{left}px"
  >
    <TimelinePreviewScrubberVisual
      frameToPixels={globalFrameToX ?? ((globalFrame) => frameToX(globalFrame - itemFrom))}
      {fps}
      inRuler
      rulerOffset={0}
      showTooltip={false}
      suppressed={isRulerScrubbing}
      suppressRefs={[localScrubActiveRef]}
      suppressSignal={timelineSkimmerScrubSignal}
      positionSyncTarget={positionSyncTargetRef?.current}
    />
  </div>
{:else}
  <div
    data-testid="dopesheet-playhead-clip"
    class={isSplit
      ? 'absolute top-0 right-0 bottom-0 overflow-hidden pointer-events-none z-30'
      : 'absolute top-0 bottom-0 right-0 overflow-hidden pointer-events-none z-20'}
    style:left="{left}px"
  >
    <DopesheetPlayheadLine
      relativeFrame={playheadFrame ?? currentFrame}
      {itemFrom}
      {totalFrames}
      {clampToItemBounds}
      {followPreviewFrame}
      {localScrubActiveRef}
      {localScrubHandoffFrameRef}
      {frameToX}
      {globalFrameToX}
      {positionSyncTargetRef}
      {maxLeft}
      class="absolute top-0 bottom-0"
    />
  </div>
{/if}
