<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { GRADIENT_MAP_PRESETS } from '@/infrastructure/gpu-effects/effects/color'

  const FALLBACK_STOPS = ['#000000', '#ffffff']

  function parseStops(value: unknown): string[] {
    if (typeof value !== 'string') return [...FALLBACK_STOPS]
    const stops = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return stops.length >= 2 ? stops : [...FALLBACK_STOPS]
  }

  function resolveHexes(preset: string, customStops: unknown): string[] {
    if (preset === 'custom') return parseStops(customStops)
    return GRADIENT_MAP_PRESETS[preset] ?? GRADIENT_MAP_PRESETS.inferno ?? FALLBACK_STOPS
  }
</script>

<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus'
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { KeyframeToggle } from '@/features/effects/deps/keyframes-ui-contract'
  import { ColorPicker, PropertyRow, SliderInput } from '@/shared/ui/property-controls'
  import {
    getEffectDefinitionName,
    getEffectOptionLabel,
    getEffectParamLabel,
  } from '@/features/effects/utils/effect-i18n'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import ParamResetButton from './param-reset-button.svelte'
  import { effectT, type GpuKeyframePanelProps } from './panel-props'

  /**
   * Panel for gpu-gradient-map: a palette picker, an editable color-stop list for
   * custom palettes, a live gradient preview, and the mix slider.
   */
  let {
    itemIds,
    effect: itemEffect,
    gpuEffect,
    definition,
    getKeyframeProperty,
    onParamChange,
    onParamLiveChange,
    onReset,
    onToggle,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
  }: GpuKeyframePanelProps = $props()

  let collapsed = $state(false)

  const presetParam = $derived(definition.params.preset)
  const customStopsParam = $derived(definition.params.customStops)
  const mixParam = $derived(definition.params.mix)
  const presetDefault = $derived(
    typeof presetParam?.default === 'string' ? presetParam.default : 'inferno',
  )
  const mixDefault = $derived(typeof mixParam?.default === 'number' ? mixParam.default : 1)
  const preset = $derived(
    typeof gpuEffect.params.preset === 'string' ? gpuEffect.params.preset : presetDefault,
  )
  const mix = $derived(typeof gpuEffect.params.mix === 'number' ? gpuEffect.params.mix : mixDefault)
  const isCustom = $derived(preset === 'custom')
  const stops = $derived(parseStops(gpuEffect.params.customStops))
  const previewHexes = $derived(resolveHexes(preset, gpuEffect.params.customStops))
  const isDefault = $derived(
    Object.entries(definition.params).every(
      ([key, param]) => (gpuEffect.params[key] ?? param.default) === param.default,
    ),
  )

  const presetOptions = $derived(definition.params.preset?.options ?? [])
  const mixKeyframe = $derived(getKeyframeProperty(itemEffect.id, 'mix'))
  const enabled = $derived(itemEffect.enabled)

  const commitStops = (next: string[]) => {
    onParamChange(itemEffect.id, 'customStops', next.join(', '))
  }

  const setStop = (index: number, value: string, live: boolean) => {
    const next = [...stops]
    next[index] = value
    if (live) onParamLiveChange(itemEffect.id, 'customStops', next.join(', '))
    else commitStops(next)
  }

  const addStop = () => {
    commitStops([...stops, stops[stops.length - 1] ?? '#ffffff'])
  }

  const removeStop = (index: number) => {
    if (stops.length <= 2) return
    commitStops(stops.filter((_, i) => i !== index))
  }
</script>

