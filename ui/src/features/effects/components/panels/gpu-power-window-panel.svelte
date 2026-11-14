<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const WINDOW_KEYS = ['centerX', 'centerY', 'sizeX', 'sizeY', 'rotation', 'feather'] as const
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
  import Circle from 'lucide-svelte/icons/circle'
  import Eye from 'lucide-svelte/icons/eye'
  import EyeOff from 'lucide-svelte/icons/eye-off'
  import Scan from 'lucide-svelte/icons/scan'
  import Square from 'lucide-svelte/icons/square'
  import { Button } from '@/components/ui/button'
  import { KeyframeToggle } from '@/features/effects/deps/keyframes-ui-contract'
  import {
    useGizmoStore,
    usePowerWindowEditorStore,
    useSpatialEffectEditorStore,
  } from '@/features/effects/deps/preview-contract'
  import { getEffectDefinitionName, getEffectParamLabel } from '@/features/effects/utils/effect-i18n'
  import { PropertyRow, SliderInput } from '@/shared/ui/property-controls'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
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
  const enabled = $derived(itemEffect.enabled)
  const editableItemId = $derived(itemIds.length === 1 ? (itemIds[0] ?? null) : null)
  const editingItemId = select(usePowerWindowEditorStore, (s) => s.editingItemId)
  const editingEffectId = select(usePowerWindowEditorStore, (s) => s.editingEffectId)
  const previewEffect = $derived(
    select(useGizmoStore, (state) =>
      editableItemId
        ? state.preview?.[editableItemId]?.effects?.find((entry) => entry.id === itemEffect.id)
        : undefined,
    ),
  )
  const displayGpuEffect = $derived.by(() => {
    const preview = previewEffect.current
    if (preview?.effect.type !== 'gpu-effect' || itemEffect.effect.type !== 'gpu-effect') {
      return gpuEffect
    }

    const liveParams: Record<string, number | boolean | string> = {}
    for (const [key, value] of Object.entries(preview.effect.params)) {
      if (value !== itemEffect.effect.params[key]) {
        liveParams[key] = value
      }
    }

    return Object.keys(liveParams).length > 0
      ? { ...gpuEffect, params: { ...gpuEffect.params, ...liveParams } }
      : gpuEffect
  })
  const isDefault = $derived(
    paramEntries.every(([key, param]) => displayGpuEffect.params[key] === param.default),
  )
  const activeShape = $derived(
    typeof displayGpuEffect.params.shape === 'string' ? displayGpuEffect.params.shape : 'ellipse',
  )
  const isEditingOnCanvas = $derived(
    editableItemId !== null &&
      editingItemId.current === editableItemId &&
      editingEffectId.current === itemEffect.id,
  )

  const toggleCanvasEditor = () => {
    if (isEditingOnCanvas) {
      usePowerWindowEditorStore.getState().stopEditing()
    } else if (editableItemId) {
      useSpatialEffectEditorStore.getState().stopEditing()
      usePowerWindowEditorStore.getState().startEditing(editableItemId, itemEffect.id)
    }
  }

  $effect(() => {
    if (isEditingOnCanvas && (!enabled || !editableItemId)) {
      usePowerWindowEditorStore.getState().stopEditing()
    }
  })
</script>

{#snippet numberRow(key: string)}
  {@const param = definition.params[key]}
  {#if param && param.type === 'number'}
    {@const value = getNumberParam(displayGpuEffect.params, key, param.default as number)}
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
  {@const active = Boolean(displayGpuEffect.params[key] ?? param?.default)}
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

{#snippet shapeButton(shape: 'ellipse' | 'rectangle')}
  {@const isActive = activeShape === shape}
  {@const Icon = shape === 'ellipse' ? Circle : Square}
  <Button
    variant={isActive ? 'default' : 'outline'}
    size="sm"
    class="h-7 flex-1 gap-1.5 px-2 text-xs"
    onclick={() => onParamChange(itemEffect.id, 'shape', shape)}
    disabled={!enabled}
    aria-pressed={isActive}
  >
    <Icon class="h-3 w-3" />
    {t(`effects.powerWindow.${shape}`)}
  </Button>
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
        {t('effects.powerWindow.window')}
      </div>
      <div class="px-2 pb-1">
        <Button
          variant={isEditingOnCanvas ? 'default' : 'outline'}
          size="sm"
          class="h-7 w-full gap-1.5 px-2 text-xs"
          onclick={toggleCanvasEditor}
          disabled={!enabled || !editableItemId}
          aria-pressed={isEditingOnCanvas}
        >
          <Scan class="h-3 w-3" />
          {isEditingOnCanvas
            ? t('effects.powerWindow.editingOnCanvas')
            : t('effects.powerWindow.editOnCanvas')}
        </Button>
      </div>
      <div class="px-2 pb-1 flex gap-1">
        {@render shapeButton('ellipse')}
        {@render shapeButton('rectangle')}
        {#if definition.params.shape}
          <ParamResetButton
            effectId={itemEffect.id}
            paramKey="shape"
            label={getEffectParamLabel(effectT, definition, 'shape')}
            value={activeShape}
            defaultValue={definition.params.shape.default}
            {onParamChange}
          />
        {/if}
      </div>
      {#each WINDOW_KEYS as key (key)}
        {@render numberRow(key)}
      {/each}

      <div
        class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('effects.powerWindow.matte')}
      </div>
      <div class="px-2 pb-1 flex gap-1">
        {@render booleanToggle('showMask')}
        {@render booleanToggle('invertMask')}
      </div>

      <div
        class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('effects.powerWindow.correction')}
      </div>
      {#each CORRECTION_KEYS as key (key)}
        {@render numberRow(key)}
      {/each}
    </div>
  {/if}
</div>
