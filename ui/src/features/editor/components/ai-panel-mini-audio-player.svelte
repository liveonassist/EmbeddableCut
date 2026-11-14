<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Pause from 'lucide-svelte/icons/pause'
  import Play from 'lucide-svelte/icons/play'
  import { Slider } from '@/components/ui/slider'
  import { useMediaPlaybackControls } from '@/shared/media/use-media-playback-controls.svelte'
  import { t } from '$lib/i18n.svelte'
  import { formatTime } from './ai-panel-types'

  /** The AI panel's per-generation preview player. */
  let { src }: { src: string } = $props()

  let audio: HTMLAudioElement | undefined = $state()
  let isPlaying = $state(false)
  let currentTime = $state(0)
  let duration = $state(0)
  let isSeeking = false

  $effect(() => {
    const el = audio
    if (!el) return

    const onPlay = () => (isPlaying = true)
    const onPause = () => (isPlaying = false)
    const onTimeUpdate = () => {
      if (!isSeeking) currentTime = el.currentTime
    }
    const onLoaded = () => (duration = el.duration)
    const onEnded = () => {
      isPlaying = false
      currentTime = 0
    }

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('ended', onEnded)

    return () => {
      el.pause()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('ended', onEnded)
    }
  })

  const { togglePlay, seekToPercent } = useMediaPlaybackControls(
    () => audio,
    () => duration,
    (time) => (currentTime = time),
  )

  const progressPercent = $derived(duration > 0 ? (currentTime / duration) * 100 : 0)
</script>

<div class="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-1.5 py-1">
  <audio bind:this={audio} {src} preload="metadata"></audio>
  <button
    type="button"
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm glow-primary-sm transition-colors hover:bg-primary/90"
    onclick={togglePlay}
    aria-label={isPlaying ? t('preview.player.pause') : t('preview.player.play')}
  >
    {#if isPlaying}
      <Pause class="h-3 w-3" />
    {:else}
      <Play class="h-3 w-3 ml-px" />
    {/if}
  </button>
  <Slider
    value={[progressPercent]}
    onValueChange={(values) => {
      isSeeking = true
      seekToPercent(values)
    }}
    onValueCommit={() => (isSeeking = false)}
    max={100}
    step={0.1}
    class="min-w-0 flex-1"
    aria-label={t('editor.tts.seek')}
  />
  <span class="shrink-0 select-none font-mono text-[10px] tabular-nums text-muted-foreground"
    >{formatTime(currentTime)}<span class="text-muted-foreground/40"> / </span>{formatTime(
      duration,
    )}</span
  >
</div>
