<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { previewScrubberSuppressRef } from './preview-scrubber-suppress'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'

  const MAIN_TIMELINE_SKIMMER_SUPPRESS_REFS = [previewScrubberSuppressRef]
  const timelinePreviewScrubberZoomSignal = {
    subscribe(listener: () => void): () => void {
      return useZoomStore.subscribe((state, previousState) => {
        if (state.pixelsPerSecond !== previousState.pixelsPerSecond) listener()
      })
    },
  }
</script>

<script lang="ts">
  import TimelinePreviewScrubberVisual from '@/shared/ui/timeline-preview-scrubber-visual.svelte'
  import { timelineSkimmerScrubSignal } from '@/shared/timeline/main-timeline-scrub'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { frameToPixelsNow } from '@/features/timeline/utils/zoom-conversions'
  import { select } from '$lib/store.svelte'
  import { IO_LANE_HEIGHT } from './timeline-markers'

  interface TimelinePreviewScrubberProps {
    inRuler?: boolean
    maxFrame?: number
    zIndex?: number
  }

  /** Main timeline adapter for the shared preview scrubber visual. */
  let { inRuler = false, maxFrame, zIndex }: TimelinePreviewScrubberProps = $props()

  const fps = select(useTimelineSettingsStore, (state) => state.fps)
</script>

<TimelinePreviewScrubberVisual
  frameToPixels={frameToPixelsNow}
  fps={fps.current}
  {inRuler}
  {maxFrame}
  rulerOffset={IO_LANE_HEIGHT}
  repositionSignal={timelinePreviewScrubberZoomSignal}
  suppressRefs={MAIN_TIMELINE_SKIMMER_SUPPRESS_REFS}
  suppressSignal={timelineSkimmerScrubSignal}
  {zIndex}
/>
