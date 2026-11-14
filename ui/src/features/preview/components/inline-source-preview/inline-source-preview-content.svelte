<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">

  interface InlineSourcePreviewProps {
    mediaId: string
    seekFrame: number | null
    containerSize: {
      width: number
      height: number
    }
  }


</script>

<script lang="ts">
  import InlineSourcePreviewClockSync from './inline-source-preview-clock-sync.svelte'
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { PlayerEmitterProvider, ClockBridgeProvider, VideoConfigProvider } from '@/features/preview/deps/player-context'
  import { useMediaLibraryStore, getMediaType } from '@/features/preview/deps/media-library'
  import { resolveMediaUrl } from '@/features/preview/utils/media-resolver'
  import { SourceComposition } from '../source-composition'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { getPreviewNeedsOverflow, getPreviewPlayerSize } from '@/features/preview/utils/preview-pixel-snap'
  let { mediaId, seekFrame, containerSize }: InlineSourcePreviewProps = $props()
  let blobUrl = $state.raw('')
  const setBlobUrl = (next: typeof blobUrl | ((prev: typeof blobUrl) => typeof blobUrl)) => {
    blobUrl = typeof next === 'function' ? (next as (prev: typeof blobUrl) => typeof blobUrl)(untrack(() => blobUrl)) : next
  }
  const media = selectDerived(useMediaLibraryStore, (s) => s.mediaById[mediaId])
  const zoom = select(usePlaybackStore, (s) => s.zoom)
  const mediaWidth = $derived(media.current?.width || 640)
  const mediaHeight = $derived(media.current?.height || 360)

  $effect(() => {
    let cancelled = false
    setBlobUrl('')

    resolveMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) {
          setBlobUrl(url)
        }
      })
      .catch(() => {
        // Resolution failures are already logged upstream.
      })

    return () => {
      cancelled = true
    }
  })

  const containerWidth = $derived(containerSize.width)
  const containerHeight = $derived(containerSize.height)
  const playerSize = $derived.by(() =>
      getPreviewPlayerSize({
        sourceSize: { width: mediaWidth, height: mediaHeight },
        containerSize: { width: containerWidth, height: containerHeight },
        zoom: zoom.current,
      }))

  const needsOverflow = $derived.by(() => getPreviewNeedsOverflow({ playerSize, containerSize, zoom: zoom.current }))

  const mediaType = $derived(getMediaType(media.current!.mimeType))

  const fps = $derived(media.current!.fps || 30)
  const durationInFrames = $derived(mediaType === 'image' ? 1 : Math.max(1, Math.round(media.current!.duration * fps)))
</script>

{#if !media.current}
  <div
    class="w-full h-full bg-video-preview-background flex items-center justify-center text-sm text-muted-foreground"
  >
    Loading media...
  </div>
{:else if mediaType !== 'unknown'}
  <div
    class="w-full h-full bg-video-preview-background relative"
    style:overflow={needsOverflow ? 'auto' : 'visible'}
    aria-label="Inline media preview"
  >
    <div
      class="min-w-full min-h-full grid place-items-center"
      style:padding={`calc(${EDITOR_LAYOUT_CSS_VALUES.previewPadding} / 2)`}
    >
      <div class="relative">
        <div
          class="relative shadow-2xl overflow-hidden"
          style:width={`${playerSize.width}px`}
          style:height={`${playerSize.height}px`}
          style:outline="2px solid hsl(var(--border))"
          style:outline-offset="0"
        >
          {#if blobUrl}
            <PlayerEmitterProvider>
              <ClockBridgeProvider
                fps={fps}
                durationInFrames={durationInFrames}
                initialFrame={seekFrame ?? 0}
                onVolumeChange={() => {}}
              >
                <VideoConfigProvider
                  fps={fps}
                  width={mediaWidth}
                  height={mediaHeight}
                  durationInFrames={durationInFrames}
                >
                  <InlineSourcePreviewClockSync frame={seekFrame} />
                  <SourceComposition
                    mediaId={mediaId}
                    src={blobUrl}
                    mediaType={mediaType}
                    pausedFrameSource="clock"
                    forceFastScrub={seekFrame !== null}
                   />
                </VideoConfigProvider>
              </ClockBridgeProvider>
            </PlayerEmitterProvider>
          {:else}
            <div
              class="w-full h-full flex items-center justify-center text-sm text-muted-foreground"
            >
              Loading media...
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
