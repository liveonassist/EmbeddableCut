<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { createLogger } from '@/shared/logging/logger'
  import { getOrDecodeAudioSliceForPlayback } from '@/runtime/composition-runtime/utils/audio-decode-cache'
  import { getAudioTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import { needsDecodedPitchSourceExtension } from '@/runtime/composition-runtime/utils/decoded-pitch-source'
  import SoundTouchWorkletAudio from '../soundtouch-worklet-audio.svelte'
  import { useAudioPlaybackState } from '../hooks/use-audio-playback-state.svelte'
  import DecodedPitchFallbackAudio from './decoded-pitch-fallback-audio.svelte'
  import {
    PARTIAL_WAV_EXTENSION_READY_SECONDS,
    PARTIAL_WAV_EXTENSION_TRIGGER_SECONDS,
    PARTIAL_WAV_READY_SECONDS,
    PARTIAL_WAV_WAIT_TIMEOUT_MS,
    REVERSE_SHUTTLE_PREROLL_SECONDS,
    shouldReplaceDecodedPitchSource,
    type CustomDecoderAudioProps,
    type DecodedPitchSource,
  } from './types'

  const log = createLogger('CustomDecoderAudio')

  let props: CustomDecoderAudioProps = $props()

  // Effects below re-run when these values change, as React's dependency
  // lists compared them.
  const src = $derived(props.src)
  const mediaId = $derived(props.mediaId)
  const trimBefore = $derived(props.trimBefore ?? 0)
  const sourceFps = $derived(props.sourceFps)
  const playbackRate = $derived(props.playbackRate ?? 1)
  const isReversed = $derived(props.isReversed)
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
    const startTrim = trimBefore
    const effectiveSourceFps = sourceFps ?? 30
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
    const clipStartTime = Math.max(0, seedSourceFrames / effectiveSourceFps)
    decodedSource = null
    pendingExtensionKeyRef.current = null

    // Keep preview audio windowed. Whole-file decoding makes long custom-codec
    // sources retain very large Float32 buffers after the cache has evicted them.
    getOrDecodeAudioSliceForPlayback(currentMediaId, currentSrc, {
      minReadySeconds: PARTIAL_WAV_READY_SECONDS,
      waitTimeoutMs: PARTIAL_WAV_WAIT_TIMEOUT_MS,
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
        log.info('Partial decoded pitch source ready', {
          mediaId: currentMediaId,
          duration: slice.buffer.duration.toFixed(2),
        })
      })
      .catch((err) => {
        if (cancelled) return
        log.error('Failed to prepare partial decoded pitch source', {
          mediaId: currentMediaId,
          err,
        })
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
    const targetTime = getAudioTargetTimeSeconds(
      trimBefore,
      effectiveSourceFps,
      frame,
      rate,
      fps,
      isReversed,
      reverseSourceEnd,
    )
    if (
      !needsDecodedPitchSourceExtension(
        currentSource,
        currentPlaying,
        targetTime,
        reverseShuttle,
        PARTIAL_WAV_EXTENSION_TRIGGER_SECONDS,
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
      minReadySeconds: PARTIAL_WAV_EXTENSION_READY_SECONDS,
      waitTimeoutMs: PARTIAL_WAV_WAIT_TIMEOUT_MS,
      targetTimeSeconds: Math.max(0, targetTime),
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
      .catch((err) => {
        if (!cancelled) {
          log.warn('Failed to extend pitch-preserved custom decoder audio slice', {
            mediaId: currentMediaId,
            targetTime,
            err,
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
</script>

{#if decodedSource}
  {@const source = decodedSource}
  {#snippet fallback()}
    <DecodedPitchFallbackAudio
      audioBuffer={source.buffer}
      sourceStartOffsetSec={source.sourceStartOffsetSec}
      isComplete={source.isComplete}
      timelineFps={fps}
      itemId={props.itemId}
      liveGainItemIds={props.liveGainItemIds}
      {trimBefore}
      {sourceFps}
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
      contentStartOffsetFrames={props.contentStartOffsetFrames}
      contentEndOffsetFrames={props.contentEndOffsetFrames}
      fadeInDelayFrames={props.fadeInDelayFrames}
      fadeOutLeadFrames={props.fadeOutLeadFrames}
      crossfadeFadeIn={props.crossfadeFadeIn}
      crossfadeFadeOut={props.crossfadeFadeOut}
      volumeMultiplier={props.volumeMultiplier ?? 1}
    />
  {/snippet}
  <SoundTouchWorkletAudio
    audioBuffer={source.buffer}
    {fallback}
    itemId={props.itemId}
    liveGainItemIds={props.liveGainItemIds}
    {trimBefore}
    {sourceFps}
    sourceStartOffsetSec={source.sourceStartOffsetSec}
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
    contentStartOffsetFrames={props.contentStartOffsetFrames}
    contentEndOffsetFrames={props.contentEndOffsetFrames}
    fadeInDelayFrames={props.fadeInDelayFrames}
    fadeOutLeadFrames={props.fadeOutLeadFrames}
    crossfadeFadeIn={props.crossfadeFadeIn}
    crossfadeFadeOut={props.crossfadeFadeOut}
    volumeMultiplier={props.volumeMultiplier ?? 1}
  />
{/if}
