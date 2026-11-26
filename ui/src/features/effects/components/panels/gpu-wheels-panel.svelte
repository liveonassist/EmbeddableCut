<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { GpuEffectDefinition } from '@/infrastructure/gpu-effects'
  import { clamp, getParamDecimals } from './gpu-wheels-panel-shared'

  const MAX_WHEEL_SIZE = 100
  const MAX_DOCK_WHEEL_SIZE = 200
  const MIN_WHEEL_SIZE = 64
  const MIN_DOCK_WHEEL_SIZE = 48
  const GRID_GAP_PX = 4
  const DOCK_WHEEL_GRID_GAP_PX = 28
  // Vertical space each dock wheel column needs besides the wheel itself:
  // header (20) + column gaps (2x8) + value chips with accents (24) + thumb wheel (16)
  const DOCK_WHEEL_EXTRAS_PX = 76

  function readNumberParam(
    definition: GpuEffectDefinition,
    params: Record<string, number | boolean | string>,
    key: string,
    fallback = 0,
  ) {
    const value = params[key]
    const defaultValue = definition.params[key]?.default
    if (typeof value === 'number') return value
    if (typeof defaultValue === 'number') return defaultValue
    return fallback
  }

  function clampParamValue(
    param: GpuEffectDefinition['params'][string] | undefined,
    value: number,
  ) {
    const min = typeof param?.min === 'number' ? param.min : value
    const max = typeof param?.max === 'number' ? param.max : value
    return clamp(value, min, max)
  }

  const WHEEL_DESCRIPTORS = [
    { labelKey: 'effects.params.lift', hueKey: 'shadowsHue', amountKey: 'shadowsAmount' },
    { labelKey: 'effects.params.gamma', hueKey: 'midtonesHue', amountKey: 'midtonesAmount' },
    { labelKey: 'effects.params.gain', hueKey: 'highlightsHue', amountKey: 'highlightsAmount' },
  ] as const

  /**
   * Affine mapping between the stored shader param and the Resolve-style
   * display units shown in the dock fields: display = param * scale + bias.
   * Lift/gain read in native units, gamma reads 0-centered (param - 1), and
   * offset reads as Resolve's 25-anchored scale (-175..225 for param ±2).
   */
  interface WheelDisplay {
    scale: number
    bias: number
    step: number
    /** Display precision override; defaults to the step's decimals. */
    decimals?: number
  }

  function toWheelDisplay(display: WheelDisplay, value: number): number {
    return value * display.scale + display.bias
  }

  function fromWheelDisplay(display: WheelDisplay, value: number): number {
    return (value - display.bias) / display.scale
  }

  function formatWheelDisplayValue(display: WheelDisplay, value: number): string {
    return value.toFixed(display.decimals ?? getParamDecimals(display.step))
  }

  // Resolve-style scales and precision for the dock parameter rows: Temp reads
  // in the +/-4000 scale, Contrast/Pivot at 3 decimals, Saturation 0..100
  // anchored at 50 (param is -100..100).
  const DOCK_PARAM_DISPLAY: Record<string, WheelDisplay> = {
    temperature: { scale: 40, bias: 0, step: 10, decimals: 1 },
    tint: { scale: 1, bias: 0, step: 0.1, decimals: 2 },
    contrast: { scale: 1, bias: 0, step: 0.005, decimals: 3 },
    pivot: { scale: 1, bias: 0, step: 0.005, decimals: 3 },
    midDetail: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
    colorBoost: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
    shadows: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
    highlights: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
    saturation: { scale: 0.5, bias: 50, step: 0.5, decimals: 2 },
    hue: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
    lumMix: { scale: 1, bias: 0, step: 0.5, decimals: 2 },
  }

  const DOCK_WHEEL_DESCRIPTORS = [
    {
      labelKey: 'effects.params.lift',
      hueKey: 'shadowsHue',
      amountKey: 'shadowsAmount',
      levelKey: 'lift',
      masterChip: true,
      display: { scale: 1, bias: 0, step: 0.01 },
      ring: { min: -2, max: 2, fromDeg: 0 },
    },
    {
      labelKey: 'effects.params.gamma',
      hueKey: 'midtonesHue',
      amountKey: 'midtonesAmount',
      levelKey: 'gamma',
      masterChip: true,
      display: { scale: 1, bias: -1, step: 0.01 },
      ring: { min: 0, max: 2, fromDeg: 0 },
    },
    {
      labelKey: 'effects.params.gain',
      hueKey: 'highlightsHue',
      amountKey: 'highlightsAmount',
      levelKey: 'gain',
      masterChip: true,
      display: { scale: 1, bias: 0, step: 0.01 },
      // Resolve renders gain's gauge phase-flipped 180° relative to the
      // other wheels — same half-ring at default, on the opposite side.
      ring: { min: 0, max: 2, fromDeg: 180 },
    },
    // Resolve's Offset wheel shows only R/G/B chips — the master scalar is
    // still driven by the thumb wheel below.
    {
      labelKey: 'effects.params.offset',
      hueKey: 'offsetHue',
      amountKey: 'offsetAmount',
      levelKey: 'offset',
      masterChip: false,
      display: { scale: 100, bias: 25, step: 0.25 },
      ring: { min: -2, max: 2, fromDeg: 0 },
    },
  ] as const

  type DockWheelDescriptor = (typeof DOCK_WHEEL_DESCRIPTORS)[number]

  const DOCK_TOP_PARAMS = ['temperature', 'tint', 'contrast', 'pivot', 'midDetail'] as const
  const DOCK_BOTTOM_PARAMS = [
    'colorBoost',
    'shadows',
    'highlights',
    'saturation',
    'hue',
    'lumMix',
  ] as const

  const PRIMARY_PARAMS = [
    'exposure',
    'contrast',
    'pivot',
    'lift',
    'gamma',
    'gain',
    'offset',
    'blackPoint',
    'whitePoint',
  ] as const

  const TONAL_PARAMS = ['temperature', 'tint', 'saturation'] as const

  function formatParamValue(value: number, step: unknown): string {
    return value.toFixed(getParamDecimals(step))
  }

  function getDockParamAccent(key: string): string {
    if (key === 'temperature' || key === 'contrast' || key === 'pivot' || key === 'lumMix') {
      return 'from-zinc-200 via-zinc-500 to-zinc-900'
    }
    if (key === 'tint' || key === 'hue') return 'from-cyan-400 via-fuchsia-500 to-amber-300'
    if (key === 'saturation' || key === 'colorBoost') {
      return 'from-red-500 via-green-500 to-blue-500'
    }
    return 'from-zinc-300 via-red-500 to-blue-500'
  }

  // Resolve-style chip order under each wheel: white (master) then R, G, B.
  const WHEEL_CHANNEL_INDICES = [0, 1, 2] as const
  const WHEEL_CHANNEL_LABELS = ['Red', 'Green', 'Blue'] as const
  const WHEEL_CHANNEL_ACCENTS = ['bg-red-500', 'bg-green-500', 'bg-blue-500'] as const

  const CHIP_CLASS =
    'h-5 w-full rounded-[2px] border border-black/80 bg-black/75 px-1 text-center font-mono text-[10px] leading-5 tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  const TONAL_ROW_CLASS = '[&>span]:w-[84px] [&>span]:min-w-[84px]'
