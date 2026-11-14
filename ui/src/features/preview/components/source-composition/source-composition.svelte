<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import LottieSource from './lottie-source.svelte'
  import VideoSource from './video-source.svelte'
  import ImageSource from './image-source.svelte'
  import AudioSource from './audio-source.svelte'

  interface SourceCompositionProps {
    mediaId?: string
    src: string
    mediaType: 'video' | 'audio' | 'image' | 'lottie'
    pausedFrameSource?: 'clock' | 'source-player'
    forceFastScrub?: boolean
  }

  let { mediaId, src, mediaType, pausedFrameSource = 'source-player', forceFastScrub = false }: SourceCompositionProps = $props()
</script>

{#if mediaType === 'video'}
  <VideoSource
    mediaId={mediaId}
    src={src}
    pausedFrameSource={pausedFrameSource}
    forceFastScrub={forceFastScrub}
   />
{:else if mediaType === 'image'}
  <ImageSource src={src} />
{:else if mediaType === 'lottie'}
  <LottieSource src={src} />
{:else}
  <AudioSource mediaId={mediaId} src={src} />
{/if}
