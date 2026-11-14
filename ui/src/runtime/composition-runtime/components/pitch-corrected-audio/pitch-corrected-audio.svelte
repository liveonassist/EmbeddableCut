<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { useClockPlaybackRate } from '@/runtime/composition-runtime/deps/player'
  import {
    hasAudioPitchOverride,
    isAudioPitchShiftActive,
    resolvePreviewAudioPitchShiftSemitones,
  } from '@/shared/utils/audio-pitch'
  import { useStoreSelector } from '../../../use-sync-external-store.svelte'
  import NativePitchCorrectedAudio from './native-pitch-corrected-audio.svelte'
  import DecodedPitchCorrectedAudio from './decoded-pitch-corrected-audio.svelte'
  import { PLAYBACK_RATE_TOLERANCE, type PitchCorrectedAudioProps } from './types'

  let props: PitchCorrectedAudioProps = $props()

  const playbackRate = $derived(props.playbackRate ?? 1)
  const clockPlaybackRate = useClockPlaybackRate()
  const isReverseShuttle = $derived(clockPlaybackRate.current < 0)
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
  // Stay on the decoded SoundTouch path while the user is actively previewing a
  // pitch change — even if the resolved shift currently lands on 0 — so crossing
  // the zero boundary during a drag doesn't tear down and re-decode the graph.
  const hasActivePitchPreview = $derived(hasAudioPitchOverride(itemPreview.current?.properties))
  const requiresPitchCorrection = $derived(
    hasActivePitchPreview || isAudioPitchShiftActive(resolvedPitchShiftSemitones),
  )
  const decodeMediaId = $derived(props.mediaId ?? `legacy-src:${props.src}`)
  const shouldUseNativePath = $derived(
    props.isReversed !== true &&
      !isReverseShuttle &&
      !requiresPitchCorrection &&
      Math.abs(playbackRate - 1) <= PLAYBACK_RATE_TOLERANCE,
  )
</script>

{#if shouldUseNativePath}
  <NativePitchCorrectedAudio {...props} {playbackRate} />
{:else}
  <DecodedPitchCorrectedAudio {...props} mediaId={decodeMediaId} {playbackRate} />
{/if}
