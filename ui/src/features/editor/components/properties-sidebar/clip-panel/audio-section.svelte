<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const AUDIO_GAIN_DB_MIN = -60
  const AUDIO_GAIN_DB_MAX = 12
  // SoundTouch's WSOLA pipeline produces audible artifacts when the pitch factor
  // is reassigned at 60Hz. 50ms is still perceptually live but lets each window
  // settle between updates.
  const AUDIO_PITCH_LIVE_THROTTLE_MS = 50
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import Music from '@lucide/svelte/icons/music'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Volume2 from '@lucide/svelte/icons/volume-2'
  import { Button } from '@/components/ui/button'
  import type { TimelineItem } from '@/types/timeline'
  import {
    applyAutoKeyframeOperations,
    updateItem,
    useItemsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import {
    getAutoKeyframeOperation,
    type AutoKeyframeOperation,
    getPropertyKeyframes,
    interpolatePropertyValue,
    KeyframeToggle,
  } from '@/features/editor/deps/keyframes'
  import { PropertyRow, PropertySection, SliderInput } from '../components'
  import { demixValue, getMixedValue } from '../utils'
  import { getAudioSectionItems } from './audio-section-utils'
  import { useKeyframesByItemId } from './use-keyframes-by-item-id.svelte'
  import AudioEqPanelContent from './audio-eq-panel-content.svelte'
  import {
    AUDIO_PITCH_CENTS_MAX,
    AUDIO_PITCH_CENTS_MIN,
    AUDIO_PITCH_SEMITONES_MAX,
    AUDIO_PITCH_SEMITONES_MIN,
  } from '@/shared/utils/audio-pitch'

  interface AudioSectionProps {
    items: TimelineItem[]
  }

  /**
   * Audio section - volume, EQ, and audio fades.
   * Shown for video and audio clips.
   */
  let { items }: AudioSectionProps = $props()

  const currentFrame = useThrottledFrame()

  let pitchPreviewOp = 0

  const audioItems = $derived(getAudioSectionItems(items))

  const itemIds = $derived(audioItems.map((item) => item.id))
  const audioItemsById = $derived(new Map(audioItems.map((item) => [item.id, item])))
  const keyframesByItemId = useKeyframesByItemId(() => itemIds)

  const volume = $derived.by((): number | 'mixed' => {
    if (audioItems.length === 0) return 0

    const frame = currentFrame.current
    const keyframes = keyframesByItemId.current
    const values = audioItems.map((item) => {
      const staticVolume = item.volume ?? 0
      const itemKeyframes = keyframes.get(item.id) ?? undefined
      if (itemKeyframes) {
        const volumeKfs = getPropertyKeyframes(itemKeyframes, 'volume')
        if (volumeKfs.length > 0) {
          const relativeFrame = frame - item.from
          return interpolatePropertyValue(volumeKfs, relativeFrame, staticVolume)
        }
      }
      return staticVolume
    })

    const first = values[0]!
    return values.every((v) => Math.abs(v - first) < 0.01) ? Math.round(first * 10) / 10 : 'mixed'
  })

  const fadeIn = $derived(getMixedValue(audioItems, (item) => item.audioFadeIn, 0))
  const fadeOut = $derived(getMixedValue(audioItems, (item) => item.audioFadeOut, 0))
  const pitchSemitones = $derived(
    getMixedValue(audioItems, (item) => item.audioPitchSemitones ?? 0, 0),
  )
  const pitchCents = $derived(getMixedValue(audioItems, (item) => item.audioPitchCents ?? 0, 0))

  const autoKeyframeVolume = (itemId: string, value: number): AutoKeyframeOperation | null => {
    const item = audioItemsById.get(itemId)
    if (!item) return null

    const itemKeyframes = keyframesByItemId.current.get(itemId) ?? undefined
    return getAutoKeyframeOperation(item, itemKeyframes, 'volume', value, currentFrame.current)
  }

  const handleVolumeLiveChange = (value: number) => {
    const previews: Record<string, { volume: number }> = {}
    itemIds.forEach((id) => {
      previews[id] = { volume: value }
    })
    useGizmoStore.getState().setPropertiesPreviewNew(previews)
  }

  const handleVolumeChange = (value: number) => {
    const autoOps: AutoKeyframeOperation[] = []
    const fallbackItemIds: string[] = []
    for (const itemId of itemIds) {
      const operation = autoKeyframeVolume(itemId, value)
      if (operation) {
        autoOps.push(operation)
      } else {
        fallbackItemIds.push(itemId)
      }
    }
    if (autoOps.length > 0) {
      applyAutoKeyframeOperations(autoOps)
    }
    if (fallbackItemIds.length > 0) {
      fallbackItemIds.forEach((id) => updateItem(id, { volume: value }))
    }
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  const handleFadeInLiveChange = (value: number) => {
    const previews: Record<string, { audioFadeIn: number }> = {}
    itemIds.forEach((id) => {
      previews[id] = { audioFadeIn: value }
    })
    useGizmoStore.getState().setPropertiesPreviewNew(previews)
  }

  const handleFadeInChange = (value: number) => {
    itemIds.forEach((id) => updateItem(id, { audioFadeIn: value }))
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  const handleFadeOutLiveChange = (value: number) => {
    const previews: Record<string, { audioFadeOut: number }> = {}
    itemIds.forEach((id) => {
      previews[id] = { audioFadeOut: value }
    })
    useGizmoStore.getState().setPropertiesPreviewNew(previews)
  }

  const handleFadeOutChange = (value: number) => {
    itemIds.forEach((id) => updateItem(id, { audioFadeOut: value }))
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  type PitchField = 'audioPitchSemitones' | 'audioPitchCents'

  const handleAudioPitchLiveChange = (field: PitchField, value: number) => {
    const previews: Record<string, Pick<TimelineItem, PitchField>> = {}
    itemIds.forEach((id) => {
      previews[id] = { [field]: value } as Pick<TimelineItem, PitchField>
    })
    useGizmoStore.getState().setPropertiesPreviewNew(previews)
  }

  const handleAudioPitchChange = (field: PitchField, value: number) => {
    const opId = ++pitchPreviewOp
    const ids = itemIds
    const { setPropertiesPreviewNew, clearPreviewForItems } = useGizmoStore.getState()
    const previews: Record<string, Pick<TimelineItem, PitchField>> = {}
    ids.forEach((id) => {
      previews[id] = { [field]: value } as Pick<TimelineItem, PitchField>
    })
    setPropertiesPreviewNew(previews)
    ids.forEach((id) => updateItem(id, { [field]: value } as Partial<TimelineItem>))

    const schedule =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) =>
            window.setTimeout(() => callback(performance.now()), 16)

    schedule(() => {
      schedule(() => {
        if (pitchPreviewOp !== opId) return

        const currentItems = useItemsStore.getState().items
        const commitLanded = currentItems.every(
          (item) => !ids.includes(item.id) || (item[field] ?? 0) === value,
        )

        if (!commitLanded) {
          queueMicrotask(() => {
            if (pitchPreviewOp === opId) {
              clearPreviewForItems(ids)
            }
          })
          return
        }

        clearPreviewForItems(ids)
      })
    })
  }

  const handleResetVolume = () => {
    const tolerance = 0.1
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item) => itemIds.includes(item.id) && Math.abs(item.volume ?? 0) > tolerance,
    )
    if (needsUpdate) {
      itemIds.forEach((id) => updateItem(id, { volume: 0 }))
    }
  }

  const handleResetFadeIn = () => {
    const tolerance = 0.01
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item) => itemIds.includes(item.id) && (item.audioFadeIn ?? 0) > tolerance,
    )
    if (needsUpdate) {
      itemIds.forEach((id) => updateItem(id, { audioFadeIn: 0 }))
    }
  }

  const handleResetFadeOut = () => {
    const tolerance = 0.01
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item) => itemIds.includes(item.id) && (item.audioFadeOut ?? 0) > tolerance,
    )
    if (needsUpdate) {
      itemIds.forEach((id) => updateItem(id, { audioFadeOut: 0 }))
    }
  }

  const handleResetPitchSemitones = () => {
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item) => itemIds.includes(item.id) && (item.audioPitchSemitones ?? 0) !== 0,
    )
    if (needsUpdate) {
      itemIds.forEach((id) => updateItem(id, { audioPitchSemitones: 0 }))
    }
  }

  const handleResetPitchCents = () => {
    const currentItems = useItemsStore.getState().items
    const needsUpdate = currentItems.some(
      (item) => itemIds.includes(item.id) && (item.audioPitchCents ?? 0) !== 0,
    )
    if (needsUpdate) {
      itemIds.forEach((id) => updateItem(id, { audioPitchCents: 0 }))
    }
  }
