<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import type { CompositionVisualSegment } from '@/features/timeline/utils/composition-clip-summary'
  import { loadClipFilmstrip } from './lazy-visuals'
  import { FILMSTRIP_MIN_WIDTH_PX } from './types'

  interface Props {
    segment: CompositionVisualSegment
    wrapperDurationFrames: number
    wrapperClipWidthPx: number
    wrapperRenderWidthPx: number
    wrapperVisibleStartRatio: number
    wrapperVisibleEndRatio: number
    wrapperIsVisible: boolean
    fps: number
    pixelsPerSecond: number
    preferImmediateRendering: boolean
    isReversed?: boolean
  }

  let {
    segment,
    wrapperDurationFrames,
    wrapperClipWidthPx,
    wrapperRenderWidthPx,
    wrapperVisibleStartRatio,
    wrapperVisibleEndRatio,
    wrapperIsVisible,
    fps,
    pixelsPerSecond,
    preferImmediateRendering,
    isReversed = false,
  }: Props = $props()

  const mediaId = $derived(segment.mediaId)
  const mediaFps = $derived.by(() => {
    const id = mediaId
    const sourceFps = segment.sourceFps
    return select(useMediaLibraryStore, (s) => s.mediaById[id]?.fps || sourceFps)
  })
  const mediaDuration = $derived.by(() => {
    const id = mediaId
    return select(useMediaLibraryStore, (s) => s.mediaById[id]?.duration || 0)
  })

  const wrapperSpan = $derived(Math.max(1, wrapperDurationFrames))
  const widthFraction = $derived(Math.min(1, segment.durationInFrames / wrapperSpan))
  const leftFraction = $derived(Math.max(0, segment.from / wrapperSpan))
  const segmentClipWidth = $derived(Math.max(0, widthFraction * wrapperClipWidthPx))
  const segmentRenderWidth = $derived(Math.max(0, widthFraction * wrapperRenderWidthPx))

  const sourceDurationSeconds = $derived(
    mediaDuration.current > 0
      ? mediaDuration.current
      : segment.sourceDurationFrames / Math.max(1, mediaFps.current),
  )
  const sourceStartSeconds = $derived(
    mediaDuration.current > 0 && segment.sourceDurationFrames > 0
      ? (segment.sourceStart / segment.sourceDurationFrames) * mediaDuration.current
      : segment.sourceStart / Math.max(1, mediaFps.current),
  )
  const sourceEndSeconds = $derived(
    sourceStartSeconds + (segment.durationInFrames / Math.max(1, fps)) * segment.speed,
  )

  const segmentEndFraction = $derived(leftFraction + widthFraction)
  const overlapStart = $derived(Math.max(wrapperVisibleStartRatio, leftFraction))
  const overlapEnd = $derived(Math.min(wrapperVisibleEndRatio, segmentEndFraction))
  const hasOverlap = $derived(overlapEnd > overlapStart && widthFraction > 0)
  const segmentVisibleStartRatio = $derived(
    hasOverlap ? Math.max(0, Math.min(1, (overlapStart - leftFraction) / widthFraction)) : 0,
  )
  const segmentVisibleEndRatio = $derived(
    hasOverlap ? Math.max(0, Math.min(1, (overlapEnd - leftFraction) / widthFraction)) : 0,
  )
  const segmentIsVisible = $derived(wrapperIsVisible && hasOverlap)
</script>

{#if segmentClipWidth >= FILMSTRIP_MIN_WIDTH_PX}
  <div
    data-filmstrip-timeline-segment="true"
    class="absolute inset-y-0 overflow-hidden"
    style:left={`${leftFraction * 100}%`}
    style:width={`${widthFraction * 100}%`}
  >
    {#await loadClipFilmstrip() then ClipFilmstrip}
      <ClipFilmstrip
        {mediaId}
        clipWidth={segmentClipWidth}
        renderWidth={segmentRenderWidth}
        sourceStart={sourceStartSeconds}
        sourceEnd={sourceEndSeconds}
        sourceDuration={sourceDurationSeconds}
        trimStart={0}
        speed={segment.speed}
        {isReversed}
        {fps}
        isVisible={segmentIsVisible}
        visibleStartRatio={segmentVisibleStartRatio}
        visibleEndRatio={segmentVisibleEndRatio}
        {pixelsPerSecond}
        {preferImmediateRendering}
      />
    {/await}
  </div>
{/if}
