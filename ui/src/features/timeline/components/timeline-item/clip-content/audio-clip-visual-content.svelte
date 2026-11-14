<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useSettingsStore } from '@/features/timeline/deps/settings'
  import { loadClipWaveform } from './lazy-visuals'
  import { WAVEFORM_MIN_WIDTH_PX, type ClipContentProps, type MediaTimelineItem } from './types'
  import { useMediaClipGeometry, useMediaSourceTiming } from './use-media-clip.svelte'

  type Props = Omit<ClipContentProps, 'item'> & { item: MediaTimelineItem & { type: 'audio' } }

  let {
    item,
    clipLeftFrames,
    clipWidthFrames,
    fps,
    preferImmediateRendering = false,
    audioWaveformScale = 1,
  }: Props = $props()

  const showWaveforms = select(useSettingsStore, (s) => s.showWaveforms)
  const geometry = useMediaClipGeometry(() => ({
    clipLeftFrames,
    clipWidthFrames,
    fps,
    preferImmediateRendering,
    minVisualWidthPx: WAVEFORM_MIN_WIDTH_PX,
  }))
  const source = useMediaSourceTiming(
    () => item,
    () => fps,
  )
</script>

{#if geometry.showVisualContent && showWaveforms.current}
  <div class="relative overflow-hidden bg-waveform-gradient flex-1 min-h-0">
    <div
      class="absolute inset-0"
      style:transform={`scaleY(var(--timeline-audio-waveform-scale, ${audioWaveformScale}))`}
      style:transform-origin="50% 50%"
    >
      {#await loadClipWaveform() then ClipWaveform}
        <ClipWaveform
          mediaId={item.mediaId}
          clipWidth={geometry.clipWidth}
          renderWidth={geometry.renderWidth}
          sourceStart={source.sourceStart}
          sourceEnd={source.sourceEnd}
          sourceDuration={source.sourceDuration}
          trimStart={source.trimStart}
          speed={source.speed}
          isReversed={source.isReversed}
          {fps}
          isVisible={geometry.clipVisibility.isVisible}
          visibleStartRatio={geometry.clipVisibility.visibleStartRatio}
          visibleEndRatio={geometry.clipVisibility.visibleEndRatio}
          pixelsPerSecond={geometry.pixelsPerSecond}
          liveTimelineZoom
        />
      {/await}
    </div>
  </div>
{/if}