<div class="space-y-0">
  <EffectPanelHeaderRow
    label={getEffectDefinitionName(definition)}
    effectId={itemEffect.id}
    {enabled}
    {isDefault}
    {onReset}
    {onToggle}
    {onRemove}
    {onMove}
    {canMoveUp}
    {canMoveDown}
    {collapsed}
    onToggleCollapsed={() => (collapsed = !collapsed)}
  />

  {#if !collapsed}
    <div class="space-y-0">
      <PropertyRow
        label={getEffectParamLabel(effectT, definition, 'preset')}
        class={!enabled ? 'opacity-50' : undefined}
      >
        <Select
          value={preset}
          onValueChange={(v) => onParamChange(itemEffect.id, 'preset', v)}
          disabled={!enabled}
        >
          <SelectTrigger class="h-6 text-xs flex-1 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {#each presetOptions as opt (opt.value)}
              <SelectItem value={opt.value}>
                {getEffectOptionLabel(effectT, definition, 'preset', opt)}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
        {#if presetParam}
          <ParamResetButton
            effectId={itemEffect.id}
            paramKey="preset"
            label={getEffectParamLabel(effectT, definition, 'preset')}
            value={preset}
            defaultValue={presetParam.default}
            {onParamChange}
          />
        {/if}
      </PropertyRow>

      <div class="px-2 pb-1">
        <div
          class="h-3 w-full rounded-sm border border-border"
          style:background="linear-gradient(to right, {previewHexes.join(', ')})"
        ></div>
      </div>

      {#if isCustom}
        {#each stops as hex, index (index)}
          <PropertyRow
            label={`${getEffectParamLabel(effectT, definition, 'customStops')} ${index + 1}`}
            class={!enabled ? 'opacity-50' : undefined}
          >
            <div class="flex items-center gap-1 min-w-0 w-full">
              <ColorPicker
                color={hex}
                onChange={(v) => setStop(index, v, false)}
                onLiveChange={(v) => setStop(index, v, true)}
                disabled={!enabled}
              />
              <Button
                variant="ghost"
                size="sm"
                class="h-6 w-6 p-0 flex-shrink-0"
                onclick={() => removeStop(index)}
                disabled={!enabled || stops.length <= 2}
                title={t('effects.gradientMap.removeStop', { defaultValue: 'Remove stop' })}
              >
                <X class="w-3 h-3" />
              </Button>
            </div>
          </PropertyRow>
        {/each}
        <div class="flex items-center gap-1 px-2 py-1">
          <Button
            variant="outline"
            size="sm"
            class="h-6 min-w-0 flex-1 justify-center gap-1.5 text-xs"
            onclick={addStop}
            disabled={!enabled}
          >
            <Plus class="w-3 h-3" />
            {t('effects.gradientMap.addStop', { defaultValue: 'Add Stop' })}
          </Button>
          {#if customStopsParam}
            <ParamResetButton
              effectId={itemEffect.id}
              paramKey="customStops"
              label={getEffectParamLabel(effectT, definition, 'customStops')}
              value={typeof gpuEffect.params.customStops === 'string'
                ? gpuEffect.params.customStops
                : customStopsParam.default}
              defaultValue={customStopsParam.default}
              {onParamChange}
            />
          {/if}
        </div>
      {/if}

      <PropertyRow
        label={getEffectParamLabel(effectT, definition, 'mix')}
        class={!enabled ? 'opacity-50' : undefined}
      >
        <SliderInput
          value={mix}
          onChange={(v) => onParamChange(itemEffect.id, 'mix', v)}
          onLiveChange={(v) => onParamLiveChange(itemEffect.id, 'mix', v)}
          min={0}
          max={1}
          step={0.01}
          disabled={!enabled}
          class="flex-1 min-w-0"
        />
        {#if mixKeyframe}
          <KeyframeToggle
            {itemIds}
            property={mixKeyframe}
            currentValue={mix}
            disabled={!enabled}
          />
        {/if}
        {#if mixParam}
          <ParamResetButton
            effectId={itemEffect.id}
            paramKey="mix"
            label={getEffectParamLabel(effectT, definition, 'mix')}
            value={mix}
            defaultValue={mixParam.default}
            {onParamChange}
          />
        {/if}
      </PropertyRow>
    </div>
  {/if}
</div>
