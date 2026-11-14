<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { audioBufferToWavBlob } from '@/runtime/composition-runtime/utils/audio-buffer-wav'
  import { createReversedAudioBuffer } from '@/runtime/composition-runtime/utils/audio-buffer-utils'
  import { NativePitchCorrectedAudio } from '../pitch-corrected-audio'
  import type { DecodedPitchFallbackAudioProps } from './types'

  let props: DecodedPitchFallbackAudioProps = $props()

  const trimBefore = $derived(props.trimBefore ?? 0)

  let decodedSrc = $state<string | null>(null)
  const reversedPlayback = $derived.by(() => {
    const { audioBuffer, isComplete, isReversed, reverseSourceEnd, sourceFps, timelineFps } = props
    if (!isComplete || !isReversed) return null
    const effectiveSourceFps = sourceFps ?? timelineFps
    const sourceEndSeconds = (reverseSourceEnd ?? trimBefore) / effectiveSourceFps
    return {
      buffer: createReversedAudioBuffer(audioBuffer),
      trimBefore: Math.max(
        0,
        Math.round((audioBuffer.duration - sourceEndSeconds) * effectiveSourceFps),
      ),
    }
  })
  const fallbackBuffer = $derived(reversedPlayback?.buffer ?? props.audioBuffer)

  $effect(() => {
    const url = URL.createObjectURL(audioBufferToWavBlob(fallbackBuffer))
    decodedSrc = url
    return () => {
      URL.revokeObjectURL(url)
    }
  })
</script>

{#if decodedSrc}
  <NativePitchCorrectedAudio
    src={decodedSrc}
    itemId={props.itemId}
    liveGainItemIds={props.liveGainItemIds}
    trimBefore={reversedPlayback?.trimBefore ?? trimBefore}
    sourceFps={props.sourceFps}
    sourceStartOffsetSec={reversedPlayback ? 0 : props.sourceStartOffsetSec}
    volume={props.volume}
    playbackRate={props.playbackRate}
    isReversed={props.isReversed && !reversedPlayback}
    reverseSourceEnd={reversedPlayback ? undefined : props.reverseSourceEnd}
    audioPitchSemitones={props.audioPitchSemitones}
    audioPitchCents={props.audioPitchCents}
    audioPitchShiftSemitones={props.audioPitchShiftSemitones}
    muted={props.muted}
    durationInFrames={props.durationInFrames}
    audioFadeIn={props.audioFadeIn}
    audioFadeOut={props.audioFadeOut}
    audioFadeInCurve={props.audioFadeInCurve}
    audioFadeOutCurve={props.audioFadeOutCurve}
    audioFadeInCurveX={props.audioFadeInCurveX}
    audioFadeOutCurveX={props.audioFadeOutCurveX}
    audioEqStages={props.audioEqStages}
    clipFadeSpans={props.clipFadeSpans}
    contentStartOffsetFrames={props.contentStartOffsetFrames}
    contentEndOffsetFrames={props.contentEndOffsetFrames}
    fadeInDelayFrames={props.fadeInDelayFrames}
    fadeOutLeadFrames={props.fadeOutLeadFrames}
    crossfadeFadeIn={props.crossfadeFadeIn}
    crossfadeFadeOut={props.crossfadeFadeOut}
    volumeMultiplier={props.volumeMultiplier}
  />
{/if}
