<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { usePlayerEmitter } from '../event-emitter'
  import { useBridgedTimelinePlayback, useClock } from '../clock'
  import { usePlayer } from '../use-player.svelte'
  import { calculatePlayerContentLayout } from '@/runtime/player/player-layout'
  import DefaultControls from './DefaultControls.svelte'
  import type { PlayerProps } from './types'

  let {
    children,
    durationInFrames,
    fps,
    initialFrame = 0,
    loop = false,
    controls = true,
    autoPlay = false,
    class: className,
    style,
    width = 1280,
    height = 720,
    layoutSize,
    onEnded,
    onFrameChange,
    onPlayStateChange,
    ref = $bindable(null),
  }: PlayerProps = $props()

  let isFullscreen = $state(false)
  let container = $state<HTMLDivElement | null>(null)
  let contentHost = $state<HTMLDivElement | null>(null)
  let contentScale = $state<HTMLDivElement | null>(null)

  // Measure container size for scaling. Apply layout imperatively to avoid
  // re-rendering the entire composition tree on every resize step.
  function updateScaledLayout() {
    if (!container || !contentHost || !contentScale) return

    const containerRect = container.getBoundingClientRect()
    const measuredWidth = containerRect.width || container.clientWidth
    const measuredHeight = containerRect.height || container.clientHeight
    const containerWidth = layoutSize?.width ?? measuredWidth
    const containerHeight = layoutSize?.height ?? measuredHeight
    const layout = calculatePlayerContentLayout(containerWidth, containerHeight, width, height)

    contentHost.style.width = `${layout.width}px`
    contentHost.style.height = `${layout.height}px`
    contentHost.style.marginLeft = `${-layout.width / 2}px`
    contentHost.style.marginTop = `${-layout.height / 2}px`

    contentScale.style.width = `${width}px`
    contentScale.style.height = `${height}px`
    contentScale.style.transform = `scale(${layout.scaleX}, ${layout.scaleY})`
  }

  $effect(() => {
    const observed = container
    if (!observed) return
    // Re-measure (and re-observe) when the layout inputs change.
    void [width, height, layoutSize?.width, layoutSize?.height]

    let rafId: number | null = null
    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateScaledLayout()
      })
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(observed)

    // Initial measurement
    untrack(updateScaledLayout)

    return () => {
      observer.disconnect()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  })

  // Get player methods
  const player = usePlayer(
    () => durationInFrames,
    () => ({ loop, onEnded }),
  )

  // Play transport state only — the frame stays out of this component's
  // reactive graph so a clock tick cannot re-run the player shell.
  const playback = useBridgedTimelinePlayback()
  const clock = useClock()
  const emitter = usePlayerEmitter()

  // Sync initial frame — ONCE on mount only. The Clock is already created with
  // `initialFrame` (see ClockBridgeProvider), so this is a belt-and-suspenders
  // catch for the rare case it started at 0. It must NOT depend on the current
  // frame: doing so re-fires this seek every time the clock later reaches
  // frame 0 (e.g. pressing "Go To Start"), yanking the playhead back to the
  // stale mount-time `initialFrame`.
  let hasSyncedInitialFrame = false
  $effect(() => {
    untrack(() => {
      if (hasSyncedInitialFrame) return
      hasSyncedInitialFrame = true
      if (initialFrame > 0 && player.getCurrentFrame() === 0) {
        player.seek(initialFrame)
      }
    })
  })

  // Sync autoPlay
  $effect(() => {
    if (autoPlay && !playback.playing) {
      untrack(() => player.play())
    }
  })

  // Handle frame changes imperatively. Delivering them through a reactive
  // read would re-run the player shell per clock tick.
  $effect(() => {
    const handler = onFrameChange
    untrack(() => handler?.(clock.currentFrame))
    return clock.onFrameChange((frame) => handler?.(frame))
  })

  // Handle play state changes
  $effect(() => {
    const playing = playback.playing
    const handler = onPlayStateChange
    untrack(() => handler?.(playing))
  })

  // Fullscreen handling
  async function toggleFullscreen() {
    if (!container) return

    if (!document.fullscreenElement) {
      await container.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // Listen for fullscreen changes
  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  })

  // Expose imperative API
  ref = {
    play: () => player.play(),
    pause: () => player.pause(),
    toggle: () => player.toggle(),
    seekTo: (frame: number) => player.seek(frame),
    getCurrentFrame: () => player.getCurrentFrame(),
    isPlaying: () => player.isPlaying(),
    getPlaybackRate: () => player.getPlaybackRate(),
    setPlaybackRate: (rate: number) => player.setPlaybackRate(rate),
    addEventListener: (event, callback) => {
      emitter.addEventListener(event, callback)
    },
    removeEventListener: (event, callback) => {
      emitter.removeEventListener(event, callback)
    },
  }
</script>

<div
  bind:this={container}
  class="relative bg-black {className || ''}"
  style="{style ? `${style}; ` : ''}overflow: hidden;"
  data-player-container
>
  <!-- Video content - canvas rendered at native size, scaled to fit via CSS -->
  <div
    bind:this={contentHost}
    style:position="absolute"
    style:left="50%"
    style:top="50%"
    style:width="{width}px"
    style:height="{height}px"
    style:margin-left="{-width / 2}px"
    style:margin-top="{-height / 2}px"
    style:overflow="hidden"
  >
    <div
      bind:this={contentScale}
      style:width="{width}px"
      style:height="{height}px"
      style:transform="scale(1)"
      style:transform-origin="top left"
    >
      {@render children()}
    </div>
  </div>

  <!-- Controls overlay -->
  {#if controls}
    <!-- Click to play/pause overlay - behind controls -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="absolute inset-0 cursor-pointer" onclick={() => player.toggle()}></div>

    <!-- Controls - on top so scrubber/buttons receive clicks -->
    <DefaultControls
      isPlaying={playback.playing}
      {durationInFrames}
      {fps}
      playbackRate={playback.playbackRate}
      {isFullscreen}
      onTogglePlay={player.toggle}
      onSeek={player.seek}
      onPlaybackRateChange={playback.setPlaybackRate}
      onToggleFullscreen={toggleFullscreen}
    />
  {/if}
</div>
