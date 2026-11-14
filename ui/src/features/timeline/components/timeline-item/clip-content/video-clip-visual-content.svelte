<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useSettingsStore } from '@/features/timeline/deps/settings'
  import { loadClipFilmstrip } from './lazy-visuals'
  import { FILMSTRIP_MIN_WIDTH_PX, type ClipContentProps, type MediaTimelineItem } from './types'
  import { useMediaClipGeometry, useMediaSourceTiming } from './use-media-clip.svelte'

  type Props = Omit<ClipContentProps, 'item'> & { item: MediaTimelineItem & { type: 'video' } }

  let { item, clipLeftFrames, clipWidthFrames, fps, preferImmediateRendering = false }: Props =
    $props()

  const showVideoFilmstrips = select(
    useSettingsStore,
    (s) => s.showFilmstrips && s.enableFilmstripExtraction,
  )
  const geometry = useMediaClipGeometry(() => ({
    clipLeftFrames,
    clipWidthFrames,
    fps,
    preferImmediateRendering,
    minVisualWidthPx: FILMSTRIP_MIN_WIDTH_PX,
  }))
  const source = useMediaSourceTiming(
    () => item,
    () => fps,
  )
</script>

{#if geometry.showVisualContent && showVideoFilmstrips.current}
  <div class="relative overflow-hidden flex-1 min-h-0">
    {#await loadClipFilmstrip() then ClipFilmstrip}
      <ClipFilmstrip
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
        {preferImmediateRendering}
      />
    {/await}
  </div>
{/if}
