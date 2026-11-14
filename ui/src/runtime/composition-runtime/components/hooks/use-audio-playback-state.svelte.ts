// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { useClockPlaybackRate, useSequenceContext } from '@/runtime/composition-runtime/deps/player'
import { useVideoConfig, useIsPlaying } from '../../hooks/use-player-compat.svelte'
import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'
import { useKeyframesStore } from '@/runtime/composition-runtime/deps/stores'
import { useItemKeyframesFromContext } from '../../contexts/keyframes-context'
import {
  getPropertyKeyframes,
  interpolatePropertyValue,
} from '@/runtime/composition-runtime/deps/keyframes'
import { getAudioClipFadeMultiplier, getAudioFadeMultiplier } from '@/shared/utils/audio-fade-curve'
import { resolvePreviewAudioEqStages } from '@/shared/utils/audio-eq'
import { resolvePreviewAudioPitchShiftSemitones } from '@/shared/utils/audio-pitch'
import { useMixerLiveGainProduct, clearMixerLiveGain } from '@/shared/state/mixer-live-gain'
import type { ResolvedAudioEqSettings } from '@/types/audio'
import type { AudioPlaybackProps } from '../audio-playback-props'
import { useStoreSelector } from '../../../use-sync-external-store.svelte'

/** Every field is a reactive getter. */
interface AudioPlaybackState {
  readonly frame: number
  readonly fps: number
  readonly playing: boolean
  readonly transportPlaybackRate: number
  readonly isPreviewScrubbing: boolean
  readonly resolvedVolume: number
  readonly resolvedPitchShiftSemitones: number
  readonly resolvedAudioEqStages: ResolvedAudioEqSettings[]
}

export function useAudioPlaybackState(props: () => AudioPlaybackProps): AudioPlaybackState {
  const itemId = () => props().itemId
  const sequenceContext = useSequenceContext()
  const frame = $derived(sequenceContext?.localFrame ?? 0)
  const videoConfig = useVideoConfig()
  const playing = useIsPlaying()
  const transportPlaybackRate = useClockPlaybackRate()
  // Subscribe to the scrub lifecycle, not the changing preview frame itself.
  // Audio is silent while the pointer is down, so adapters can defer decode and
  // graph allocation until the scrub settles on its final frame.
  const hasPreviewFrame = select(usePlaybackStore, (state) => state.previewFrame !== null)
  const hasActiveGizmo = select(useGizmoStore, (state) => state.activeGizmo !== null)
  const isPreviewScrubbing = $derived(
    !playing.current && hasPreviewFrame.current && !hasActiveGizmo.current,
  )

  const itemPreview = useStoreSelector(useGizmoStore, (state) => state.preview?.[itemId()])
  const preview = $derived(itemPreview.current?.properties)

  const previewMasterVolume = select(usePlaybackStore, (state) => state.volume)
  const previewMasterMuted = select(usePlaybackStore, (state) => state.muted)
  const masterBusDb = select(usePlaybackStore, (state) => state.masterBusDb)

  const contextKeyframes = useItemKeyframesFromContext(itemId)
  const storeKeyframes = useStoreSelector(
    useKeyframesStore,
    (state) => state.keyframesByItemId[itemId()],
  )
  const itemKeyframes = $derived(contextKeyframes.current ?? storeKeyframes.current)

  const mixerGain = useMixerLiveGainProduct(() => [itemId(), ...(props().liveGainItemIds ?? [])])
  // Compared by value, as React's dependency list was.
  const clearKeyItemId = $derived(itemId())
  const clearKeyVolume = $derived(props().volume ?? 0)
  $effect(() => {
    void clearKeyVolume
    clearMixerLiveGain(clearKeyItemId)
  })

  const resolvedVolume = $derived.by(() => {
    const {
      volume = 0,
      muted = false,
      durationInFrames,
      audioFadeIn = 0,
      audioFadeOut = 0,
      audioFadeInCurve = 0,
      audioFadeOutCurve = 0,
      audioFadeInCurveX = 0.52,
      audioFadeOutCurveX = 0.52,
      clipFadeSpans,
      contentStartOffsetFrames = 0,
      contentEndOffsetFrames = 0,
      fadeInDelayFrames = 0,
      fadeOutLeadFrames = 0,
      crossfadeFadeIn,
      crossfadeFadeOut,
      volumeMultiplier = 1,
    } = props()
    const fps = videoConfig.fps

    const volumeKeyframes = getPropertyKeyframes(itemKeyframes, 'volume')
    const staticVolumeDb = preview?.volume ?? volume
    const effectiveVolumeDb =
      volumeKeyframes.length > 0
        ? interpolatePropertyValue(volumeKeyframes, frame, staticVolumeDb)
        : staticVolumeDb

    const clipFadeMultiplier = clipFadeSpans
      ? getAudioClipFadeMultiplier(frame, clipFadeSpans)
      : getAudioFadeMultiplier({
          frame,
          durationInFrames,
          fadeInFrames: (preview?.audioFadeIn ?? audioFadeIn) * fps,
          fadeOutFrames: (preview?.audioFadeOut ?? audioFadeOut) * fps,
          contentStartOffsetFrames,
          contentEndOffsetFrames,
          fadeInDelayFrames,
          fadeOutLeadFrames,
          fadeInCurve: preview?.audioFadeInCurve ?? audioFadeInCurve,
          fadeOutCurve: preview?.audioFadeOutCurve ?? audioFadeOutCurve,
          fadeInCurveX: preview?.audioFadeInCurveX ?? audioFadeInCurveX,
          fadeOutCurveX: preview?.audioFadeOutCurveX ?? audioFadeOutCurveX,
        })

    const fadeMultiplier =
      clipFadeMultiplier *
      getAudioFadeMultiplier({
        frame,
        durationInFrames,
        fadeInFrames: crossfadeFadeIn,
        fadeOutFrames: crossfadeFadeOut,
        useEqualPower: true,
      })

    const linearVolume = Math.pow(10, effectiveVolumeDb / 20)
    const itemVolume = muted ? 0 : Math.max(0, linearVolume * fadeMultiplier)
    const masterBusGain = Math.pow(10, masterBusDb.current / 20)
    const effectiveMonitorVolume = previewMasterMuted.current ? 0 : previewMasterVolume.current

    return (
      itemVolume *
      masterBusGain *
      effectiveMonitorVolume *
      Math.max(0, volumeMultiplier) *
      mixerGain.current
    )
  })

  const resolvedPitchShiftSemitones = $derived.by(() => {
    const { audioPitchSemitones, audioPitchCents, audioPitchShiftSemitones } = props()
    return resolvePreviewAudioPitchShiftSemitones({
      base: {
        audioPitchSemitones,
        audioPitchCents,
      },
      preview,
      additionalSemitones: audioPitchShiftSemitones,
    })
  })

  const audioEqStages = $derived(props().audioEqStages)
  const resolvedAudioEqStages = $derived(resolvePreviewAudioEqStages(audioEqStages, preview))

  return {
    get frame() {
      return frame
    },
    get fps() {
      return videoConfig.fps
    },
    get playing() {
      return playing.current
    },
    get transportPlaybackRate() {
      return transportPlaybackRate.current
    },
    get isPreviewScrubbing() {
      return isPreviewScrubbing
    },
    get resolvedVolume() {
      return resolvedVolume
    },
    get resolvedPitchShiftSemitones() {
      return resolvedPitchShiftSemitones
    },
    get resolvedAudioEqStages() {
      return resolvedAudioEqStages
    },
  }
}
