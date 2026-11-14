<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useClockFrame } from '../clock'
  import DefaultPlayPauseButton from './DefaultPlayPauseButton.svelte'
  import DefaultProgressBar from './DefaultProgressBar.svelte'

  let {
    isPlaying,
    durationInFrames,
    fps,
    playbackRate,
    isFullscreen,
    onTogglePlay,
    onSeek,
    onPlaybackRateChange,
    onToggleFullscreen,
  }: {
    isPlaying: boolean
    durationInFrames: number
    fps: number
    playbackRate: number
    isFullscreen: boolean
    onTogglePlay: () => void
    onSeek: (frame: number) => void
    onPlaybackRateChange: (rate: number) => void
    onToggleFullscreen: () => void
  } = $props()

  // Subscribe the controls (not the whole player shell) to frame ticks.
  const currentFrame = useClockFrame()

  const formatTime = (frame: number) => {
    const seconds = frame / fps
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
</script>

<div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
  <div class="mb-3">
    <DefaultProgressBar currentFrame={currentFrame.current} {durationInFrames} seek={onSeek} />
  </div>

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <DefaultPlayPauseButton {isPlaying} onToggle={onTogglePlay} />

      <span class="text-sm text-white ml-2"
        >{formatTime(currentFrame.current)} / {formatTime(durationInFrames - 1)}</span
      >
    </div>

    <div class="flex items-center gap-2">
      <select
        value={String(playbackRate)}
        onchange={(event) => {
          onPlaybackRateChange(Number(event.currentTarget.value))
        }}
        class="bg-transparent text-sm text-white border border-white/30 rounded px-2 py-1"
        aria-label="Playback rate"
      >
        <option value="0.5">0.5x</option>
        <option value="1">1x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      </select>

      <button
        onclick={onToggleFullscreen}
        class="p-2 rounded-full hover:bg-white/20 transition-colors"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {#if isFullscreen}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
            />
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>
