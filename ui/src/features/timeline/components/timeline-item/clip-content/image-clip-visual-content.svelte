<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useSettingsStore } from '@/features/timeline/deps/settings'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import { isGifUrl, isWebpUrl } from '@/shared/utils/media-utils'
  import { loadImageFilmstrip } from './lazy-visuals'
  import { FILMSTRIP_MIN_WIDTH_PX, type ClipContentProps, type MediaTimelineItem } from './types'
  import { useMediaClipGeometry, useMediaSourceTiming } from './use-media-clip.svelte'

  type Props = Omit<ClipContentProps, 'item'> & { item: MediaTimelineItem & { type: 'image' } }

  let { item, clipLeftFrames, clipWidthFrames, fps, preferImmediateRendering = false }: Props =
    $props()

  const showFilmstrips = select(useSettingsStore, (s) => s.showFilmstrips)
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
  // Read once per item, without a media-library subscription, as FreeCut does.
  const mediaMimeType = $derived(useMediaLibraryStore.getState().mediaById[item.mediaId]?.mimeType)
  const isAnimatedGif = $derived(mediaMimeType === 'image/gif' || isGifUrl(item.src))
  const isAnimatedWebp = $derived(mediaMimeType === 'image/webp' || isWebpUrl(item.src))
</script>

{#if geometry.showVisualContent && showFilmstrips.current}
  <div class="relative overflow-hidden flex-1 min-h-0">
    {#await loadImageFilmstrip() then ImageFilmstrip}
      <ImageFilmstrip
        mediaId={item.mediaId}
        isAnimated={isAnimatedGif || isAnimatedWebp}
        animationFormat={isAnimatedWebp ? 'webp' : 'gif'}
        clipWidth={geometry.clipWidth}
        renderWidth={geometry.renderWidth}
        isVisible={geometry.clipVisibility.isVisible}
        src={item.src}
        sourceStart={source.sourceStart}
        sourceDuration={source.sourceDuration}
        trimStart={source.trimStart}
        speed={source.speed}
        {fps}
        visibleStartRatio={geometry.clipVisibility.visibleStartRatio}
        visibleEndRatio={geometry.clipVisibility.visibleEndRatio}
        pixelsPerSecond={geometry.pixelsPerSecond}
      />
    {/await}
  </div>
{/if}