</script>

<script lang="ts">
  import Pipette from '@lucide/svelte/icons/pipette'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { KeyframeToggle } from '@/features/effects/deps/keyframes-ui-contract'
  import { AppEyedropperOverlay, PropertyRow, SliderInput } from '@/shared/ui/property-controls'
  import { cn } from '@/shared/ui/cn'
  import { getEffectDefinitionName, getEffectParamLabel } from '@/features/effects/utils/effect-i18n'
  import {
    hueAmountFromWheelChannels,
    wheelChannelsFromHueAmount,
    type WheelChannels,
  } from '@/features/effects/utils/wheel-channels'
  import {
    autoBalanceFromFrame,
    blackPointFromPick,
    hexToRgb01,
    luma601,
    whiteBalanceFromPick,
    whitePointFromPick,
  } from '@/features/effects/utils/wheel-pickers'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import DockNumberInput from './gpu-wheels-panel-dock-number-input.svelte'
  import DockThumbWheel from './gpu-wheels-panel-dock-thumb-wheel.svelte'
  import WheelControl from './gpu-wheels-panel-wheel-control.svelte'
  import ParamResetButton from './param-reset-button.svelte'
  import { effectT, type GpuKeyframePanelProps, type GpuParamUpdates } from './panel-props'

  interface GpuWheelsPanelProps extends GpuKeyframePanelProps {
    layout?: 'sidebar' | 'dock'
    onParamsBatchChange: (effectId: string, updates: GpuParamUpdates) => void
    onParamsBatchLiveChange: (effectId: string, updates: GpuParamUpdates) => void
  }

  let {
    itemIds,
    effect: itemEffect,
    gpuEffect,
    definition,
    layout = 'sidebar',
    collapsible = false,
    onEditInColor,
    getKeyframeProperty,
    onParamChange,
    onParamLiveChange,
    onParamsBatchChange,
    onParamsBatchLiveChange,
    onReset,
    onToggle,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
  }: GpuWheelsPanelProps = $props()

  let wheelGrid: HTMLDivElement | null = $state(null)
  let wheelSize = $state(MAX_WHEEL_SIZE)
  const isDock = $derived(layout === 'dock')
  // Collapse only in the sidebar — the dock is the dedicated grading surface.
  const allowCollapse = $derived(collapsible && !isDock)
  // svelte-ignore state_referenced_locally
  let collapsed = $state(allowCollapse)
  const showBody = $derived(!(allowCollapse && collapsed))

  const paramEntries = $derived(Object.entries(definition.params))
  const isDefault = $derived(
    paramEntries.every(([key, param]) => gpuEffect.params[key] === param.default),
  )

  // Live param overlay: drags emit preview-only changes that don't touch the
  // committed effect until release. Readouts (wheels, chips, fields) render
  // from committed params merged with the in-flight values, so every control
  // tracks the gesture in realtime instead of jumping on commit.
  let liveOverlay = $state.raw<GpuParamUpdates | null>(null)
  $effect(() => {
    void itemEffect.id
    liveOverlay = null
  })
  const displayParams = $derived(
    liveOverlay ? { ...gpuEffect.params, ...liveOverlay } : gpuEffect.params,
  )

  const emitLiveParam = (key: string, value: number | boolean | string) => {
    liveOverlay = { ...liveOverlay, [key]: value }
    onParamLiveChange(itemEffect.id, key, value)
  }
  const emitCommitParam = (key: string, value: number | boolean | string) => {
    liveOverlay = null
    onParamChange(itemEffect.id, key, value)
  }
  const emitLiveBatch = (updates: GpuParamUpdates) => {
    liveOverlay = { ...liveOverlay, ...updates }
    onParamsBatchLiveChange(itemEffect.id, updates)
  }
  const emitCommitBatch = (updates: GpuParamUpdates) => {
    liveOverlay = null
    onParamsBatchChange(itemEffect.id, updates)
  }

  $effect(() => {
    const el = wheelGrid
    const dock = isDock
    if (!el) return

    const updateSize = () => {
      const styles = getComputedStyle(el)
      const paddingX =
        (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      const paddingY =
        (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
      const width = el.clientWidth - paddingX
      const wheelCount = dock ? DOCK_WHEEL_DESCRIPTORS.length : WHEEL_DESCRIPTORS.length
      const maxSize = dock ? MAX_DOCK_WHEEL_SIZE : MAX_WHEEL_SIZE
      const minSize = dock ? MIN_DOCK_WHEEL_SIZE : MIN_WHEEL_SIZE
      const gridGap = dock ? DOCK_WHEEL_GRID_GAP_PX : GRID_GAP_PX
      const slotWidth = (width - gridGap * (wheelCount - 1)) / wheelCount
      // In the dock the wheel column also stacks a header, value chips and a thumb
      // wheel — cap the wheel diameter by the available height so the column never
      // spills over the bottom parameter row.
      const slotHeight = dock
        ? el.clientHeight - paddingY - DOCK_WHEEL_EXTRAS_PX
        : Number.POSITIVE_INFINITY
      wheelSize = clamp(Math.floor(Math.min(slotWidth, slotHeight)), minSize, maxSize)
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(el)
    return () => observer.disconnect()
  })

  // Ring gauge over the wheel's practical working span (param space) —
  // Resolve's rings reflect a per-wheel range, not the full field range,
  // which is why lift/gamma/offset read half at default while gain reads
  // ~2/3. Values past the span peg the ring full/empty.
  const getMasterRingFill = (desc: DockWheelDescriptor) => {
    const level = readNumberParam(definition, displayParams, desc.levelKey)
    const range = desc.ring.max - desc.ring.min
    return range > 0 ? clamp((level - desc.ring.min) / range, 0, 1) : 0
  }

  // Resolve-style primaries pickers. The eyedropper ones sample the graded
  // preview via the in-app color sampler (the native EyeDropper freezes the tab
  // on Chrome/Windows); auto balance reads frame statistics from the bridge.
  let picking = $state(false)
  let pickResolver: ((hex: string | null) => void) | null = null
  const handlePicked = (hex: string | null) => {
    picking = false
    const resolve = pickResolver
    pickResolver = null
    resolve?.(hex)
  }
  const pickScreenColor = () =>
    new Promise<{ r: number; g: number; b: number } | null>((resolve) => {
      pickResolver = (hex) => resolve(hex ? hexToRgb01(hex) : null)
      picking = true
    })
  const readCurrent = (key: string) => readNumberParam(definition, displayParams, key)

  const handlePickWhiteBalance = async () => {
    const picked = await pickScreenColor()
    if (!picked) return
    const wb = whiteBalanceFromPick(picked, readCurrent('temperature'), readCurrent('tint'))
    emitCommitBatch({ temperature: wb.temperature, tint: wb.tint })
  }

  const handlePickBlackPoint = async () => {
    const picked = await pickScreenColor()
    if (!picked) return
    emitCommitParam('lift', blackPointFromPick(luma601(picked), readCurrent('lift')))
  }

  const handlePickWhitePoint = async () => {
    const picked = await pickScreenColor()
    if (!picked) return
    emitCommitParam('gain', whitePointFromPick(luma601(picked), readCurrent('gain')))
  }

  const handleAutoBalance = async () => {
    const capture = usePreviewBridgeStore.getState().captureFrameImageData
    if (!capture) return
    const imageData = await capture({ width: 96, height: 54 })
    if (!imageData) return
    const updates = autoBalanceFromFrame(imageData, {
      lift: readCurrent('lift'),
      gain: readCurrent('gain'),
      temperature: readCurrent('temperature'),
      tint: readCurrent('tint'),
    })
    emitCommitBatch({ ...updates })
  }

  const updateParamFromDisplay = (
    key: string,
    display: WheelDisplay,
    rawValue: string,
    mode: 'live' | 'commit',
  ) => {
    const param = definition.params[key]
    if (!param || param.type !== 'number') return
    const next = Number(rawValue)
    if (!Number.isFinite(next)) return
    const clamped = clampParamValue(param, fromWheelDisplay(display, next))
    if (mode === 'live') emitLiveParam(key, clamped)
    else emitCommitParam(key, clamped)
  }

  /** The values `renderDockWheelFields` derives for one wheel's chips and thumb wheel. */
  const getDockWheelFields = (desc: DockWheelDescriptor) => {
    const { levelKey, hueKey, amountKey, display } = desc
    const levelParam = definition.params[levelKey]
    const levelValue = readNumberParam(definition, displayParams, levelKey)
    const hue = readNumberParam(definition, displayParams, hueKey)
    const amount = readNumberParam(definition, displayParams, amountKey)
    const deviations = wheelChannelsFromHueAmount(hue, amount)
    // Resolve-style readout: channel chips include the master, so rolling the
    // thumb wheel moves all three together (Gain at 1.07 reads 1.07 1.07 1.07).
    const levelDisplay = toWheelDisplay(display, levelValue)
    const channels = deviations.map(
      (deviation) => levelDisplay + deviation * display.scale,
    ) as WheelChannels
    const displayMin = toWheelDisplay(display, levelParam?.min ?? 0)
    const displayMax = toWheelDisplay(display, levelParam?.max ?? 0)
    return {
      levelDisplay,
      channels,
      displayMin,
      displayMax,
      chipMin: displayMin - display.scale,
      chipMax: displayMax + display.scale,
    }
  }

  const updateLevelFromDisplay = (
    desc: DockWheelDescriptor,
    rawValue: string,
    mode: 'live' | 'commit',
  ) => {
    const next = Number(rawValue)
    if (!Number.isFinite(next)) return
    const clamped = clampParamValue(
      definition.params[desc.levelKey],
      fromWheelDisplay(desc.display, next),
    )
    if (mode === 'live') emitLiveParam(desc.levelKey, clamped)
    else emitCommitParam(desc.levelKey, clamped)
  }

  // Editing an R/G/B chip decomposes the channel triple back into the
  // master (the mean) plus a wheel push (hue + amount), so chips read back
  // exactly what was typed.
  const updateChannel = (
    desc: DockWheelDescriptor,
    index: 0 | 1 | 2,
    rawValue: string,
    mode: 'live' | 'commit',
  ) => {
    const { levelKey, hueKey, amountKey, display } = desc
    const { channels, chipMin, chipMax } = getDockWheelFields(desc)
    const next = Number(rawValue)
    if (!Number.isFinite(next)) return
    const edited: WheelChannels = [channels[0], channels[1], channels[2]]
    edited[index] = clamp(next, chipMin, chipMax)
    const mean = (edited[0] + edited[1] + edited[2]) / 3
    const wheel = hueAmountFromWheelChannels([
      (edited[0] - mean) / display.scale,
      (edited[1] - mean) / display.scale,
      (edited[2] - mean) / display.scale,
    ])
    const meanParam = fromWheelDisplay(display, mean)
    const updates = {
      [levelKey]: clampParamValue(
        definition.params[levelKey],
        Math.round(meanParam * 10000) / 10000,
      ),
      [hueKey]: Math.round(wheel.hue * 10) / 10,
      [amountKey]: clampParamValue(
        definition.params[amountKey],
        Math.round(wheel.amount * 1000) / 1000,
      ),
    }
    if (mode === 'live') emitLiveBatch(updates)
    else emitCommitBatch(updates)
  }
</script>

{#snippet dockNumberControl(key: string)}
  {@const param = definition.params[key]}
  {#if param && param.type === 'number'}
    {@const display = DOCK_PARAM_DISPLAY[key] ?? { scale: 1, bias: 0, step: param.step ?? 1 }}
    {@const value = (displayParams[key] as number) ?? param.default}
    {@const label = getEffectParamLabel(effectT, definition, key)}
    {@const resetLabel = t('effects.panel.resetParameterToDefault', {
      parameter: label,
      defaultValue: `Reset ${label} to default`,
    })}
    <div
      class="grid min-w-0 grid-cols-[minmax(3.75rem,1fr)_3.75rem_1rem] items-center gap-x-0.5"
    >
      <span
        class="min-w-0 whitespace-nowrap text-right text-[10px] text-muted-foreground"
        title={label}
      >
        {label}
      </span>
      <span class="flex min-w-0 flex-col items-center">
        <DockNumberInput
          ariaLabel={label}
          name={`dock-${key}`}
          value={formatWheelDisplayValue(display, toWheelDisplay(display, value))}
          min={typeof param.min === 'number' ? toWheelDisplay(display, param.min) : undefined}
          max={typeof param.max === 'number' ? toWheelDisplay(display, param.max) : undefined}
          step={display.step}
          decimals={display.decimals}
          disabled={!itemEffect.enabled}
          onLive={(raw) => updateParamFromDisplay(key, display, raw, 'live')}
          onCommit={(raw) => updateParamFromDisplay(key, display, raw, 'commit')}
          class="h-6 w-full rounded-[2px] border border-black/80 bg-black/75 px-1 text-center font-mono text-[11px] tabular-nums text-foreground shadow-inner focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <span
          aria-hidden="true"
          class={cn('mt-0.5 h-0.5 w-8 rounded-full bg-gradient-to-r', getDockParamAccent(key))}
        ></span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-4 w-4 flex-shrink-0 text-muted-foreground hover:text-foreground"
        onclick={() => emitCommitParam(key, param.default)}
        disabled={!itemEffect.enabled || Object.is(value, param.default)}
        title={resetLabel}
        aria-label={resetLabel}
      >
        <RotateCcw class="h-2.5 w-2.5" />
      </Button>
    </div>
  {/if}
{/snippet}

{#snippet dockWheelFields(desc: DockWheelDescriptor, wheelLabel: string)}
  {@const fields = getDockWheelFields(desc)}
  <div class="w-full max-w-[13rem] px-1">
    <div class={cn('grid gap-1', desc.masterChip ? 'grid-cols-4' : 'grid-cols-3')}>
      {#if desc.masterChip}
        <span class="flex min-w-0 flex-col items-center">
          <DockNumberInput
            ariaLabel={wheelLabel}
            name={`dock-${desc.levelKey}`}
            value={formatParamValue(fields.levelDisplay, desc.display.step)}
            min={fields.displayMin}
            max={fields.displayMax}
            step={desc.display.step}
            disabled={!itemEffect.enabled}
            onLive={(raw) => updateLevelFromDisplay(desc, raw, 'live')}
            onCommit={(raw) => updateLevelFromDisplay(desc, raw, 'commit')}
            class={CHIP_CLASS}
          />
          <span aria-hidden="true" class="mt-0.5 h-0.5 w-7 rounded-full bg-zinc-200"></span>
        </span>
      {/if}
      {#each WHEEL_CHANNEL_INDICES as index (WHEEL_CHANNEL_LABELS[index])}
        <span class="flex min-w-0 flex-col items-center">
          <DockNumberInput
            ariaLabel={`${wheelLabel} ${WHEEL_CHANNEL_LABELS[index]}`}
            name={`dock-${desc.levelKey}-${WHEEL_CHANNEL_LABELS[index].toLowerCase()}`}
            value={formatParamValue(fields.channels[index], desc.display.step)}
            min={fields.chipMin}
            max={fields.chipMax}
            step={desc.display.step}
            disabled={!itemEffect.enabled}
            onLive={(raw) => updateChannel(desc, index, raw, 'live')}
            onCommit={(raw) => updateChannel(desc, index, raw, 'commit')}
            class={CHIP_CLASS}
          />
          <span
            aria-hidden="true"
            class={cn('mt-0.5 h-0.5 w-7 rounded-full', WHEEL_CHANNEL_ACCENTS[index])}
          ></span>
        </span>
      {/each}
    </div>
    <DockThumbWheel
      ariaLabel={`${wheelLabel} thumb wheel`}
      name={`dock-${desc.levelKey}-thumb`}
      value={fields.levelDisplay}
      min={fields.displayMin}
      max={fields.displayMax}
      step={desc.display.step}
      disabled={!itemEffect.enabled}
      onLive={(raw) => updateLevelFromDisplay(desc, raw, 'live')}
      onCommit={(raw) => updateLevelFromDisplay(desc, raw, 'commit')}
    />
  </div>
{/snippet}

{#snippet paramRows(keys: readonly string[])}
  {#each keys as key (key)}
    {@const param = definition.params[key]}
    {#if param}
      {@const value = (displayParams[key] as number) ?? param.default}
      {@const keyframeProperty = getKeyframeProperty(itemEffect.id, key)}
      {@const label = getEffectParamLabel(effectT, definition, key)}
      <PropertyRow {label} class={TONAL_ROW_CLASS}>
        <div class="flex items-center gap-1 min-w-0 w-full">
          <SliderInput
            {value}
            onChange={(v) => emitCommitParam(key, v)}
            onLiveChange={(v) => emitLiveParam(key, v)}
            min={param.min ?? -100}
            max={param.max ?? 100}
            step={param.step ?? 1}
            disabled={!itemEffect.enabled}
            class="flex-1 min-w-0"
          />
          {#if keyframeProperty}
            <KeyframeToggle
              {itemIds}
              property={keyframeProperty}
              currentValue={value}
              disabled={!itemEffect.enabled}
            />
          {/if}
          <ParamResetButton
            effectId={itemEffect.id}
            paramKey={key}
            {label}
            {value}
            defaultValue={param.default}
            {onParamChange}
          />
        </div>
      </PropertyRow>
    {/if}
  {/each}
{/snippet}

<div class={cn('space-y-0', isDock && 'flex h-full min-h-0 flex-col overflow-hidden')}>
  {#if picking}
    <AppEyedropperOverlay onResolve={handlePicked} previewOnly />
  {/if}
  <EffectPanelHeaderRow
    label={isDock ? t('effects.wheels.primariesColorWheels') : getEffectDefinitionName(definition)}
    effectId={itemEffect.id}
    enabled={itemEffect.enabled}
    {isDefault}
    {onReset}
    {onToggle}
    {onRemove}
    {onMove}
    {canMoveUp}
    {canMoveDown}
    collapsed={allowCollapse ? collapsed : undefined}
    onToggleCollapsed={allowCollapse ? () => (collapsed = !collapsed) : undefined}
    {onEditInColor}
  />

  {#if showBody}
    {#if isDock}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="grid shrink-0 items-center gap-x-3 border-b border-border/70 px-4 py-1.5"
          style:grid-template-columns="auto repeat({DOCK_TOP_PARAMS.length}, minmax(0, 1fr))"
        >
          <div class="flex items-center gap-0.5 pr-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={!itemEffect.enabled}
              onclick={() => void handleAutoBalance()}
              title={t('effects.wheels.autoBalance')}
              aria-label={t('effects.wheels.autoBalance')}
            >
              <span
                class="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[8px] font-semibold leading-none"
              >
                A
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={!itemEffect.enabled}
              onclick={() => void handlePickWhiteBalance()}
              title={t('effects.wheels.pickWhiteBalance')}
              aria-label={t('effects.wheels.pickWhiteBalance')}
            >
              <Pipette class="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={!itemEffect.enabled}
              onclick={() => void handlePickBlackPoint()}
              title={t('effects.wheels.pickBlackPoint')}
              aria-label={t('effects.wheels.pickBlackPoint')}
            >
              <span class="relative">
                <Pipette class="h-3.5 w-3.5" />
                <span
                  aria-hidden="true"
                  class="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-zinc-500 bg-black"
                ></span>
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={!itemEffect.enabled}
              onclick={() => void handlePickWhitePoint()}
              title={t('effects.wheels.pickWhitePoint')}
              aria-label={t('effects.wheels.pickWhitePoint')}
            >
              <span class="relative">
                <Pipette class="h-3.5 w-3.5" />
                <span
                  aria-hidden="true"
                  class="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-zinc-600 bg-white"
                ></span>
              </span>
            </Button>
          </div>
          {#each DOCK_TOP_PARAMS as key (key)}
            {@render dockNumberControl(key)}
          {/each}
        </div>
        <div bind:this={wheelGrid} class="min-h-0 flex-1 overflow-hidden px-6 py-3">
          <div
            class="grid min-h-full grid-cols-[repeat(4,minmax(3rem,1fr))] items-center gap-7"
          >
            {#each DOCK_WHEEL_DESCRIPTORS as desc (desc.labelKey)}
              <WheelControl
                label={t(desc.labelKey)}
                hue={(displayParams[desc.hueKey] as number) ?? 0}
                amount={(displayParams[desc.amountKey] as number) ?? 0}
                size={wheelSize}
                disabled={!itemEffect.enabled}
                dock
                masterRingFill={getMasterRingFill(desc)}
                masterRingFromDeg={desc.ring.fromDeg}
                onLiveChange={(hue, amount) => {
                  emitLiveBatch({
                    [desc.hueKey]: hue,
                    [desc.amountKey]: amount,
                  })
                }}
                onCommit={(hue, amount) => {
                  emitCommitBatch({
                    [desc.hueKey]: hue,
                    [desc.amountKey]: amount,
                  })
                }}
                onReset={() => {
                  // Reset the whole wheel: color push and its master level.
                  emitCommitBatch({
                    [desc.hueKey]: definition.params[desc.hueKey]?.default ?? 0,
                    [desc.amountKey]: definition.params[desc.amountKey]?.default ?? 0,
                    [desc.levelKey]: (definition.params[desc.levelKey]?.default as number) ?? 0,
                  })
                }}
              >
                {#snippet dockFields()}
                  {@render dockWheelFields(desc, t(desc.labelKey))}
                {/snippet}
              </WheelControl>
            {/each}
          </div>
        </div>
        <div
          class="grid shrink-0 items-center gap-x-3 border-t border-border/70 px-4 py-1.5"
          style:grid-template-columns="repeat({DOCK_BOTTOM_PARAMS.length}, minmax(0, 1fr))"
        >
          {#each DOCK_BOTTOM_PARAMS as key (key)}
            {@render dockNumberControl(key)}
          {/each}
        </div>
      </div>
    {:else}
      <div class="px-2 pb-2">
        <div bind:this={wheelGrid} class="grid grid-cols-3 gap-1">
          {#each WHEEL_DESCRIPTORS as desc (desc.labelKey)}
            <WheelControl
              label={t(desc.labelKey)}
              hue={(displayParams[desc.hueKey] as number) ?? 0}
              amount={(displayParams[desc.amountKey] as number) ?? 0}
              size={wheelSize}
              disabled={!itemEffect.enabled}
              onLiveChange={(hue, amount) => {
                emitLiveBatch({
                  [desc.hueKey]: hue,
                  [desc.amountKey]: amount,
                })
              }}
              onCommit={(hue, amount) => {
                emitCommitBatch({
                  [desc.hueKey]: hue,
                  [desc.amountKey]: amount,
                })
              }}
              onReset={() => {
                emitCommitBatch({
                  [desc.hueKey]: definition.params[desc.hueKey]?.default ?? 0,
                  [desc.amountKey]: definition.params[desc.amountKey]?.default ?? 0,
                })
              }}
            />
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  {#if showBody && !isDock}
    <div
      class="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      {t('effects.wheels.primaries', { defaultValue: 'Primaries' })}
    </div>
    {@render paramRows(PRIMARY_PARAMS)}

    <div
      class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      {t('effects.wheels.balance', { defaultValue: 'Balance' })}
    </div>
    {@render paramRows(TONAL_PARAMS)}
  {/if}
</div>
