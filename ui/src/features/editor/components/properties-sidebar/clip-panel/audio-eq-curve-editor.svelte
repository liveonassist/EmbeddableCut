<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { AUDIO_EQ_HIGH_CUT_FREQUENCY_HZ, AUDIO_EQ_HIGH_CUT_MAX_FREQUENCY_HZ, AUDIO_EQ_HIGH_CUT_MIN_FREQUENCY_HZ, AUDIO_EQ_HIGH_FREQUENCY_HZ, AUDIO_EQ_HIGH_MAX_FREQUENCY_HZ, AUDIO_EQ_HIGH_MIN_FREQUENCY_HZ, AUDIO_EQ_HIGH_MID_FREQUENCY_HZ, AUDIO_EQ_HIGH_MID_MAX_FREQUENCY_HZ, AUDIO_EQ_HIGH_MID_MIN_FREQUENCY_HZ, AUDIO_EQ_LOW_CUT_FREQUENCY_HZ, AUDIO_EQ_LOW_CUT_MAX_FREQUENCY_HZ, AUDIO_EQ_LOW_CUT_MIN_FREQUENCY_HZ, AUDIO_EQ_LOW_FREQUENCY_HZ, AUDIO_EQ_LOW_MAX_FREQUENCY_HZ, AUDIO_EQ_LOW_MID_FREQUENCY_HZ, AUDIO_EQ_LOW_MID_MAX_FREQUENCY_HZ, AUDIO_EQ_LOW_MID_MIN_FREQUENCY_HZ, AUDIO_EQ_LOW_MIN_FREQUENCY_HZ, clampAudioEqFrequencyHz, clampAudioEqGainDb, getAudioEqSettings, resolveAudioEqSettings } from '@/shared/utils/audio-eq'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import type { AudioEqPatch } from './audio-eq-types'

  interface AudioEqCurveEditorProps {
    settings: ResolvedAudioEqSettings
    disabled?: boolean
    class?: string
    graphClass?: string
    onLiveChange: (patch: AudioEqPatch) => void
    onChange: (patch: AudioEqPatch) => void
  }

  type AudioEqHandleId = 'band1' | 'band2' | 'band3' | 'band4' | 'band5' | 'band6'
  type AudioEqGainField =
    | 'audioEqBand1GainDb'
    | 'audioEqLowGainDb'
    | 'audioEqLowMidGainDb'
    | 'audioEqHighMidGainDb'
    | 'audioEqHighGainDb'
    | 'audioEqBand6GainDb'
  type AudioEqFrequencyField =
    | 'audioEqBand1FrequencyHz'
    | 'audioEqLowFrequencyHz'
    | 'audioEqLowMidFrequencyHz'
    | 'audioEqHighMidFrequencyHz'
    | 'audioEqHighFrequencyHz'
    | 'audioEqBand6FrequencyHz'
  type AudioEqActivateField = 'audioEqBand1Enabled' | 'audioEqBand6Enabled'
  type AudioEqInnerActivateField =
    | 'audioEqLowEnabled'
    | 'audioEqLowMidEnabled'
    | 'audioEqHighMidEnabled'
    | 'audioEqHighEnabled'

  interface BaseHandleDefinition {
    id: AudioEqHandleId
    kind: 'gain' | 'cut' | 'notch'
    label: string
    bandNumber: 1 | 2 | 3 | 4 | 5 | 6
    description: string
    frequencyField: AudioEqFrequencyField
    minFrequencyHz: number
    maxFrequencyHz: number
    defaultFrequencyHz: number
    getFrequencyHz: (settings: ResolvedAudioEqSettings) => number
    activateField?: AudioEqActivateField | AudioEqInnerActivateField
  }

  interface GainHandleDefinition extends BaseHandleDefinition {
    kind: 'gain'
    gainField: AudioEqGainField
    getGainDb: (settings: ResolvedAudioEqSettings) => number
  }

  type StaticHandleDefinition = BaseHandleDefinition & {
    kind: 'cut' | 'notch'
  }

  type AudioEqHandleDefinition = GainHandleDefinition | StaticHandleDefinition

  const CURVE_WIDTH = 320
  const CURVE_HEIGHT = 240
  const CURVE_PADDING_X = 2
  const CURVE_PADDING_TOP = 2
  const CURVE_PADDING_BOTTOM = 24
  const CURVE_MIN_FREQUENCY_HZ = 20
  const CURVE_MAX_FREQUENCY_HZ = 19000
  const CURVE_DISPLAY_DB_MAX = 0
  const CURVE_DISPLAY_DB_MIN = -80
  const CURVE_DISPLAY_EQ_BASELINE_DB = -40
  const CURVE_GRID_LEVELS_DB = [0, -10, -20, -30, -40, -50, -60, -70, -80] as const
  const CURVE_GRID_FREQUENCIES_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
  const KEYBOARD_GAIN_STEP_DB = 0.5
  const KEYBOARD_FREQUENCY_RATIO = 1.06
  const KEYBOARD_FREQUENCY_RATIO_FAST = 1.16

  function getAudioEqHandles(
    settings: ResolvedAudioEqSettings,
  ): ReadonlyArray<AudioEqHandleDefinition> {
    return [
      settings.band1Type === 'high-pass'
        ? {
            id: 'band1',
            kind: 'cut',
            label: 'Band 1',
            bandNumber: 1,
            description: 'High Pass',
            frequencyField: 'audioEqBand1FrequencyHz',
            activateField: 'audioEqBand1Enabled',
            minFrequencyHz: AUDIO_EQ_LOW_CUT_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_CUT_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_CUT_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.band1FrequencyHz,
          }
        : {
            id: 'band1',
            kind: 'gain',
            label: 'Band 1',
            bandNumber: 1,
            description:
              settings.band1Type === 'low-shelf'
                ? 'Low Shelf'
                : settings.band1Type === 'high-shelf'
                  ? 'High Shelf'
                  : 'Peak',
            frequencyField: 'audioEqBand1FrequencyHz',
            gainField: 'audioEqBand1GainDb',
            activateField: 'audioEqBand1Enabled',
            minFrequencyHz: AUDIO_EQ_LOW_CUT_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_CUT_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_CUT_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.band1FrequencyHz,
            getGainDb: (resolved) => resolved.band1GainDb,
          },
      settings.lowType === 'notch'
        ? {
            id: 'band2',
            kind: 'notch',
            label: 'Band 2',
            bandNumber: 2,
            description: 'Notch',
            frequencyField: 'audioEqLowFrequencyHz',
            activateField: 'audioEqLowEnabled',
            minFrequencyHz: AUDIO_EQ_LOW_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.lowFrequencyHz,
          }
        : {
            id: 'band2',
            kind: 'gain',
            label: 'Band 2',
            bandNumber: 2,
            description:
              settings.lowType === 'high-shelf'
                ? 'High Shelf'
                : settings.lowType === 'peaking'
                  ? 'Peak'
                  : 'Low Shelf',
            frequencyField: 'audioEqLowFrequencyHz',
            gainField: 'audioEqLowGainDb',
            activateField: 'audioEqLowEnabled',
            minFrequencyHz: AUDIO_EQ_LOW_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.lowFrequencyHz,
            getGainDb: (resolved) => resolved.lowGainDb,
          },
      settings.lowMidType === 'notch'
        ? {
            id: 'band3',
            kind: 'notch',
            label: 'Band 3',
            bandNumber: 3,
            description: 'Notch',
            frequencyField: 'audioEqLowMidFrequencyHz',
            activateField: 'audioEqLowMidEnabled',
            minFrequencyHz: AUDIO_EQ_LOW_MID_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_MID_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_MID_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.lowMidFrequencyHz,
          }
        : {
            id: 'band3',
            kind: 'gain',
            label: 'Band 3',
            bandNumber: 3,
            description:
              settings.lowMidType === 'high-shelf'
                ? 'High Shelf'
                : settings.lowMidType === 'peaking'
                  ? 'Peak'
                  : 'Low Shelf',
            frequencyField: 'audioEqLowMidFrequencyHz',
            gainField: 'audioEqLowMidGainDb',
            activateField: 'audioEqLowMidEnabled',
            minFrequencyHz: AUDIO_EQ_LOW_MID_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_LOW_MID_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_LOW_MID_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.lowMidFrequencyHz,
            getGainDb: (resolved) => resolved.lowMidGainDb,
          },
      settings.highMidType === 'notch'
        ? {
            id: 'band4',
            kind: 'notch',
            label: 'Band 4',
            bandNumber: 4,
            description: 'Notch',
            frequencyField: 'audioEqHighMidFrequencyHz',
            activateField: 'audioEqHighMidEnabled',
            minFrequencyHz: AUDIO_EQ_HIGH_MID_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_MID_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_MID_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.highMidFrequencyHz,
          }
        : {
            id: 'band4',
            kind: 'gain',
            label: 'Band 4',
            bandNumber: 4,
            description:
              settings.highMidType === 'high-shelf'
                ? 'High Shelf'
                : settings.highMidType === 'peaking'
                  ? 'Peak'
                  : 'Low Shelf',
            frequencyField: 'audioEqHighMidFrequencyHz',
            gainField: 'audioEqHighMidGainDb',
            activateField: 'audioEqHighMidEnabled',
            minFrequencyHz: AUDIO_EQ_HIGH_MID_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_MID_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_MID_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.highMidFrequencyHz,
            getGainDb: (resolved) => resolved.highMidGainDb,
          },
      settings.highType === 'notch'
        ? {
            id: 'band5',
            kind: 'notch',
            label: 'Band 5',
            bandNumber: 5,
            description: 'Notch',
            frequencyField: 'audioEqHighFrequencyHz',
            activateField: 'audioEqHighEnabled',
            minFrequencyHz: AUDIO_EQ_HIGH_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.highFrequencyHz,
          }
        : {
            id: 'band5',
            kind: 'gain',
            label: 'Band 5',
            bandNumber: 5,
            description:
              settings.highType === 'low-shelf'
                ? 'Low Shelf'
                : settings.highType === 'peaking'
                  ? 'Peak'
                  : 'High Shelf',
            frequencyField: 'audioEqHighFrequencyHz',
            gainField: 'audioEqHighGainDb',
            activateField: 'audioEqHighEnabled',
            minFrequencyHz: AUDIO_EQ_HIGH_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.highFrequencyHz,
            getGainDb: (resolved) => resolved.highGainDb,
          },
      settings.band6Type === 'low-pass'
        ? {
            id: 'band6',
            kind: 'cut',
            label: 'Band 6',
            bandNumber: 6,
            description: 'Low Pass',
            frequencyField: 'audioEqBand6FrequencyHz',
            activateField: 'audioEqBand6Enabled',
            minFrequencyHz: AUDIO_EQ_HIGH_CUT_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_CUT_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_CUT_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.band6FrequencyHz,
          }
        : {
            id: 'band6',
            kind: 'gain',
            label: 'Band 6',
            bandNumber: 6,
            description:
              settings.band6Type === 'low-shelf'
                ? 'Low Shelf'
                : settings.band6Type === 'high-shelf'
                  ? 'High Shelf'
                  : 'Peak',
            frequencyField: 'audioEqBand6FrequencyHz',
            gainField: 'audioEqBand6GainDb',
            activateField: 'audioEqBand6Enabled',
            minFrequencyHz: AUDIO_EQ_HIGH_CUT_MIN_FREQUENCY_HZ,
            maxFrequencyHz: AUDIO_EQ_HIGH_CUT_MAX_FREQUENCY_HZ,
            defaultFrequencyHz: AUDIO_EQ_HIGH_CUT_FREQUENCY_HZ,
            getFrequencyHz: (resolved) => resolved.band6FrequencyHz,
            getGainDb: (resolved) => resolved.band6GainDb,
          },
    ]
  }

  function clampEqGainDb(value: number): number {
    return Math.round(clampAudioEqGainDb(value) * 10) / 10
  }

  function roundFrequency(value: number): number {
    return Math.round(value)
  }

  function frequencyToX(frequencyHz: number): number {
    const clampedFrequencyHz = Math.max(
      CURVE_MIN_FREQUENCY_HZ,
      Math.min(CURVE_MAX_FREQUENCY_HZ, frequencyHz),
    )
    const normalized =
      (Math.log(clampedFrequencyHz) - Math.log(CURVE_MIN_FREQUENCY_HZ)) /
      (Math.log(CURVE_MAX_FREQUENCY_HZ) - Math.log(CURVE_MIN_FREQUENCY_HZ))
    return CURVE_PADDING_X + normalized * (CURVE_WIDTH - CURVE_PADDING_X * 2)
  }

  function xToFrequency(x: number): number {
    const plotWidth = CURVE_WIDTH - CURVE_PADDING_X * 2
    const clampedX = Math.max(CURVE_PADDING_X, Math.min(CURVE_WIDTH - CURVE_PADDING_X, x))
    const normalized = (clampedX - CURVE_PADDING_X) / Math.max(plotWidth, 1)
    return (
      CURVE_MIN_FREQUENCY_HZ * Math.pow(CURVE_MAX_FREQUENCY_HZ / CURVE_MIN_FREQUENCY_HZ, normalized)
    )
  }

  function displayDbToY(displayDb: number): number {
    const clamped = Math.max(CURVE_DISPLAY_DB_MIN, Math.min(CURVE_DISPLAY_DB_MAX, displayDb))
    const normalized =
      (CURVE_DISPLAY_DB_MAX - clamped) / (CURVE_DISPLAY_DB_MAX - CURVE_DISPLAY_DB_MIN)
    return CURVE_PADDING_TOP + normalized * (CURVE_HEIGHT - CURVE_PADDING_TOP - CURVE_PADDING_BOTTOM)
  }

  function gainToY(gainDb: number): number {
    return displayDbToY(CURVE_DISPLAY_EQ_BASELINE_DB + clampEqGainDb(gainDb))
  }

  function yToGain(y: number): number {
    const plotHeight = CURVE_HEIGHT - CURVE_PADDING_TOP - CURVE_PADDING_BOTTOM
    const clampedY = Math.max(CURVE_PADDING_TOP, Math.min(CURVE_HEIGHT - CURVE_PADDING_BOTTOM, y))
    const normalized = (clampedY - CURVE_PADDING_TOP) / plotHeight
    const displayDb =
      CURVE_DISPLAY_DB_MAX - normalized * (CURVE_DISPLAY_DB_MAX - CURVE_DISPLAY_DB_MIN)
    return clampEqGainDb(displayDb - CURVE_DISPLAY_EQ_BASELINE_DB)
  }

  function formatFrequencyLabel(frequencyHz: number): string {
    if (frequencyHz >= 1000) {
      const khz = frequencyHz / 1000
      return `${Number.isInteger(khz) ? khz.toFixed(0) : khz.toFixed(1)}k`
    }
    return `${Math.round(frequencyHz)}`
  }

  function nudgeFrequency(
    currentFrequencyHz: number,
    direction: -1 | 1,
    fast: boolean,
    minFrequencyHz: number,
    maxFrequencyHz: number,
  ): number {
    const ratio = fast ? KEYBOARD_FREQUENCY_RATIO_FAST : KEYBOARD_FREQUENCY_RATIO
    const nextFrequencyHz = direction < 0 ? currentFrequencyHz / ratio : currentFrequencyHz * ratio
    return roundFrequency(
      clampAudioEqFrequencyHz(nextFrequencyHz, minFrequencyHz, maxFrequencyHz, currentFrequencyHz),
    )
  }

  function mergeDisplayedSettings(
    settings: ResolvedAudioEqSettings,
    patch?: AudioEqPatch | null,
  ): ResolvedAudioEqSettings {
    if (!patch) return settings
    const patchSettings = getAudioEqSettings(patch)
    const merged: Record<string, unknown> = { ...settings }
    for (const [key, value] of Object.entries(patchSettings)) {
      if (value !== undefined) {
        merged[key] = value
      }
    }
    return resolveAudioEqSettings(merged as unknown as ResolvedAudioEqSettings)
  }

  function getCutHandleY(): number {
    return displayDbToY(CURVE_DISPLAY_EQ_BASELINE_DB)
  }

  function isHandleEnabled(
    settings: ResolvedAudioEqSettings,
    handle: AudioEqHandleDefinition,
  ): boolean {
    switch (handle.activateField) {
      case 'audioEqBand1Enabled':
        return settings.band1Enabled
      case 'audioEqLowEnabled':
        return settings.lowEnabled
      case 'audioEqLowMidEnabled':
        return settings.lowMidEnabled
      case 'audioEqHighMidEnabled':
        return settings.highMidEnabled
      case 'audioEqHighEnabled':
        return settings.highEnabled
      case 'audioEqBand6Enabled':
        return settings.band6Enabled
      default:
        return true
    }
  }

  function createPatchForPointer(
    handle: AudioEqHandleDefinition,
    localX: number,
    localY: number,
  ): AudioEqPatch {
    const frequencyHz = roundFrequency(
      clampAudioEqFrequencyHz(
        xToFrequency(localX),
        handle.minFrequencyHz,
        handle.maxFrequencyHz,
        handle.defaultFrequencyHz,
      ),
    )

    if (handle.kind === 'cut' || handle.kind === 'notch') {
      return {
        [handle.frequencyField]: frequencyHz,
      }
    }

    const gainHandle = handle as GainHandleDefinition
    const patch: AudioEqPatch = {
      [gainHandle.gainField]: yToGain(localY),
    }
    patch[gainHandle.frequencyField] = frequencyHz
    return patch
  }

  function getResetPatch(handle: AudioEqHandleDefinition): AudioEqPatch {
    if (handle.kind === 'cut') {
      return {
        ...(handle.activateField ? { [handle.activateField]: false } : {}),
        [handle.frequencyField]: handle.defaultFrequencyHz,
      }
    }

    if (handle.kind === 'notch') {
      return {
        ...(handle.activateField ? { [handle.activateField]: false } : {}),
        [handle.frequencyField]: handle.defaultFrequencyHz,
      }
    }

    const gainHandle = handle as GainHandleDefinition
    const patch: AudioEqPatch = {
      ...(gainHandle.activateField ? { [gainHandle.activateField]: false } : {}),
      [gainHandle.gainField]: 0,
    }
    patch[gainHandle.frequencyField] = gainHandle.defaultFrequencyHz
    return patch
  }
