<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AbsoluteFill } from '@/features/preview/deps/player-core'
  import { useClock, useClockIsPlaying, useClockPlaybackRate, usePlayer, useVideoConfig } from '@/features/preview/deps/player-context'
  import { getBrowserMediaPlaybackRate } from '@/shared/state/playback/shuttle'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import { shouldSeekPlayingMedia } from '@/features/preview/utils/source-media-sync'
  import SourceAudioWaveform from '../source-audio-waveform.svelte'

  let { mediaId, src }: { mediaId?: string; src: string } = $props()
  const audioRef: { current: HTMLAudioElement | null } = { current: null }
  const clock = useClock()
  const playing = useClockIsPlaying()
  const playbackRate = useClockPlaybackRate()
  const isReverseShuttle = $derived(playbackRate.current < 0)
  const mediaPlaybackRate = $derived(getBrowserMediaPlaybackRate(1, playbackRate.current))
  const videoConfig = useVideoConfig()
  const { fps, durationInFrames } = $derived(videoConfig)
  const player = usePlayer(() => durationInFrames)
  const lastFrameRef = { current: clock.currentFrame }

  const syncAudioFrame = (frame: number) => {
      const audio = audioRef.current
      if (!audio || !src) return

      const targetTime = frame / fps
      lastFrameRef.current = frame

      const canSeek = audio.readyState >= 1
      if (!canSeek) {
        return
      }

      if (playing.current && !shouldSeekPlayingMedia(audio, targetTime, fps)) {
        return
      }

      try {
        audio.currentTime = targetTime
      } catch {
        // Ignore seek errors while media is loading
      }
    }

  $effect(() => {
    syncAudioFrame(clock.currentFrame)
    return clock.onFrameChange((frame) => {
      syncAudioFrame(frame)
    })
  })

  $effect(() => {
    void [playing.current]

    syncAudioFrame(clock.currentFrame)
  })

  // Handle play/pause
  $effect(() => {
    const audio = audioRef.current
    if (!audio || !src) return

    if (playing.current && !isReverseShuttle) {
      audio.playbackRate = mediaPlaybackRate
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = lastFrameRef.current / fps
        } catch {
          // Ignore seek errors while media is loading
        }
      }
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  })

  const handleSeekSeconds = (timeSeconds: number) => {
      const frame = Math.max(
        0,
        Math.min(durationInFrames - 1, Math.round(timeSeconds * Math.max(1, fps))),
      )
      lastFrameRef.current = frame
      useSourcePlayerStore.getState().setCurrentSourceFrame(frame)
      player.seek(frame)
    }
</script>

<AbsoluteFill
  style={`display: flex; align-items: center; justify-content: center; background-color: #171821; padding: 18px`}
>
  <div
    style:width="100%"
    style:height="min(100%, 360px)"
    style:max-height="100%"
    style:display="flex"
    style:flex-direction="column"
    style:align-items="stretch"
    style:justify-content="center"
  >
    <SourceAudioWaveform
      mediaId={mediaId}
      src={src}
      durationSeconds={durationInFrames / Math.max(1, fps)}
      currentTimeSeconds={clock.currentFrame / Math.max(1, fps)}
      onSeekSeconds={handleSeekSeconds}
     />
  </div>
  <audio
    bind:this={audioRef.current}
    src={src}
    preload="auto"
  ></audio>
</AbsoluteFill>
