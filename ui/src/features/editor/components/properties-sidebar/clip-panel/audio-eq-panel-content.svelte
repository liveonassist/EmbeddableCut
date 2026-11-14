<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { updateItem } from '@/features/editor/deps/timeline-store'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import type { TimelineItem } from '@/types/timeline'
  import type { AudioEqSettings } from '@/types/audio'
  import { demixValue } from '../utils/mixed-value'
  import type { AudioEqPatch } from './audio-eq-types'
  import { getAudioSectionItems } from './audio-section-utils'
  import {
    getEqControlsDisabled,
    getEqPresetPlaceholder,
    hasMixedEqDisplayValues,
    resolveEqDisplayValues,
  } from './audio-eq-panel-values'
  import { getAudioEqPanelBandViews, type AudioEqBandView } from './audio-eq-panel-bands'
  import { AudioEqPanelGainBands } from './audio-eq-panel-band-cards'
  import { CompactBandRows } from './audio-eq-panel-compact-bands'
  import AudioEqPanelGraph from './audio-eq-panel-graph.svelte'
  import { AudioEqPanelCompactToolbar, AudioEqPanelHeader } from './audio-eq-panel-toolbar'
  import {
    DEFAULT_GAIN_BAND_CONTROL_RANGES,
    buildTimelineEqPatchFromResolvedSettings,
    clampFrequencyToAudioEqControlRange,
    normalizeUiEqPatch,
    toTimelineEqPatch,
    type AudioEqControlRangeId,
    type AudioEqGainBandControlRanges,
  } from './audio-eq-ui'
  import {
    AUDIO_EQ_HIGH_CUT_FREQUENCY_HZ,
    AUDIO_EQ_HIGH_FREQUENCY_HZ,
    AUDIO_EQ_HIGH_MID_FREQUENCY_HZ,
    AUDIO_EQ_HIGH_MID_Q,
    AUDIO_EQ_LOW_CUT_FREQUENCY_HZ,
    AUDIO_EQ_LOW_FREQUENCY_HZ,
    AUDIO_EQ_LOW_MID_FREQUENCY_HZ,
    AUDIO_EQ_LOW_MID_Q,
    type AudioEqPresetId,
    findAudioEqPresetId,
    getAudioEqPresetById,
    resolveAudioEqSettings,
  } from '@/shared/utils/audio-eq'

  interface AudioEqPanelContentProps {
    targetLabel: string
    items?: TimelineItem[]
    trackEq?: AudioEqSettings
    enabled?: boolean
    onTrackEqChange?: (patch: AudioEqPatch) => void
    onEnabledChange?: (enabled: boolean) => void
    portalContainer?: HTMLElement | null
    layoutMode?: 'floating' | 'detached' | 'compact'
  }

  let {
    items,
    targetLabel,
    trackEq,
    enabled = true,
    onTrackEqChange,
    onEnabledChange,
    portalContainer,
    layoutMode = 'floating',
  }: AudioEqPanelContentProps = $props()

  const isTrackMode = $derived(onTrackEqChange !== undefined)
  const isDetachedLayout = $derived(layoutMode === 'detached')
  const isCompactLayout = $derived(layoutMode === 'compact')
  const eqEnabled = $derived(enabled !== false)

  const audioItems = $derived(isTrackMode ? [] : getAudioSectionItems(items ?? []))
  const itemIds = $derived(audioItems.map((item) => item.id))

  const clipEqEnabled = $derived.by(() => {
    if (isTrackMode || audioItems.length === 0) return true
    return audioItems.every((item) => item.audioEqEnabled === true)
  })

  const handleClipEqEnabledChange = (checked: boolean) => {
    itemIds.forEach((id) => updateItem(id, { audioEqEnabled: checked }))
  }

  const resolvedTrackEq = $derived(isTrackMode ? resolveAudioEqSettings(trackEq ?? {}) : null)
  const resolvedItemEqSettings = $derived(
    audioItems.map((item) => resolveAudioEqSettings(item)),
  )

  let livePatch = $state.raw<AudioEqPatch | null>(null)
  let gainBandControlRanges = $state.raw<AudioEqGainBandControlRanges>(
    DEFAULT_GAIN_BAND_CONTROL_RANGES,
  )

  $effect.pre(() => {
    void targetLabel
    untrack(() => {
      livePatch = null
      gainBandControlRanges = DEFAULT_GAIN_BAND_CONTROL_RANGES
    })
  })

  const eqValues = $derived(
    resolveEqDisplayValues(livePatch, resolvedTrackEq, resolvedItemEqSettings),
  )
  const bandViews = $derived(getAudioEqPanelBandViews(eqValues, gainBandControlRanges))

  const hasMixedEqValues = $derived(hasMixedEqDisplayValues(eqValues))

  const eqControlsDisabled = $derived(
    getEqControlsDisabled(hasMixedEqValues, isCompactLayout, eqEnabled, clipEqEnabled),
  )

  const eqCurveSettings = $derived(
    resolveAudioEqSettings({
      outputGainDb: demixValue(eqValues.outputGainDb, 0),
      band1Enabled: demixValue(eqValues.band1Enabled, false),
      band1Type: demixValue(eqValues.band1Type, 'high-pass'),
      band1FrequencyHz: demixValue(eqValues.band1FrequencyHz, AUDIO_EQ_LOW_CUT_FREQUENCY_HZ),
      band1GainDb: demixValue(eqValues.band1GainDb, 0),
      band1Q: demixValue(eqValues.band1Q, AUDIO_EQ_LOW_MID_Q),
      band1SlopeDbPerOct: demixValue(eqValues.band1SlopeDbPerOct, 12),
      lowEnabled: demixValue(eqValues.lowEnabled, true),
      lowType: demixValue(eqValues.lowType, 'low-shelf'),
      lowGainDb: demixValue(eqValues.lowGainDb, 0),
      lowFrequencyHz: demixValue(eqValues.lowFrequencyHz, AUDIO_EQ_LOW_FREQUENCY_HZ),
      lowQ: demixValue(eqValues.lowQ, AUDIO_EQ_LOW_MID_Q),
      lowMidEnabled: demixValue(eqValues.lowMidEnabled, true),
      lowMidType: demixValue(eqValues.lowMidType, 'peaking'),
      lowMidGainDb: demixValue(eqValues.lowMidGainDb, 0),
      lowMidFrequencyHz: demixValue(eqValues.lowMidFrequencyHz, AUDIO_EQ_LOW_MID_FREQUENCY_HZ),
      lowMidQ: demixValue(eqValues.lowMidQ, AUDIO_EQ_LOW_MID_Q),
      midGainDb: 0,
      highMidEnabled: demixValue(eqValues.highMidEnabled, true),
      highMidType: demixValue(eqValues.highMidType, 'peaking'),
      highMidGainDb: demixValue(eqValues.highMidGainDb, 0),
      highMidFrequencyHz: demixValue(eqValues.highMidFrequencyHz, AUDIO_EQ_HIGH_MID_FREQUENCY_HZ),
      highMidQ: demixValue(eqValues.highMidQ, AUDIO_EQ_HIGH_MID_Q),
      highEnabled: demixValue(eqValues.highEnabled, true),
      highType: demixValue(eqValues.highType, 'high-shelf'),
      highGainDb: demixValue(eqValues.highGainDb, 0),
      highFrequencyHz: demixValue(eqValues.highFrequencyHz, AUDIO_EQ_HIGH_FREQUENCY_HZ),
      highQ: demixValue(eqValues.highQ, AUDIO_EQ_HIGH_MID_Q),
      band6Enabled: demixValue(eqValues.band6Enabled, false),
      band6Type: demixValue(eqValues.band6Type, 'low-pass'),
      band6FrequencyHz: demixValue(eqValues.band6FrequencyHz, AUDIO_EQ_HIGH_CUT_FREQUENCY_HZ),
      band6GainDb: demixValue(eqValues.band6GainDb, 0),
      band6Q: demixValue(eqValues.band6Q, AUDIO_EQ_HIGH_MID_Q),
      band6SlopeDbPerOct: demixValue(eqValues.band6SlopeDbPerOct, 12),
    }),
  )
  const selectedEqPresetId = $derived(
    hasMixedEqValues ? null : findAudioEqPresetId(eqCurveSettings),
  )

  const eqPresetPlaceholder = $derived(
    getEqPresetPlaceholder(hasMixedEqValues, selectedEqPresetId),
  )

  let previewThrottle: ReturnType<typeof setTimeout> | null = null
  let pendingPreview: AudioEqPatch | null = null

  const clearClipEqPreview = () => {
    if (isTrackMode || itemIds.length === 0) {
      return
    }
    useGizmoStore.getState().clearPreviewForItems(itemIds)
  }

  $effect(() => {
    if (isTrackMode) {
      return
    }
    // The cleanup clears the previews of the items this run saw, as React's
    // closure did, so read them now.
    const ids = itemIds

    return () => {
      if (previewThrottle) {
        clearTimeout(previewThrottle)
        previewThrottle = null
      }
      pendingPreview = null
      if (ids.length > 0) {
        useGizmoStore.getState().clearPreviewForItems(ids)
      }
    }
  })

  const handleEqPatchLiveChange = (patch: AudioEqPatch) => {
    const normalizedPatch = normalizeUiEqPatch(patch)
    livePatch = normalizedPatch
    if (!isTrackMode) {
      if (isCompactLayout) {
        // Throttle audio preview for clip EQ to avoid audio jitter during drag
        pendingPreview = normalizedPatch
        if (!previewThrottle) {
          previewThrottle = setTimeout(() => {
            previewThrottle = null
            const pending = pendingPreview
            if (pending) {
              pendingPreview = null
              const previews: Record<string, AudioEqPatch> = {}
              itemIds.forEach((id) => {
                previews[id] = pending
              })
              useGizmoStore.getState().setPropertiesPreviewNew(previews)
            }
          }, 80)
        }
      } else {
        const previews: Record<string, AudioEqPatch> = {}
        itemIds.forEach((id) => {
          previews[id] = normalizedPatch
        })
        useGizmoStore.getState().setPropertiesPreviewNew(previews)
      }
    }
  }

  const handleEqPatchChange = (patch: AudioEqPatch) => {
    // Flush any pending throttled preview
    if (previewThrottle) {
      clearTimeout(previewThrottle)
      previewThrottle = null
    }
    pendingPreview = null

    livePatch = null
    if (isTrackMode && onTrackEqChange) {
      onTrackEqChange(patch)
    } else {
      const normalizedPatch = toTimelineEqPatch(patch)
      itemIds.forEach((id) => updateItem(id, normalizedPatch))
      queueMicrotask(() => clearClipEqPreview())
    }
  }

  const handleEqPresetChange = (presetId: string) => {
    const preset = getAudioEqPresetById(presetId as AudioEqPresetId)
    if (!preset) return

    if (previewThrottle) {
      clearTimeout(previewThrottle)
      previewThrottle = null
    }
    pendingPreview = null
    livePatch = null
    if (isTrackMode && onTrackEqChange) {
      onTrackEqChange(buildTimelineEqPatchFromResolvedSettings(preset.settings))
    } else {
      const patch = buildTimelineEqPatchFromResolvedSettings(preset.settings)
      itemIds.forEach((id) => updateItem(id, patch))
      queueMicrotask(() => clearClipEqPreview())
    }
  }

  const handleEqFieldChange = <K extends keyof AudioEqPatch>(
    field: K,
    value: NonNullable<AudioEqPatch[K]>,
  ) => {
    handleEqPatchChange({ [field]: value } as AudioEqPatch)
  }

  const handleEqFieldLiveChange = <K extends keyof AudioEqPatch>(
    field: K,
    value: NonNullable<AudioEqPatch[K]>,
  ) => {
    handleEqPatchLiveChange({ [field]: value } as AudioEqPatch)
  }

  const handleBandRangeChange = (view: AudioEqBandView, rangeId: AudioEqControlRangeId) => {
    const { rangeKey, frequencyField, frequencyHz } = view
    if (!rangeKey) return
    gainBandControlRanges = { ...gainBandControlRanges, [rangeKey]: rangeId }
    if (frequencyHz === 'mixed') return
    const nextFrequencyHz = clampFrequencyToAudioEqControlRange(frequencyHz, rangeId)
    if (nextFrequencyHz !== frequencyHz) {
      handleEqFieldChange(frequencyField, nextFrequencyHz)
    }
  }
