<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { DEFAULT_SPEED, getSafeTrimBefore, timelineToSourceFrames } from '@/runtime/composition-runtime/deps/timeline'
  import { useMediaLibraryStore } from '@/runtime/composition-runtime/deps/stores'
  import { appendResolvedAudioEqSources, getAudioEqSettings } from '@/shared/utils/audio-eq'
  import { resolveReverseConformedVideoItem } from '@/shared/utils/reverse-conform-item'
  import { useVideoConfig } from '../../hooks/use-player-compat.svelte'
  import { useNestedMediaResolutionMode } from '../../contexts/nested-media-resolution-context'
  import { useStoreSelector } from '../../../use-sync-external-store.svelte'
  import { VideoContent } from '../video-content'
  import type { StableVideoSequenceItem } from './types'

  let props: { item: StableVideoSequenceItem } = $props()

  const videoConfig = useVideoConfig()
  const nestedMediaResolutionMode = useNestedMediaResolutionMode()
  const item = $derived(
    resolveReverseConformedVideoItem(props.item, videoConfig.fps, {
      useProxy: nestedMediaResolutionMode.current === 'proxy',
    }),
  )
  const mediaSourceFps = useStoreSelector(useMediaLibraryStore, (s) =>
    item.mediaId ? s.mediaById[item.mediaId]?.fps : undefined,
  )

  const audioEqStages = $derived(
    appendResolvedAudioEqSources(undefined, item.trackAudioEq, getAudioEqSettings(item)),
  )

  const timing = $derived.by(() => {
    const fps = videoConfig.fps
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0
    const sourceFps = item.sourceFps ?? mediaSourceFps.current ?? fps
    const playbackRate = item.speed ?? DEFAULT_SPEED
    const sourceFramesNeeded = timelineToSourceFrames(
      item.durationInFrames,
      playbackRate,
      fps,
      sourceFps,
    )
    const reverseSourceEnd = item.sourceEnd ?? trimBefore + sourceFramesNeeded
    const safeTrimBefore = getSafeTrimBefore(
      trimBefore,
      item.durationInFrames,
      playbackRate,
      item.sourceDuration || undefined,
      fps,
      sourceFps,
    )
    return { sourceFps, playbackRate, reverseSourceEnd, safeTrimBefore }
  })
</script>

{#if item.src}
  <div
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; visibility: hidden; pointer-events: none;"
    data-shadow-bridge={item.id}
  >
    <VideoContent
      {item}
      muted={true}
      safeTrimBefore={timing.safeTrimBefore}
      playbackRate={timing.playbackRate}
      sourceFps={timing.sourceFps}
      isReversed={item.isReversed === true}
      reverseSourceEnd={timing.reverseSourceEnd}
      {audioEqStages}
    />
  </div>
{/if}
