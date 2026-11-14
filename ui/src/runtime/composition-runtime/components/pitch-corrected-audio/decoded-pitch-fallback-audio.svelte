<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { audioBufferToWavBlob } from '@/runtime/composition-runtime/utils/audio-buffer-wav'
  import { createReversedAudioBuffer } from '@/runtime/composition-runtime/utils/audio-buffer-utils'
  import NativePitchCorrectedAudio from './native-pitch-corrected-audio.svelte'
  import type { DecodedPitchFallbackAudioProps } from './types'

  let {
    audioBuffer,
    sourceStartOffsetSec,
    isComplete,
    timelineFps,
    isReversed = false,
    reverseSourceEnd,
    trimBefore = 0,
    sourceFps,
    ...props
  }: DecodedPitchFallbackAudioProps = $props()

  let decodedSrc = $state<string | null>(null)
  const reversedPlayback = $derived.by(() => {
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
  const fallbackBuffer = $derived(reversedPlayback?.buffer ?? audioBuffer)

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
    {...props}
    src={decodedSrc}
    trimBefore={reversedPlayback?.trimBefore ?? trimBefore}
    {sourceFps}
    sourceStartOffsetSec={reversedPlayback ? 0 : sourceStartOffsetSec}
    isReversed={isReversed && !reversedPlayback}
    reverseSourceEnd={reversedPlayback ? undefined : reverseSourceEnd}
  />
{/if}