</script>

<script lang="ts">
  import { sampleAudioEqResponseCurve } from '@/shared/utils/audio-eq'
  import { cn } from '@/shared/ui/cn'

  let {
    settings,
    disabled = false,
    class: className,
    graphClass,
    onLiveChange,
    onChange,
  }: AudioEqCurveEditorProps = $props()

  let root: HTMLDivElement | null = null
  let dragBaseSettings = $state.raw<ResolvedAudioEqSettings | null>(null)
  let dragState = $state<{
    handleId: AudioEqHandleDefinition['id']
    pointerId: number
  } | null>(null)
  let draftPatch = $state.raw<AudioEqPatch | null>(null)
  const displayedBaseSettings = $derived(dragState ? (dragBaseSettings ?? settings) : settings)

  const displayedSettings = $derived(mergeDisplayedSettings(displayedBaseSettings, draftPatch))

  const responsePoints = $derived(
    sampleAudioEqResponseCurve(displayedSettings, {
      sampleCount: 96,
      minFrequencyHz: CURVE_MIN_FREQUENCY_HZ,
      maxFrequencyHz: CURVE_MAX_FREQUENCY_HZ,
    }),
  )

  const responsePath = $derived(
    responsePoints
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${frequencyToX(point.frequencyHz)} ${gainToY(point.gainDb)}`,
      )
      .join(' '),
  )
  const handles = $derived(getAudioEqHandles(displayedSettings))
  const visibleHandles = $derived(
    handles.filter((handle) => isHandleEnabled(displayedSettings, handle)),
  )

  const getLocalPointer = (clientX: number, clientY: number) => {
    if (!root) return null
    const rect = root.getBoundingClientRect()
    if (!rect.width || !rect.height) return null

    return {
      x: ((clientX - rect.left) / rect.width) * CURVE_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CURVE_HEIGHT,
    }
  }

  const beginDrag = (
    handle: AudioEqHandleDefinition,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => {
    if (disabled) return
    const localPointer = getLocalPointer(clientX, clientY)
    if (!root || !localPointer) return

    root.setPointerCapture?.(pointerId)
    dragBaseSettings = settings
    const patch = createPatchForPointer(handle, localPointer.x, localPointer.y)
    dragState = { handleId: handle.id, pointerId }
    draftPatch = patch
    onLiveChange(patch)
  }

  const updateDrag = (clientX: number, clientY: number) => {
    if (!dragState) return
    const localPointer = getLocalPointer(clientX, clientY)
    if (!localPointer) return

    const handleId = dragState.handleId
    const handle = handles.find((entry) => entry.id === handleId)
    if (!handle) return

    const patch = createPatchForPointer(handle, localPointer.x, localPointer.y)
    draftPatch = patch
    onLiveChange(patch)
  }

  const finishDrag = (pointerId?: number) => {
    if (!dragState) return
    if (pointerId !== undefined && dragState.pointerId !== pointerId) return

    root?.releasePointerCapture?.(dragState.pointerId)
    dragBaseSettings = null

    const patch = draftPatch ?? {}
    dragState = null
    draftPatch = null
    onChange(patch)
  }

  const handleBandReset = (handle: AudioEqHandleDefinition) => {
    if (disabled) return
    dragBaseSettings = null
    const patch = getResetPatch(handle)
    draftPatch = null
    onLiveChange(patch)
    onChange(patch)
  }

  const handleBandKeyDown = (handle: AudioEqHandleDefinition, event: KeyboardEvent) => {
    if (disabled) return

    if (handle.kind === 'cut' || handle.kind === 'notch') {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()

      const patch =
        event.key === 'Home'
          ? getResetPatch(handle)
          : {
              [handle.frequencyField]: nudgeFrequency(
                handle.getFrequencyHz(displayedSettings),
                event.key === 'ArrowLeft' ? -1 : 1,
                event.shiftKey,
                handle.minFrequencyHz,
                handle.maxFrequencyHz,
              ),
            }
      onLiveChange(patch)
      onChange(patch)
      return
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()

    const gainHandle = handle as GainHandleDefinition
    const currentFrequencyHz = gainHandle.getFrequencyHz(displayedSettings)
    const currentGainDb = gainHandle.getGainDb(displayedSettings)

    const patch: AudioEqPatch =
      event.key === 'Home'
        ? getResetPatch(gainHandle)
        : {
            [gainHandle.gainField]:
              event.key === 'ArrowUp' || event.key === 'ArrowDown'
                ? clampEqGainDb(
                    currentGainDb +
                      (event.key === 'ArrowUp' ? 1 : -1) *
                        (event.shiftKey ? 1 : KEYBOARD_GAIN_STEP_DB),
                  )
                : currentGainDb,
          }

    if (event.key !== 'Home') {
      patch[gainHandle.frequencyField] =
        event.key === 'ArrowLeft' || event.key === 'ArrowRight'
          ? nudgeFrequency(
              currentFrequencyHz,
              event.key === 'ArrowLeft' ? -1 : 1,
              event.shiftKey,
              gainHandle.minFrequencyHz,
              gainHandle.maxFrequencyHz,
            )
          : currentFrequencyHz
    }

    onLiveChange(patch)
    onChange(patch)
  }

  const getHandleTitle = (handle: AudioEqHandleDefinition, frequencyHz: number) => {
    if (handle.kind === 'cut' || handle.kind === 'notch') {
      return `${handle.label} ${handle.description} ${formatFrequencyLabel(frequencyHz)}`
    }
    const gainDb = (handle as GainHandleDefinition).getGainDb(displayedSettings)
    return `${handle.label} ${handle.description} ${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB @ ${formatFrequencyLabel(frequencyHz)}`
  }
</script>

<div class={cn('w-full min-w-0', className)}>
  <div
    bind:this={root}
    data-eq-curve-root="true"
    role="presentation"
    class={cn(
      'relative w-full overflow-hidden touch-none select-none',
      graphClass ?? 'h-[180px] rounded-md border border-border/60 bg-muted/20',
      disabled ? 'opacity-60' : 'cursor-move',
    )}
    onpointermove={(event) => {
      if (!dragState) return
      updateDrag(event.clientX, event.clientY)
    }}
    onpointerup={(event) => {
      finishDrag(event.pointerId)
    }}
    onpointercancel={(event) => {
      finishDrag(event.pointerId)
    }}
  >
    <svg
      viewBox="0 0 {CURVE_WIDTH} {CURVE_HEIGHT}"
      preserveAspectRatio="none"
      class="h-full w-full"
      aria-label="EQ curve editor"
    >
      {#each CURVE_GRID_LEVELS_DB as level (level)}
        <line
          x1={CURVE_PADDING_X}
          y1={displayDbToY(level)}
          x2={CURVE_WIDTH - CURVE_PADDING_X}
          y2={displayDbToY(level)}
          stroke="currentColor"
          stroke-opacity={level === CURVE_DISPLAY_EQ_BASELINE_DB ? 0.28 : 0.1}
          stroke-dasharray={level === CURVE_DISPLAY_EQ_BASELINE_DB ? undefined : '2 3'}
        />
      {/each}

      {#each CURVE_GRID_FREQUENCIES_HZ as frequencyHz (frequencyHz)}
        <line
          x1={frequencyToX(frequencyHz)}
          y1={CURVE_PADDING_TOP}
          x2={frequencyToX(frequencyHz)}
          y2={CURVE_HEIGHT - CURVE_PADDING_BOTTOM}
          stroke="currentColor"
          stroke-opacity={0.08}
          stroke-dasharray="2 3"
        />
      {/each}

      <path d={responsePath} fill="none" stroke="currentColor" stroke-opacity={0.9} stroke-width={2} />
    </svg>

    {#each CURVE_GRID_LEVELS_DB as level (`db-${level}`)}
      <div
        class="pointer-events-none absolute left-1.5 -translate-y-1/2 text-[10px] leading-none text-current opacity-40"
        style:top="{(displayDbToY(level) / CURVE_HEIGHT) * 100}%"
      >
        {level > 0 ? `+${level}` : level}
      </div>
    {/each}

    {#each CURVE_GRID_FREQUENCIES_HZ as frequencyHz (`freq-${frequencyHz}`)}
      <div
        class="pointer-events-none absolute -translate-x-1/2 text-[10px] leading-none text-current opacity-45"
        style:left="{(frequencyToX(frequencyHz) / CURVE_WIDTH) * 100}%"
        style:bottom="3px"
      >
        {formatFrequencyLabel(frequencyHz)}
      </div>
    {/each}

    {#each visibleHandles as handle (handle.id)}
      {@const frequencyHz = handle.getFrequencyHz(displayedSettings)}
      {@const isActive = dragState?.handleId === handle.id}
      {@const top =
        handle.kind === 'cut' || handle.kind === 'notch'
          ? getCutHandleY()
          : gainToY((handle as GainHandleDefinition).getGainDb(displayedSettings))}
      <button
        type="button"
        data-eq-band={handle.id}
        aria-label="{handle.label} EQ handle"
        class={cn(
          'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-background shadow-sm transition-[transform,background-color,color] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 flex items-center justify-center font-mono font-semibold leading-none',
          isActive
            ? 'h-5 w-5 scale-110 bg-foreground text-background'
            : 'h-[18px] w-[18px] bg-primary text-primary-foreground',
          disabled && 'pointer-events-none',
        )}
        style:left="{(frequencyToX(frequencyHz) / CURVE_WIDTH) * 100}%"
        style:top="{(top / CURVE_HEIGHT) * 100}%"
        onpointerdown={(event) => {
          event.preventDefault()
          beginDrag(handle, event.pointerId, event.clientX, event.clientY)
        }}
        ondblclick={() => {
          handleBandReset(handle)
        }}
        onkeydown={(event) => {
          handleBandKeyDown(handle, event)
        }}
        title={getHandleTitle(handle, frequencyHz)}
      >
        <span class="text-[8px]" data-eq-band-number={handle.bandNumber}>
          {handle.bandNumber}
        </span>
      </button>
    {/each}

    {#if disabled}
      <div
        class="pointer-events-none absolute inset-x-0 top-2 text-center text-[10px] text-muted-foreground"
      >
        Mixed EQ values
      </div>
    {/if}
  </div>
</div>
