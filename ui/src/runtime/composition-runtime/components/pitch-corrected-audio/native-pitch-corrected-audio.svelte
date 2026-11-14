<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'
  import { getAudioTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import {
    acquirePreviewAudioElement,
    markPreviewAudioElementUsesWebAudio,
    releasePreviewAudioElement,
  } from '@/runtime/composition-runtime/utils/preview-audio-element-pool'
  import {
    createPreviewClipAudioGraph,
    rampPreviewClipEq,
    rampPreviewClipGain,
    setPreviewClipGain,
    type PreviewClipAudioGraph,
  } from '@/runtime/composition-runtime/utils/preview-audio-graph'
  import { getBrowserMediaPlaybackRate } from '@/shared/state/playback/shuttle'
  import { useAudioPlaybackState } from '../hooks/use-audio-playback-state.svelte'
  import type { PitchCorrectedAudioProps } from './types'

  let props: PitchCorrectedAudioProps = $props()

  // Effects below re-run when these values change, as React's dependency
  // lists compared them, not whenever a parent re-creates the prop objects.
  const src = $derived(props.src)
  const playbackRate = $derived(props.playbackRate ?? 1)
  const isReversed = $derived(props.isReversed ?? false)
  const reverseSourceEnd = $derived(props.reverseSourceEnd)
  const trimBefore = $derived(props.trimBefore ?? 0)
  const sourceFps = $derived(props.sourceFps)
  const sourceStartOffsetSec = $derived(props.sourceStartOffsetSec ?? 0)
  const muted = $derived(props.muted ?? false)

  const playbackState = useAudioPlaybackState(() => props)
  const frame = $derived(playbackState.frame)
  const fps = $derived(playbackState.fps)
  const playing = $derived(playbackState.playing)
  const transportPlaybackRate = $derived(playbackState.transportPlaybackRate)
  const finalVolume = $derived(playbackState.resolvedVolume)
  const resolvedAudioEqStages = $derived(playbackState.resolvedAudioEqStages)
  const isReverseShuttle = $derived(transportPlaybackRate < 0)
  const mediaPlaybackRate = $derived(
    getBrowserMediaPlaybackRate(playbackRate, transportPlaybackRate),
  )

  const audioRef: { current: HTMLAudioElement | null } = { current: null }
  const graphRef: { current: PreviewClipAudioGraph | null } = { current: null }
  const sourceNodeRef: { current: MediaElementAudioSourceNode | null } = { current: null }
  const lastSyncTimeRef = { current: Date.now() }
  const needsInitialSyncRef = { current: true }
  const lastFrameRef = { current: -1 }
  const preWarmTimerRef: { current: number | null } = { current: null }

  $effect(() => {
    if (playing) {
      needsInitialSyncRef.current = true
    }
  })

  $effect(() => {
    const audio = acquirePreviewAudioElement(src)
    // Keep the media element and graph alive across EQ toggles; the EQ stages ramp in place below.
    const graph = createPreviewClipAudioGraph()
    if (!graph) {
      releasePreviewAudioElement(audio)
      return
    }
    audioRef.current = audio
    graphRef.current = graph
    audio.volume = 1
    audio.muted = false

    try {
      const sourceNode = graph.context.createMediaElementSource(audio)
      markPreviewAudioElementUsesWebAudio(audio)
      sourceNode.connect(graph.sourceInputNode)
      sourceNodeRef.current = sourceNode
    } catch {
      graph.dispose()
      graphRef.current = null
      audioRef.current = null
      releasePreviewAudioElement(audio)
      return
    }

    return () => {
      audioRef.current = null
      sourceNodeRef.current?.disconnect()
      sourceNodeRef.current = null
      graph.dispose()
      graphRef.current = null
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current)
        preWarmTimerRef.current = null
      }
      releasePreviewAudioElement(audio)
    }
  })

  $effect(() => {
    const rate = mediaPlaybackRate
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  })

  $effect(() => {
    const clampedVolume = muted ? 0 : Math.max(0, finalVolume)
    const graph = graphRef.current
    if (!graph) return
    rampPreviewClipGain(graph, clampedVolume)
  })

  $effect(() => {
    const stages = resolvedAudioEqStages
    const graph = graphRef.current
    if (!graph) return
    rampPreviewClipEq(graph, stages)
  })

  $effect(() => {
    // Read every dependency up front, as React's dependency list did, so the
    // effect re-runs on them even when it bails out below.
    void mediaPlaybackRate
    const currentFrame = frame
    const currentFps = fps
    const currentPlaying = playing
    const reverseShuttle = isReverseShuttle
    const reversed = isReversed
    const effectiveSourceFps = sourceFps ?? currentFps
    const sourceTimeSeconds =
      getAudioTargetTimeSeconds(
        trimBefore,
        effectiveSourceFps,
        currentFrame,
        playbackRate,
        currentFps,
        reversed,
        reverseSourceEnd,
      ) - sourceStartOffsetSec
    const clipStartTimeSeconds = Math.max(
      0,
      trimBefore / effectiveSourceFps - sourceStartOffsetSec,
    )
    const audio = audioRef.current
    if (!audio) return
    const isPremounted = currentFrame < 0
    const targetTimeSeconds = isPremounted ? clipStartTimeSeconds : Math.max(0, sourceTimeSeconds)

    const frameChanged = currentFrame !== lastFrameRef.current
    lastFrameRef.current = currentFrame

    const canSeek = audio.readyState >= 1

    if (isPremounted) {
      if (!audio.paused) {
        audio.pause()
      }
      if (canSeek && Math.abs(audio.currentTime - clipStartTimeSeconds) > 0.05) {
        try {
          audio.currentTime = clipStartTimeSeconds
        } catch {
          // Audio is not ready to seek yet.
        }
      }
      return
    }

    if (currentPlaying) {
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current)
        preWarmTimerRef.current = null
      }

      if (reversed || reverseShuttle) {
        if (!audio.paused) {
          audio.pause()
        }
        if (canSeek && Math.abs(audio.currentTime - targetTimeSeconds) > 0.01) {
          try {
            audio.currentTime = targetTimeSeconds
          } catch {
            // Audio is not ready to seek yet.
          }
        }
        return
      }

      const currentTime = audio.currentTime
      const now = Date.now()
      const drift = currentTime - targetTimeSeconds
      const timeSinceLastSync = now - lastSyncTimeRef.current
      const audioBehind = drift < -0.2
      const audioFarAhead = drift > 0.5
      const needsSync =
        needsInitialSyncRef.current || audioFarAhead || (audioBehind && timeSinceLastSync > 500)

      if (needsSync && canSeek) {
        try {
          audio.currentTime = targetTimeSeconds
          lastSyncTimeRef.current = now
          needsInitialSyncRef.current = false
        } catch {
          // Audio is not ready to seek yet.
        }
      }

      if (audio.paused && audio.readyState >= 3) {
        const seekDistance = Math.abs(drift)
        if (seekDistance > 1 && audio.seeking) {
          const onSeeked = () => {
            audio.removeEventListener('seeked', onSeeked)
            const playback = usePlaybackStore.getState()
            if (playback.isPlaying && playback.playbackRate > 0 && audio.paused) {
              const ctx = graphRef.current?.context
              if (ctx?.state === 'suspended') ctx.resume()
              audio.play().catch(() => {})
            }
          }
          audio.addEventListener('seeked', onSeeked, { once: true })
          return
        }

        const sharedContext = graphRef.current?.context
        if (sharedContext?.state === 'suspended') {
          sharedContext.resume()
        }
        audio.play().catch(() => {
          // Autoplay might be blocked.
        })
      }
    } else {
      if (!audio.paused) {
        audio.pause()
      }
      const playbackStoreState = usePlaybackStore.getState()
      const isPreviewScrubbing =
        !playbackStoreState.isPlaying &&
        playbackStoreState.previewFrame !== null &&
        useGizmoStore.getState().activeGizmo === null

      if (frameChanged && canSeek && !isPreviewScrubbing) {
        try {
          audio.currentTime = targetTimeSeconds
        } catch {
          // Audio is not ready to seek yet.
        }
        if (preWarmTimerRef.current !== null) {
          clearTimeout(preWarmTimerRef.current)
        }
        preWarmTimerRef.current = window.setTimeout(() => {
          preWarmTimerRef.current = null
          const currentAudio = audioRef.current
          if (
            currentAudio &&
            currentAudio.paused &&
            currentAudio.readyState >= 2 &&
            !usePlaybackStore.getState().isPlaying
          ) {
            const graph = graphRef.current
            const previousGain = graph?.outputGainNode.gain.value ?? 0
            if (graph) {
              setPreviewClipGain(graph, 0)
            } else {
              currentAudio.volume = 0
            }
            currentAudio
              .play()
              .then(() => {
                if (!usePlaybackStore.getState().isPlaying) {
                  currentAudio.pause()
                  if (graph) {
                    setPreviewClipGain(graph, previousGain)
                  } else {
                    currentAudio.volume = previousGain
                  }
                }
              })
              .catch(() => {
                if (!usePlaybackStore.getState().isPlaying) {
                  if (graph) {
                    setPreviewClipGain(graph, previousGain)
                  } else {
                    currentAudio.volume = previousGain
                  }
                }
              })
          }
        }, 50)
      }
    }
  })
</script>
