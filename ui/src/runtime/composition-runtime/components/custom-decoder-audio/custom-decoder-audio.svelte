<!-- SPDX-License-Identifier: MIT -->
<!--
  Custom decoder adapter for codecs that native media elements cannot decode
  or seek reliably (for example AC-3/E-AC-3, Vorbis, and PCM endian variants).

  - playbackRate === 1: keep buffered WebAudio playback from decoded bins for
    the fastest startup and scrubbing response.
  - playbackRate !== 1: use a local SoundTouch worklet path directly from
    decoded AudioBuffers, avoiding WAV/object-URL round-trips before preview.
-->
<script lang="ts">
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { useClockPlaybackRate } from '@/runtime/composition-runtime/deps/player'
  import {
    hasAudioPitchOverride,
    isAudioPitchShiftActive,
    resolvePreviewAudioPitchShiftSemitones,
  } from '@/shared/utils/audio-pitch'
  import { useStoreSelector } from '../../../use-sync-external-store.svelte'
  import CustomDecoderBufferedAudio from '../custom-decoder-buffered-audio.svelte'
  import CustomDecoderPitchPreservedAudio from './custom-decoder-pitch-preserved-audio.svelte'
  import type { CustomDecoderAudioProps } from './types'

  let props: CustomDecoderAudioProps = $props()

  const playbackRate = $derived(props.playbackRate ?? 1)
  const transportPlaybackRate = useClockPlaybackRate()
  const isShuttleRate = $derived(Math.abs(transportPlaybackRate.current - 1) > 0.0001)
  const itemPreview = useStoreSelector(useGizmoStore, (state) => state.preview?.[props.itemId])
  const resolvedPitchShiftSemitones = $derived(
    resolvePreviewAudioPitchShiftSemitones({
      base: {
        audioPitchSemitones: props.audioPitchSemitones,
        audioPitchCents: props.audioPitchCents,
      },
      preview: itemPreview.current?.properties,
      additionalSemitones: props.audioPitchShiftSemitones,
    }),
  )
  // Stay on the SoundTouch path while a pitch preview is active so crossing the
  // zero boundary mid-drag doesn't remount between buffered and pitch-preserved.
  const hasActivePitchPreview = $derived(hasAudioPitchOverride(itemPreview.current?.properties))
  const shouldUseBufferedPlayback = $derived(
    props.isReversed !== true &&
      !isShuttleRate &&
      Math.abs(playbackRate - 1) <= 0.0001 &&
      !hasActivePitchPreview &&
      !isAudioPitchShiftActive(resolvedPitchShiftSemitones),
  )
</script>

{#if shouldUseBufferedPlayback}
  <CustomDecoderBufferedAudio {...props} {playbackRate} />
{:else}
  <CustomDecoderPitchPreservedAudio {...props} {playbackRate} />
{/if}