</script>

{#if audioItems.length > 0}
  <PropertySection title={t('editor.audioSection.audio')} icon={Volume2} defaultOpen={true}>
    <PropertyRow label={t('editor.audioSection.gain')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={volume}
          onChange={handleVolumeChange}
          onLiveChange={handleVolumeLiveChange}
          min={AUDIO_GAIN_DB_MIN}
          max={AUDIO_GAIN_DB_MAX}
          step={0.1}
          unit="dB"
          class="flex-1 min-w-0"
        />
        <KeyframeToggle {itemIds} property="volume" currentValue={demixValue(volume, 0)} />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetVolume}
          title={t('editor.audioSection.resetGain')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>

    <PropertyRow label={t('editor.audioSection.fadeIn')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={fadeIn}
          onChange={handleFadeInChange}
          onLiveChange={handleFadeInLiveChange}
          min={0}
          max={5}
          step={0.1}
          unit="s"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetFadeIn}
          title={t('editor.audioSection.resetToZero')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>

    <PropertyRow label={t('editor.audioSection.fadeOut')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={fadeOut}
          onChange={handleFadeOutChange}
          onLiveChange={handleFadeOutLiveChange}
          min={0}
          max={5}
          step={0.1}
          unit="s"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetFadeOut}
          title={t('editor.audioSection.resetToZero')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>
  </PropertySection>

  <PropertySection title={t('editor.audioSection.pitch')} icon={Music} defaultOpen={true}>
    <PropertyRow label={t('editor.audioSection.semitones')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={pitchSemitones}
          onChange={(value) => handleAudioPitchChange('audioPitchSemitones', value)}
          onLiveChange={(value) => handleAudioPitchLiveChange('audioPitchSemitones', value)}
          liveChangeThrottleMs={AUDIO_PITCH_LIVE_THROTTLE_MS}
          min={AUDIO_PITCH_SEMITONES_MIN}
          max={AUDIO_PITCH_SEMITONES_MAX}
          step={1}
          unit="st"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetPitchSemitones}
          title={t('editor.audioSection.resetSemitones')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>

    <PropertyRow label={t('editor.audioSection.cents')}>
      <div class="flex items-center gap-1 w-full">
        <SliderInput
          value={pitchCents}
          onChange={(value) => handleAudioPitchChange('audioPitchCents', value)}
          onLiveChange={(value) => handleAudioPitchLiveChange('audioPitchCents', value)}
          liveChangeThrottleMs={AUDIO_PITCH_LIVE_THROTTLE_MS}
          min={AUDIO_PITCH_CENTS_MIN}
          max={AUDIO_PITCH_CENTS_MAX}
          step={1}
          unit="ct"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetPitchCents}
          title={t('editor.audioSection.resetCents')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>
  </PropertySection>

  <PropertySection title={t('editor.audioSection.equalizer')} defaultOpen={true}>
    <AudioEqPanelContent {items} targetLabel="" layoutMode="compact" />
  </PropertySection>
{/if}
