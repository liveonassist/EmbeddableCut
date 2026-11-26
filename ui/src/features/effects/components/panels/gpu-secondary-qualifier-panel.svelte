<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const HUE_KEYS = ['hueCenter', 'hueWidth', 'hueSoftness'] as const
  const MATTE_KEYS = [
    'satLow',
    'satHigh',
    'satSoftness',
    'lumaLow',
    'lumaHigh',
    'lumaSoftness',
  ] as const
  const CORRECTION_KEYS = ['exposure', 'saturation', 'temperature', 'tint', 'strength'] as const

  function getNumberParam(
    params: Record<string, number | boolean | string>,
    key: string,
    fallback: number,
  ): number {
    const value = params[key]
    return typeof value === 'number' ? value : fallback
  }
</script>

<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off'
  import { Button } from '@/components/ui/button'
  import { KeyframeToggle } from '@/features/effects/deps/keyframes-ui-contract'
  import { getEffectDefinitionName, getEffectParamLabel } from '@/features/effects/utils/effect-i18n'
  import { PropertyRow, SliderInput } from '@/shared/ui/property-controls'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import HueBandControl from './gpu-secondary-qualifier-hue-band-control.svelte'
  import ParamResetButton from './param-reset-button.svelte'
  import { effectT, type GpuKeyframePanelProps } from './panel-props'

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
  const paramEntries = $derived(Object.entries(definition.params))
  const isDefault = $derived(
    paramEntries.every(([key, param]) => gpuEffect.params[key] === param.default),
  )
  const enabled = $derived(itemEffect.enabled)

  const hueCenter = $derived(getNumberParam(gpuEffect.params, 'hueCenter', 0))
  const hueWidth = $derived(getNumberParam(gpuEffect.params, 'hueWidth', 35))
  const hueSoftness = $derived(getNumberParam(gpuEffect.params, 'hueSoftness', 20))
</script>

{#snippet numberRow(key: string)}
  {@const param = definition.params[key]}
  {#if param && param.type === 'number'}
    {@const value = getNumberParam(gpuEffect.params, key, param.default as number)}
    {@const keyframeProperty = getKeyframeProperty(itemEffect.id, key)}
    {@const label = getEffectParamLabel(effectT, definition, key)}
    <PropertyRow {label} class={!enabled ? 'opacity-50' : undefined}>
      <div class="flex items-center gap-1 min-w-0 w-full">
        <SliderInput
          {value}
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={param.step ?? 0.01}
          onChange={(nextValue) => onParamChange(itemEffect.id, key, nextValue)}
          onLiveChange={(nextValue) => onParamLiveChange(itemEffect.id, key, nextValue)}
          disabled={!enabled}
          class="flex-1 min-w-0"
        />
        {#if keyframeProperty}
          <KeyframeToggle
            {itemIds}
            property={keyframeProperty}
            currentValue={value}
            disabled={!enabled}
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
{/snippet}

{#snippet booleanToggle(key: 'showMask' | 'invertMask')}
  {@const param = definition.params[key]}
  {@const active = Boolean(gpuEffect.params[key] ?? param?.default)}
  {@const label = getEffectParamLabel(effectT, definition, key)}
  <div class="flex min-w-0 flex-1 items-center gap-1">
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      class="h-7 min-w-0 flex-1 gap-1.5 px-2 text-xs"
      onclick={() => onParamChange(itemEffect.id, key, !active)}
      disabled={!enabled}
      aria-pressed={active}
    >
      {#if key === 'showMask'}
        {#if active}
          <Eye class="h-3 w-3" />
        {:else}
          <EyeOff class="h-3 w-3" />
        {/if}
      {/if}
      {label}
    </Button>
    {#if param}
      <ParamResetButton
        effectId={itemEffect.id}
        paramKey={key}
        {label}
        value={active}
        defaultValue={param.default}
        {onParamChange}
      />
    {/if}
  </div>
{/snippet}

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
      <div
        class="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('effects.qualifier.key')}
      </div>
      <div class={cn('px-2 pb-1', !enabled && 'opacity-50')}>
        <HueBandControl
          center={hueCenter}
          width={hueWidth}
          softness={hueSoftness}
          disabled={!enabled}
          onLiveChange={(value) => onParamLiveChange(itemEffect.id, 'hueCenter', value)}
          onCommit={(value) => onParamChange(itemEffect.id, 'hueCenter', value)}
        />
      </div>
      {#each HUE_KEYS as key (key)}
        {@render numberRow(key)}
      {/each}

      <div
        class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('effects.qualifier.matte')}
      </div>
      <div class="px-2 pb-1 flex gap-1">
        {@render booleanToggle('showMask')}
        {@render booleanToggle('invertMask')}
      </div>
      {#each MATTE_KEYS as key (key)}
        {@render numberRow(key)}
      {/each}

      <div
        class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('effects.qualifier.correction')}
      </div>
      {#each CORRECTION_KEYS as key (key)}
        {@render numberRow(key)}
      {/each}
    </div>
  {/if}
</div>
