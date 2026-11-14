<!-- SPDX-License-Identifier: MIT -->
<!--
  Custom GIF Player

  Pre-extracts GIF frames for:
  - Lag-free scrubbing via O(1) frame lookup
  - Memory-efficient caching
  - IndexedDB persistence
-->
<script lang="ts">
  import { AbsoluteFill, useSequenceContext } from '@/runtime/composition-runtime/deps/player'
  import { useVideoConfig } from '../../hooks/use-player-compat.svelte'
  import { useGifFrames } from '@/runtime/composition-runtime/deps/timeline-ui'
  import GifCanvas from './gif-canvas.svelte'

  let {
    mediaId,
    src,
    fit = 'cover',
    playbackRate = 1,
    loopBehavior = 'loop',
    format = 'gif',
    style,
  }: {
    /** Media ID for cache lookup */
    mediaId: string
    /** Blob URL for the GIF file */
    src: string
    /** How to fit the GIF within the container */
    fit?: 'cover' | 'contain' | 'fill'
    /** Playback speed multiplier */
    playbackRate?: number
    /** Loop behavior */
    loopBehavior?: 'loop' | 'pause-at-end'
    /** Image format — determines extraction method */
    format?: 'gif' | 'webp'
    /** Additional styles */
    style?: string
  } = $props()

  // Get local frame from Sequence context (0-based within this Sequence)
  const sequenceContext = useSequenceContext()
  const currentFrame = $derived(sequenceContext?.localFrame ?? 0)
  const videoConfig = useVideoConfig()

  const gif = useGifFrames(() => ({
    mediaId,
    blobUrl: src,
    isVisible: true,
    enabled: true,
    format,
  }))

  // Calculate which GIF frame to show based on current timeline frame
  const gifFrame = $derived.by(() => {
    const frames = gif.frames
    const totalDuration = gif.totalDuration
    if (!frames || frames.length === 0 || !totalDuration) {
      return null
    }

    // Convert timeline frame to milliseconds
    const timeMs = (currentFrame / videoConfig.fps) * 1000 * playbackRate

    // Handle loop behavior
    let effectiveTimeMs: number
    if (loopBehavior === 'loop') {
      effectiveTimeMs = timeMs % totalDuration
    } else {
      // Pause at end - clamp to last frame
      effectiveTimeMs = Math.min(timeMs, totalDuration - 1)
    }

    return gif.getFrameAtTime(effectiveTimeMs)
  })
  const formatLabel = $derived(format === 'webp' ? 'WebP' : 'GIF')
</script>

{#if gif.isLoading || !gif.isComplete || !gif.frames || gif.frames.length === 0}
  <!-- Loading state -->
  <AbsoluteFill
    style="background-color: #1a1a1a; display: flex; align-items: center; justify-content: center;{style
      ? ` ${style}`
      : ''}"
  >
    {#if gif.error}
      <span style="color: #ff6b6b; font-size: 14px;">{formatLabel} load failed</span>
    {:else}
      <span style="color: #666; font-size: 14px;">Loading {formatLabel}...</span>
    {/if}
  </AbsoluteFill>
{:else}
  <AbsoluteFill {style}>
    <GifCanvas frame={gifFrame} {fit} />
  </AbsoluteFill>
{/if}
