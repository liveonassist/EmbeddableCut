<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'
  import { createLogger } from '@/shared/logging/logger'
  import { getAudioPitchRatioFromSemitones } from '@/shared/utils/audio-pitch'
  import { getBrowserMediaPlaybackRate } from '@/shared/state/playback/shuttle'
  import { useAudioPlaybackState } from './hooks/use-audio-playback-state.svelte'
  import { useReverseShuttleAudio } from './hooks/use-reverse-shuttle-audio.svelte'
  import { getAudioTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import {
    createPreviewClipAudioGraph,
    rampPreviewClipEq,
    rampPreviewClipGain,
    type PreviewClipAudioGraph,
  } from '@/runtime/composition-runtime/utils/preview-audio-graph'
  import {
    ensureSoundTouchPreviewWorkletLoaded,
    prepareAudioBufferForSoundTouchPreview,
    SOUND_TOUCH_PREVIEW_PROCESSOR_NAME,
  } from '@/runtime/composition-runtime/utils/soundtouch-preview-worklet'
  import type { SoundTouchPreviewProcessorMessage } from '@/runtime/composition-runtime/utils/soundtouch-preview-shared'
  import type { SoundTouchWorkletAudioProps } from './soundtouch-worklet-audio-types'

  const log = createLogger('SoundTouchWorkletAudio')
  const SEEK_TOLERANCE_SECONDS = 0.05
  const DRIFT_RESYNC_BEHIND_THRESHOLD_SECONDS = -0.2
  const DRIFT_RESYNC_AHEAD_THRESHOLD_SECONDS = 0.5

  let props: SoundTouchWorkletAudioProps = $props()

  const audioBuffer = $derived(props.audioBuffer)
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
  const resolvedPitchShiftSemitones = $derived(playbackState.resolvedPitchShiftSemitones)
  const resolvedAudioEqStages = $derived(playbackState.resolvedAudioEqStages)

  const isReverseShuttle = $derived(transportPlaybackRate < 0)
  const mediaPlaybackRate = $derived(
    getBrowserMediaPlaybackRate(playbackRate, transportPlaybackRate),
  )
  const timeStretchTempo = $derived(
    Math.max(0.0625, Math.min(16, playbackRate * Math.abs(transportPlaybackRate))),
  )
  const sourceDirection: -1 | 1 = $derived(
    (isReversed ? -1 : 1) * (isReverseShuttle ? -1 : 1) < 0 ? -1 : 1,
  )

  const graphRef: { current: PreviewClipAudioGraph | null } = { current: null }
  const nodeRef: { current: AudioWorkletNode | null } = { current: null }
  let nodeReady = $state(false)
  let fallbackRequested = $state(false)
  const needsInitialSyncRef = { current: true }
  const lastSyncWallClockRef = { current: Date.now() }
  const lastSyncContextTimeRef = { current: 0 }
  const lastStartOffsetRef = { current: 0 }
  const lastStartRateRef = { current: untrack(() => mediaPlaybackRate) }
  const lastFrameRef = { current: -1 }
  const shuttleFrameRef = { current: untrack(() => frame) }
  const lastPostedPlayingRef: { current: boolean | null } = { current: null }
  const mutedRef = { current: untrack(() => muted) }
  const finalVolumeRef = { current: untrack(() => finalVolume) }
  // React assigned these during render, ahead of every effect.
  $effect.pre(() => {
    shuttleFrameRef.current = frame
    mutedRef.current = muted
    finalVolumeRef.current = finalVolume
  })

  const postMessage = (
    message: SoundTouchPreviewProcessorMessage,
    transfer: Transferable[] = [],
  ): void => {
    nodeRef.current?.port.postMessage(message, transfer)
  }

  const postSeekSeconds = (seconds: number, sampleRate: number, direction: -1 | 1 = 1): void => {
    postMessage({
      type: 'seek',
      frame: Math.max(0, Math.floor(seconds * sampleRate)),
      direction,
    })
  }

  $effect(() => {
    if (playing) {
      needsInitialSyncRef.current = true
    }
  })

  $effect(() => {
    // Keep the preview graph alive across EQ toggles; the EQ stages ramp in place below.
    const graph = createPreviewClipAudioGraph()
    if (!graph) {
      fallbackRequested = true
      return
    }
    graphRef.current = graph

    let cancelled = false
    const teardownNode = () => {
      try {
        nodeRef.current?.port.postMessage({ type: 'reset' })
      } catch {
        // Ignore teardown races.
      }
      nodeRef.current?.disconnect()
      nodeRef.current = null
      nodeReady = false
      graph.dispose()
      if (graphRef.current === graph) {
        graphRef.current = null
      }
    }

    ensureSoundTouchPreviewWorkletLoaded(graph.context)
      .then((loaded) => {
        if (cancelled) {
          return
        }
        if (!loaded) {
          teardownNode()
          fallbackRequested = true
          return
        }

        let node: AudioWorkletNode
        try {
          node = new AudioWorkletNode(graph.context, SOUND_TOUCH_PREVIEW_PROCESSOR_NAME, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
          })
        } catch (error) {
          log.warn('Failed to construct SoundTouch preview node', { error })
          teardownNode()
          fallbackRequested = true
          return
        }

        node.connect(graph.sourceInputNode)
        nodeRef.current = node

        // Reapply current gain so the rebuilt graph doesn't start silent
        const clampedVolume = mutedRef.current ? 0 : Math.max(0, finalVolumeRef.current)
        graph.outputGainNode.gain.value = clampedVolume

        fallbackRequested = false
        nodeReady = true
      })
      .catch((error) => {
        if (!cancelled) {
          log.warn('Failed to initialize SoundTouch preview node', { error })
          teardownNode()
          fallbackRequested = true
        }
      })

    return () => {
      cancelled = true
      nodeReady = false
      lastPostedPlayingRef.current = null
      teardownNode()
    }
  })

  $effect(() => {
    const resume = () => {
      const graph = graphRef.current
      if (graph?.context.state === 'suspended') {
        void graph.context.resume().catch(() => undefined)
      }
    }

    window.addEventListener('pointerdown', resume, { capture: true })
    window.addEventListener('keydown', resume, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', resume, { capture: true })
      window.removeEventListener('keydown', resume, { capture: true })
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

  useReverseShuttleAudio(() => ({
    graphRef,
    buffer: fallbackRequested && isReverseShuttle ? audioBuffer : null,
    frameRef: shuttleFrameRef,
    fps,
    trimBefore,
    sourceFps,
    sourceStartOffsetSec,
    authoredPlaybackRate: playbackRate,
    authoredReversed: isReversed,
    reverseSourceEnd,
    playing,
    transportPlaybackRate,
  }))

  $effect(() => {
    if (!nodeReady) return
    postMessage({
      type: 'set-tempo',
      tempo: timeStretchTempo,
    })
  })

  $effect(() => {
    if (!nodeReady) return
    postMessage({
      type: 'set-pitch',
      pitch: getAudioPitchRatioFromSemitones(resolvedPitchShiftSemitones),
    })
  })

  $effect(() => {
    const buffer = audioBuffer
    const startOffsetSec = sourceStartOffsetSec
    if (!nodeReady) return
    const graph = graphRef.current
    const node = nodeRef.current
    if (!graph || !node) {
      return
    }

    let cancelled = false
    void prepareAudioBufferForSoundTouchPreview(buffer, graph.context.sampleRate)
      .then((serialized) => {
        if (cancelled || nodeRef.current !== node) return
        const leftChannel = serialized.leftChannel.buffer as ArrayBuffer
        const rightChannel = serialized.rightChannel.buffer as ArrayBuffer
        postMessage(
          {
            type: 'append-source',
            startFrame: Math.max(0, Math.floor(startOffsetSec * graph.context.sampleRate)),
            leftChannel,
            rightChannel,
            frameCount: serialized.frameCount,
            sampleRate: serialized.sampleRate,
          },
          [leftChannel, rightChannel],
        )
      })
      .catch((error) => {
        if (cancelled) return
        log.warn('Failed to prepare SoundTouch preview source', { error })
        fallbackRequested = true
      })

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    // React listed these as dependencies without reading them directly.
    void mediaPlaybackRate
    void isReverseShuttle
    const currentFrame = frame
    const currentFps = fps
    const currentPlaying = playing
    const direction = sourceDirection
    const tempo = timeStretchTempo
    const effectiveSourceFps = sourceFps ?? currentFps
    const sourceTimeSeconds = getAudioTargetTimeSeconds(
      trimBefore,
      effectiveSourceFps,
      currentFrame,
      playbackRate,
      currentFps,
      isReversed,
      reverseSourceEnd,
    )
    const clipStartTimeSeconds = Math.max(0, trimBefore / effectiveSourceFps)
    if (!nodeReady) return
    const graph = graphRef.current
    if (!graph) return

    const isPremounted = currentFrame < 0
    const targetTimeSeconds = isPremounted ? clipStartTimeSeconds : Math.max(0, sourceTimeSeconds)
    const clampedTargetTime = Math.max(0, targetTimeSeconds)

    const frameChanged = currentFrame !== lastFrameRef.current
    lastFrameRef.current = currentFrame

    const postPlayingState = (nextPlaying: boolean) => {
      if (lastPostedPlayingRef.current === nextPlaying) return
      postMessage({ type: 'set-playing', playing: nextPlaying })
      lastPostedPlayingRef.current = nextPlaying
    }

    const syncPremountedFrame = () => {
      postPlayingState(false)
      if (Math.abs(lastStartOffsetRef.current - clipStartTimeSeconds) > SEEK_TOLERANCE_SECONDS) {
        postSeekSeconds(clipStartTimeSeconds, graph.context.sampleRate, direction)
        lastStartOffsetRef.current = clipStartTimeSeconds
      }
      needsInitialSyncRef.current = true
    }

    const syncPlayingFrame = () => {
      if (graph.context.state === 'suspended') {
        void graph.context.resume().catch(() => undefined)
      }

      const now = graph.context.currentTime
      const expectedOffset =
        lastStartOffsetRef.current +
        Math.max(0, now - lastSyncContextTimeRef.current) * lastStartRateRef.current * direction
      const drift = expectedOffset - clampedTargetTime
      const timeSinceLastSync = Date.now() - lastSyncWallClockRef.current
      const audioBehind = drift * direction < DRIFT_RESYNC_BEHIND_THRESHOLD_SECONDS
      const audioFarAhead = drift * direction > DRIFT_RESYNC_AHEAD_THRESHOLD_SECONDS
      const needsSync =
        needsInitialSyncRef.current || audioFarAhead || (audioBehind && timeSinceLastSync > 500)

      if (needsSync) {
        postSeekSeconds(clampedTargetTime, graph.context.sampleRate, direction)
        lastSyncContextTimeRef.current = now
        lastSyncWallClockRef.current = Date.now()
        lastStartOffsetRef.current = clampedTargetTime
        lastStartRateRef.current = tempo
        needsInitialSyncRef.current = false
      }

      postPlayingState(true)
    }

    const syncPausedFrame = () => {
      postPlayingState(false)
      const playbackStoreState = usePlaybackStore.getState()
      const isPreviewScrubbing =
        !playbackStoreState.isPlaying &&
        playbackStoreState.previewFrame !== null &&
        useGizmoStore.getState().activeGizmo === null

      if (frameChanged && !isPreviewScrubbing) {
        postSeekSeconds(clampedTargetTime, graph.context.sampleRate)
        lastStartOffsetRef.current = clampedTargetTime
      }

      needsInitialSyncRef.current = true
    }

    if (isPremounted) {
      syncPremountedFrame()
      return
    }
    if (currentPlaying) syncPlayingFrame()
    else syncPausedFrame()
  })
</script>

{#if fallbackRequested && props.fallback}
  {@render props.fallback()}
{/if}
