<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const log = createLogger('ExportPreviewPlayer')

  function formatMediaTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }
</script>

<script lang="ts">
  import Play from 'lucide-svelte/icons/play'
  import Pause from 'lucide-svelte/icons/pause'
  import Volume2 from 'lucide-svelte/icons/volume-2'
  import VolumeX from 'lucide-svelte/icons/volume-x'
  import Maximize from 'lucide-svelte/icons/maximize'
  import Minimize from 'lucide-svelte/icons/minimize'
  import { Button } from '@/components/ui/button'
  import { Slider } from '@/components/ui/slider'
  import { useMediaPlaybackControls } from '@/shared/media/use-media-playback-controls.svelte'
  import { t } from '$lib/i18n.svelte'

  let { src, isVideo }: { src: string; isVideo: boolean } = $props()

  let media = $state<HTMLVideoElement | HTMLAudioElement | null>(null)
  let container = $state<HTMLDivElement | null>(null)
  let fullscreenElement = $state<Element | null>(document.fullscreenElement)
  let isPlaying = $state(false)
  let currentTime = $state(0)
  let duration = $state(0)
  let volume = $state(0.75)
  let isMuted = $state(false)
  let isSeeking = false

  const isFullscreen = $derived(container !== null && fullscreenElement === container)

  $effect(() => {
    const sync = () => {
      fullscreenElement = document.fullscreenElement
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  })

  const { togglePlay, seekToPercent } = useMediaPlaybackControls(
    () => media,
    () => duration,
    (time) => {
      currentTime = time
    },
  )

  const handleVolumeChange = (values: number[]) => {
    const el = media
    if (!el) return
    const v = (values[0] ?? 75) / 100
    el.volume = v
    volume = v
    if (v > 0 && isMuted) {
      el.muted = false
      isMuted = false
    }
  }

  const toggleMute = () => {
    const el = media
    if (!el) return
    const newMuted = !el.muted
    el.muted = newMuted
    isMuted = newMuted
  }

  const handleFullscreen = () => {
    if (!isVideo) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((error: unknown) => {
        log.warn('Failed to exit fullscreen', { error })
      })
    } else {
      const el = container
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch((error: unknown) => {
          log.warn('Failed to enter fullscreen', { error })
        })
      }
    }
  }

  $effect(() => {
    const el = media
    if (!el) return
    el.volume = volume

    const onPlay = () => (isPlaying = true)
    const onPause = () => (isPlaying = false)
    const onTimeUpdate = () => {
      if (!isSeeking) currentTime = el.currentTime
    }
    const onLoadedMetadata = () => (duration = el.duration)
    const onEnded = () => {
      isPlaying = false
      currentTime = el.duration
    }

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('ended', onEnded)

    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('ended', onEnded)
    }
  })

  const progressPercent = $derived(duration > 0 ? (currentTime / duration) * 100 : 0)
</script>

<div
  bind:this={container}
  class="overflow-hidden {isFullscreen
    ? 'flex flex-col h-full w-full bg-preview-letterbox'
    : 'rounded-lg border border-border bg-secondary/30'}"
>
  <!-- Media element -->
  {#if isVideo}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_media_has_caption -->
    <video
      bind:this={media}
      {src}
      class="w-full object-contain cursor-pointer {isFullscreen
        ? 'flex-1 min-h-0 bg-preview-letterbox'
        : 'max-h-[280px] bg-background'}"
      onclick={togglePlay}
      preload="metadata"
    ></video>
  {:else}
    <div class="flex items-center justify-center py-8 bg-secondary/30">
      <div
        class="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center"
      >
        <Volume2 class="w-7 h-7 text-primary" />
      </div>
      <audio bind:this={media} {src} preload="metadata"></audio>
    </div>
  {/if}

  <!-- Controls bar -->
  <div
    class="flex items-center gap-2 px-3 py-2 {isFullscreen
      ? 'bg-black/80 border-t border-white/10'
      : 'bg-secondary/50 border-t border-border'}"
  >
    <!-- Play/Pause -->
    <Button
      size="icon"
      class="h-8 w-8 glow-primary-sm flex-shrink-0"
      onclick={togglePlay}
      aria-label={isPlaying ? t('preview.player.pause') : t('preview.player.play')}
    >
      {#if isPlaying}
        <Pause class="w-4 h-4" />
      {:else}
        <Play class="w-4 h-4 ml-0.5" />
      {/if}
    </Button>

    <!-- Timecode -->
    <div class="flex items-center gap-1.5 font-mono text-xs tabular-nums flex-shrink-0 select-none">
      <span class="text-primary font-semibold">{formatMediaTime(currentTime)}</span>
      <span class="text-muted-foreground/50">/</span>
      <span class="text-muted-foreground">{formatMediaTime(duration)}</span>
    </div>

    <!-- Seek bar -->
    <Slider
      value={[progressPercent]}
      onValueChange={(values) => {
        isSeeking = true
        seekToPercent(values)
      }}
      onValueCommit={() => (isSeeking = false)}
      max={100}
      step={0.1}
      class="flex-1 min-w-0 py-2"
      aria-label={t('preview.player.seek')}
    />

    <!-- Volume -->
    <div class="flex items-center gap-1 flex-shrink-0">
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        onclick={toggleMute}
        aria-label={isMuted ? t('preview.player.unmute') : t('preview.player.mute')}
      >
        {#if isMuted || volume === 0}
          <VolumeX class="w-3.5 h-3.5" />
        {:else}
          <Volume2 class="w-3.5 h-3.5" />
        {/if}
      </Button>
      <Slider
        value={[isMuted ? 0 : volume * 100]}
        onValueChange={handleVolumeChange}
        max={100}
        step={1}
        class="w-16"
        aria-label={t('preview.player.volume')}
      />
    </div>

    <!-- Fullscreen (video only) -->
    {#if isVideo}
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 flex-shrink-0"
        onclick={handleFullscreen}
        aria-label={isFullscreen ? t('preview.player.exitFullscreen') : t('preview.player.fullscreen')}
      >
        {#if isFullscreen}
          <Minimize class="w-3.5 h-3.5" />
        {:else}
          <Maximize class="w-3.5 h-3.5" />
        {/if}
      </Button>
    {/if}
  </div>
</div>
