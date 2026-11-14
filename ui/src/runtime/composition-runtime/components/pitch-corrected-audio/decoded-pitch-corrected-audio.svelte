<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { createLogger } from '@/shared/logging/logger'
  import { getOrDecodeAudioSliceForPlayback } from '@/runtime/composition-runtime/utils/audio-decode-cache'
  import { getAudioTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import { needsDecodedPitchSourceExtension } from '@/runtime/composition-runtime/utils/decoded-pitch-source'
  import SoundTouchWorkletAudio from '../soundtouch-worklet-audio.svelte'
  import { useAudioPlaybackState } from '../hooks/use-audio-playback-state.svelte'
  import NativePitchCorrectedAudio from './native-pitch-corrected-audio.svelte'
  import DecodedPitchFallbackAudio from './decoded-pitch-fallback-audio.svelte'
  import {
    PARTIAL_PITCH_EXTENSION_READY_SECONDS,
    PARTIAL_PITCH_EXTENSION_TRIGGER_SECONDS,
    PARTIAL_PITCH_READY_SECONDS,
    PARTIAL_PITCH_WAIT_TIMEOUT_MS,
    REVERSE_SHUTTLE_PREROLL_SECONDS,
    shouldReplaceDecodedPitchSource,
    type DecodedPitchCorrectedAudioProps,
    type DecodedPitchSource,
  } from './types'

  const log = createLogger('PitchCorrectedAudio')

  let props: DecodedPitchCorrectedAudioProps = $props()

  const src = $derived(props.src)
  const mediaId = $derived(props.mediaId)
  const trimBefore = $derived(props.trimBefore ?? 0)
  const sourceFps = $derived(props.sourceFps)
  const sourceStartOffsetSec = $derived(props.sourceStartOffsetSec ?? 0)
  const playbackRate = $derived(props.playbackRate ?? 1)
  const isReversed = $derived(props.isReversed ?? false)
  const reverseSourceEnd = $derived(props.reverseSourceEnd)

  const playbackState = useAudioPlaybackState(() => props)
  const frame = $derived(playbackState.frame)
  const fps = $derived(playbackState.fps)
  const playing = $derived(playbackState.playing)
  const transportPlaybackRate = $derived(playbackState.transportPlaybackRate)
  const isPreviewScrubbing = $derived(playbackState.isPreviewScrubbing)

  let decodedSource = $state.raw<DecodedPitchSource | null>(null)
  const pendingExtensionKeyRef: { current: string | null } = { current: null }
  const frameRef = { current: untrack(() => frame) }
  // React assigned this during render, ahead of every effect.
  $effect.pre(() => {
    frameRef.current = frame
  })
  const isReverseShuttle = $derived(transportPlaybackRate < 0)

  function acceptSlice(nextSource: DecodedPitchSource) {
    if (shouldReplaceDecodedPitchSource(decodedSource, nextSource)) {
      decodedSource = nextSource
    }
  }

  $effect(() => {
    const currentMediaId = mediaId
    const currentSrc = src
    const scrubbing = isPreviewScrubbing
    const currentFps = fps
    const reverseShuttle = isReverseShuttle
    const reversed = isReversed
    const sourceEnd = reverseSourceEnd
    const rate = playbackRate
    const effectiveSourceFps = sourceFps ?? currentFps
    const startTrim = trimBefore
    const startOffset = sourceStartOffsetSec
    if (!currentMediaId || !currentSrc || scrubbing) return

    let cancelled = false
    const seedSourceFrames = reverseShuttle
      ? getAudioTargetTimeSeconds(
          startTrim,
          effectiveSourceFps,
          frameRef.current,
          rate,
          currentFps,
          reversed,
          sourceEnd,
        ) * effectiveSourceFps
      : reversed && sourceEnd !== undefined
        ? sourceEnd
        : startTrim
    const clipStartTime = Math.max(0, seedSourceFrames / effectiveSourceFps - startOffset)
    decodedSource = null
    pendingExtensionKeyRef.current = null

    getOrDecodeAudioSliceForPlayback(currentMediaId, currentSrc, {
      minReadySeconds: PARTIAL_PITCH_READY_SECONDS,
      waitTimeoutMs: PARTIAL_PITCH_WAIT_TIMEOUT_MS,
      targetTimeSeconds: clipStartTime,
      ...(reverseShuttle ? { preRollSeconds: REVERSE_SHUTTLE_PREROLL_SECONDS } : {}),
    })
      .then((slice) => {
        if (cancelled) return
        acceptSlice({
          buffer: slice.buffer,
          sourceStartOffsetSec: slice.startTime,
          coverageEndSec: slice.startTime + slice.buffer.duration,
          isComplete: slice.isComplete,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          log.warn('Failed to prepare partial pitch-corrected preview buffer', {
            mediaId: currentMediaId,
            error,
          })
        }
      })

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const currentSource = decodedSource
    const currentMediaId = mediaId
    const currentSrc = src
    const currentPlaying = playing
    const reverseShuttle = isReverseShuttle
    const rate = playbackRate
    const effectiveSourceFps = sourceFps ?? fps
    const targetTime = Math.max(
      0,
      getAudioTargetTimeSeconds(
        trimBefore,
        effectiveSourceFps,
        frame,
        rate,
        fps,
        isReversed,
        reverseSourceEnd,
      ) - sourceStartOffsetSec,
    )
    if (
      !needsDecodedPitchSourceExtension(
        currentSource,
        currentPlaying,
        targetTime,
        reverseShuttle,
        PARTIAL_PITCH_EXTENSION_TRIGGER_SECONDS,
      )
    ) {
      pendingExtensionKeyRef.current = null
      return
    }

    const requestKey = `${currentMediaId}:${currentSrc}:${rate}:${targetTime.toFixed(3)}`
    if (pendingExtensionKeyRef.current === requestKey) {
      return
    }
    pendingExtensionKeyRef.current = requestKey

    let cancelled = false
    getOrDecodeAudioSliceForPlayback(currentMediaId, currentSrc, {
      minReadySeconds: PARTIAL_PITCH_EXTENSION_READY_SECONDS,
      waitTimeoutMs: PARTIAL_PITCH_WAIT_TIMEOUT_MS,
      targetTimeSeconds: targetTime,
      ...(reverseShuttle ? { preRollSeconds: REVERSE_SHUTTLE_PREROLL_SECONDS } : {}),
    })
      .then((slice) => {
        if (cancelled) return
        acceptSlice({
          buffer: slice.buffer,
          sourceStartOffsetSec: slice.startTime,
          coverageEndSec: slice.startTime + slice.buffer.duration,
          isComplete: slice.isComplete,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          log.warn('Failed to extend pitch-corrected preview buffer', {
            mediaId: currentMediaId,
            targetTime,
            error,
          })
        }
      })
      .finally(() => {
        if (!cancelled && pendingExtensionKeyRef.current === requestKey) {
          pendingExtensionKeyRef.current = null
        }
      })

    return () => {
      cancelled = true
      if (pendingExtensionKeyRef.current === requestKey) {
        pendingExtensionKeyRef.current = null
      }
    }
  })

  const playbackSourceStartOffsetSec = $derived(
    sourceStartOffsetSec + (decodedSource?.sourceStartOffsetSec ?? 0),
  )
</script>

{#if !decodedSource}
  <NativePitchCorrectedAudio {...props} />
{:else}
  {@const source = decodedSource}
  {#snippet decodedFallback()}
    <DecodedPitchFallbackAudio
      {...props}
      {src}
      audioBuffer={source.buffer}
      sourceStartOffsetSec={playbackSourceStartOffsetSec}
      isComplete={source.isComplete}
      timelineFps={fps}
    />
  {/snippet}
  <SoundTouchWorkletAudio
    audioBuffer={source.buffer}
    fallback={decodedFallback}
    itemId={props.itemId}
    {trimBefore}
    {sourceFps}
    sourceStartOffsetSec={playbackSourceStartOffsetSec}
    isComplete={source.isComplete}
    volume={props.volume ?? 0}
    {playbackRate}
    {isReversed}
    {reverseSourceEnd}
    audioPitchSemitones={props.audioPitchSemitones}
    audioPitchCents={props.audioPitchCents}
    audioPitchShiftSemitones={props.audioPitchShiftSemitones}
    muted={props.muted ?? false}
    durationInFrames={props.durationInFrames}
    audioFadeIn={props.audioFadeIn ?? 0}
    audioFadeOut={props.audioFadeOut ?? 0}
    audioFadeInCurve={props.audioFadeInCurve ?? 0}
    audioFadeOutCurve={props.audioFadeOutCurve ?? 0}
    audioFadeInCurveX={props.audioFadeInCurveX ?? 0.52}
    audioFadeOutCurveX={props.audioFadeOutCurveX ?? 0.52}
    audioEqStages={props.audioEqStages}
    clipFadeSpans={props.clipFadeSpans}
    contentStartOffsetFrames={props.contentStartOffsetFrames ?? 0}
    contentEndOffsetFrames={props.contentEndOffsetFrames ?? 0}
    fadeInDelayFrames={props.fadeInDelayFrames ?? 0}
    fadeOutLeadFrames={props.fadeOutLeadFrames ?? 0}
    crossfadeFadeIn={props.crossfadeFadeIn}
    crossfadeFadeOut={props.crossfadeFadeOut}
    liveGainItemIds={props.liveGainItemIds}
    volumeMultiplier={props.volumeMultiplier ?? 1}
  />
{/if}
