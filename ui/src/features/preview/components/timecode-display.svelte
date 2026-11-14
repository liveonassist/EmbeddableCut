<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { getResolvedPlaybackFrame, usePlaybackStore } from '@/shared/state/playback'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'

  interface TimecodeDisplayProps {
    fps: number
    totalFrames: number
  }

  let { fps, totalFrames }: TimecodeDisplayProps = $props()
  let showFrames = $state.raw(false)
  const setShowFrames = (next: typeof showFrames | ((prev: typeof showFrames) => typeof showFrames)) => {
    showFrames = typeof next === 'function' ? (next as (prev: typeof showFrames) => typeof showFrames)(untrack(() => showFrames)) : next
  }
  const currentTimeRef: { current: HTMLSpanElement | null } = { current: null }
  const frameDigits = $derived(Math.max(totalFrames.toString().length, 1))
  const lastFrame = $derived(Math.max(0, totalFrames - 1))
  const timecodeDigits = $derived(formatTimecodeCompact(lastFrame, fps).length)
  const reservedCharWidth = $derived(Math.max(frameDigits, timecodeDigits))
  const reservedDisplayWidth = $derived(`calc(${reservedCharWidth * 2 + 1}ch + 0.75rem)`)

  // Use refs for values accessed in subscription to avoid stale closures
  const showFramesRef = { current: showFrames }
  $effect.pre(() => {
    showFramesRef.current = showFrames
  })
  const fpsRef = { current: fps }
  $effect.pre(() => {
    fpsRef.current = fps
  })
  const totalFramesRef = { current: totalFrames }
  $effect.pre(() => {
    totalFramesRef.current = totalFrames
  })

  // Format frame number with padding based on total frames to prevent layout shift
  const formatFrameNumber = (frame: number) => {
    const maxDigits = Math.max(totalFramesRef.current.toString().length, 1)
    return frame.toString().padStart(maxDigits, '0')
  }

  const getVisibleFrame = () => {
    const playbackState = usePlaybackStore.getState()
    return getResolvedPlaybackFrame({
      currentFrame: playbackState.currentFrame,
      currentFrameEpoch: playbackState.currentFrameEpoch,
      previewFrame: playbackState.previewFrame,
      previewFrameEpoch: playbackState.previewFrameEpoch,
      isPlaying: playbackState.isPlaying,
      displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
    })
  }

  // Subscribe to the resolved visible preview frame and update DOM directly
  // (no React re-renders during playback/scrub).
  $effect(() => {
    const updateDisplay = (frame: number) => {
      if (!currentTimeRef.current) return
      currentTimeRef.current.textContent = showFramesRef.current
        ? formatFrameNumber(frame)
        : formatTimecodeCompact(frame, fpsRef.current)
    }

    // Initial update
    updateDisplay(getVisibleFrame())

    const syncDisplay = () => {
      updateDisplay(getVisibleFrame())
    }

    const unsubscribePlayback = usePlaybackStore.subscribe(syncDisplay)
    const unsubscribePreviewBridge = usePreviewBridgeStore.subscribe(syncDisplay)

    return () => {
      unsubscribePlayback()
      unsubscribePreviewBridge()
    }
  })

  // Update display when showFrames or fps changes (rare - can trigger re-render)
  $effect(() => {
    if (!currentTimeRef.current) return
    const frame = getVisibleFrame()
    currentTimeRef.current.textContent = showFrames
      ? formatFrameNumber(frame)
      : formatTimecodeCompact(frame, fps)
  })
</script>

<button
  type="button"
  class="inline-flex items-center gap-1.5 bg-transparent p-0 font-mono text-[11px] tabular-nums text-left transition-colors select-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
  style:width={reservedDisplayWidth}
  onclick={() => setShowFrames((prev) => !prev)}
>
  <!-- Filled imperatively by the effects above, so Svelte owns no text in it. -->
  <span bind:this={currentTimeRef.current} class="text-primary font-semibold"></span>
  <span class="text-muted-foreground">/</span>
  <span>
    {#if showFrames}
      {formatFrameNumber(lastFrame)}
    {:else}
      {formatTimecodeCompact(lastFrame, fps)}
    {/if}
  </span>
</button>