</script>

{#if !isTrackMode && audioItems.length === 0}
  <div class="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
    No audio clips on {targetLabel}.
  </div>
{:else}
  <div class="flex flex-col bg-background text-foreground">
    {#if !isCompactLayout}
      <AudioEqPanelHeader
        {targetLabel}
        {eqEnabled}
        presetId={selectedEqPresetId}
        presetPlaceholder={eqPresetPlaceholder}
        {onEnabledChange}
        onPresetChange={handleEqPresetChange}
        {portalContainer}
      />
    {/if}

    <div class="flex-1 overflow-auto">
      {#if isCompactLayout}
        <AudioEqPanelCompactToolbar
          {clipEqEnabled}
          presetId={selectedEqPresetId}
          presetPlaceholder={eqPresetPlaceholder}
          onClipEqEnabledChange={handleClipEqEnabledChange}
          onPresetChange={handleEqPresetChange}
          {portalContainer}
        />
      {/if}
      <AudioEqPanelGraph
        settings={eqCurveSettings}
        outputGainDb={eqValues.outputGainDb}
        disabled={eqControlsDisabled}
        detached={isDetachedLayout}
        compact={isCompactLayout}
        trackMode={isTrackMode}
        clipCount={audioItems.length}
        onPatchLiveChange={handleEqPatchLiveChange}
        onPatchChange={handleEqPatchChange}
        onFieldChange={handleEqFieldChange}
      />
      {#if isCompactLayout}
        <CompactBandRows
          views={bandViews}
          disabled={eqControlsDisabled}
          onFieldChange={handleEqFieldChange}
          onFieldLiveChange={handleEqFieldLiveChange}
          {portalContainer}
        />
      {:else}
        <AudioEqPanelGainBands
          views={bandViews}
          detached={isDetachedLayout}
          disabled={eqControlsDisabled}
          onFieldChange={handleEqFieldChange}
          onFieldLiveChange={handleEqFieldLiveChange}
          onPatchChange={handleEqPatchChange}
          onRangeChange={handleBandRangeChange}
          {portalContainer}
        />
      {/if}
    </div>
  </div>
{/if}
