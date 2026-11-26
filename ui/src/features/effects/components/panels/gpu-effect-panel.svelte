<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Scan from '@lucide/svelte/icons/scan'
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
  import { getGpuEffectKeyframeValue } from '@/features/effects/utils/effect-keyframes'
  import {
    useGizmoStore,
    usePowerWindowEditorStore,
    useSpatialEffectEditorStore,
  } from '@/features/effects/deps/preview-contract'
  import { getSpatialPointEffectConfig } from '@/infrastructure/gpu-effects/spatial-point-editor'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import ParamResetButton from './param-reset-button.svelte'
  import TextParamRow from './gpu-effect-panel-text-param-row.svelte'
  import { effectT, type GpuKeyframePanelProps } from './panel-props'

  type GpuEffectPanelProps = GpuKeyframePanelProps

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
  }: GpuEffectPanelProps = $props()

  const paramEntries = $derived(Object.entries(definition.params))
  const effectName = $derived(getEffectDefinitionName(definition))
  let collapsed = $state(false)
  const spatialConfig = $derived(getSpatialPointEffectConfig(definition.id))
  const editableItemId = $derived(itemIds.length === 1 ? (itemIds[0] ?? null) : null)
  const editingItemId = select(useSpatialEffectEditorStore, (s) => s.editingItemId)
  const editingEffectId = select(useSpatialEffectEditorStore, (s) => s.editingEffectId)
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
      if (value !== itemEffect.effect.params[key]) liveParams[key] = value
    }
    return Object.keys(liveParams).length > 0
      ? { ...gpuEffect, params: { ...gpuEffect.params, ...liveParams } }
      : gpuEffect
  })
  const isDefault = $derived(
    paramEntries.every(([key, param]) => displayGpuEffect.params[key] === param.default),
  )
  const isEditingOnCanvas = $derived(
    spatialConfig !== null &&
      editableItemId !== null &&
      editingItemId.current === editableItemId &&
      editingEffectId.current === itemEffect.id,
  )

  const toggleCanvasEditor = () => {
    if (isEditingOnCanvas) {
      useSpatialEffectEditorStore.getState().stopEditing()
    } else if (editableItemId && spatialConfig) {
      usePowerWindowEditorStore.getState().stopEditing()
      useSpatialEffectEditorStore.getState().startEditing(editableItemId, itemEffect.id)
    }
  }

  $effect(() => {
    if (isEditingOnCanvas && (!itemEffect.enabled || !editableItemId)) {
      useSpatialEffectEditorStore.getState().stopEditing()
    }
  })
</script>

{#if paramEntries.length === 0}
  <!-- Zero params: header-only row with action buttons -->
  <EffectPanelHeaderRow
    label={effectName}
    effectId={itemEffect.id}
    enabled={itemEffect.enabled}
    {isDefault}
    {onReset}
    {onToggle}
    {onRemove}
    {onMove}
    {canMoveUp}
    {canMoveDown}
  />
{:else}
  <!-- Multi-param: header row with buttons, then one row per param -->
  <div class="space-y-0">
    <EffectPanelHeaderRow
      label={effectName}
      effectId={itemEffect.id}
      enabled={itemEffect.enabled}
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
      {#if spatialConfig}
        <div class="px-2 pb-1 pt-1">
          <Button
            type="button"
            variant={isEditingOnCanvas ? 'default' : 'outline'}
            size="sm"
            class="h-7 w-full justify-center gap-1.5 text-xs"
            disabled={!itemEffect.enabled || !editableItemId}
            aria-pressed={isEditingOnCanvas}
            onclick={toggleCanvasEditor}
          >
            <Scan class="h-3.5 w-3.5" />
            {isEditingOnCanvas
              ? t('effects.powerWindow.editingOnCanvas')
              : t('effects.powerWindow.editOnCanvas')}
          </Button>
        </div>
      {/if}
      {#each paramEntries as [key, param] (key)}
        {@const currentValue = displayGpuEffect.params[key] ?? param.default}
        {@const paramVisible = param.visibleWhen?.(displayGpuEffect.params) ?? true}
        {@const paramEnabled = itemEffect.enabled}
        {@const paramLabel = getEffectParamLabel(effectT, definition, key)}
        {#if paramVisible}
          {#if param.type === 'number'}
            {@const keyframeProperty = getKeyframeProperty(itemEffect.id, key)}
            <PropertyRow label={paramLabel} class={!paramEnabled ? 'opacity-50' : undefined}>
              <SliderInput
                value={currentValue as number}
                onChange={(v) => onParamChange(itemEffect.id, key, v)}
                onLiveChange={(v) => onParamLiveChange(itemEffect.id, key, v)}
                min={param.min ?? 0}
                max={param.max ?? 1}
                step={param.step ?? 0.01}
                disabled={!paramEnabled}
                class="flex-1 min-w-0"
              />
              {#if keyframeProperty}
                <KeyframeToggle
                  {itemIds}
                  property={keyframeProperty}
                  currentValue={currentValue as number}
                  disabled={!paramEnabled}
                />
              {/if}
              <ParamResetButton
                effectId={itemEffect.id}
                paramKey={key}
                label={paramLabel}
                value={currentValue as number}
                defaultValue={param.default}
                {onParamChange}
              />
            </PropertyRow>
          {:else if param.type === 'boolean'}
            <PropertyRow label={paramLabel} class={!paramEnabled ? 'opacity-50' : undefined}>
              <Button
                variant={currentValue ? 'default' : 'outline'}
                size="sm"
                class="h-6 text-xs"
                onclick={() => onParamChange(itemEffect.id, key, !currentValue)}
                disabled={!paramEnabled}
              >
                {currentValue ? t('effects.panel.on') : t('effects.panel.off')}
              </Button>
              <ParamResetButton
                effectId={itemEffect.id}
                paramKey={key}
                label={paramLabel}
                value={currentValue as boolean}
                defaultValue={param.default}
                {onParamChange}
              />
            </PropertyRow>
          {:else if param.type === 'select' && param.options}
            <PropertyRow label={paramLabel} class={!paramEnabled ? 'opacity-50' : undefined}>
              <Select
                value={currentValue as string}
                onValueChange={(v) => onParamChange(itemEffect.id, key, v)}
                disabled={!paramEnabled}
              >
                <SelectTrigger class="h-6 text-xs flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {#each param.options as opt (opt.value)}
                    <SelectItem value={opt.value}>
                      {getEffectOptionLabel(effectT, definition, key, opt)}
                    </SelectItem>
                  {/each}
                </SelectContent>
              </Select>
              <ParamResetButton
                effectId={itemEffect.id}
                paramKey={key}
                label={paramLabel}
                value={currentValue as string}
                defaultValue={param.default}
                {onParamChange}
              />
            </PropertyRow>
          {:else if param.type === 'color'}
            {@const keyframeProperty = getKeyframeProperty(itemEffect.id, key)}
            {@const keyframeValue = getGpuEffectKeyframeValue(itemEffect, key, currentValue)}
            {@const allowAlpha = [currentValue, param.default].some(
              (value) => typeof value === 'string' && /^#[0-9a-f]{8}$/i.test(value.trim()),
            )}
            <PropertyRow label={paramLabel} class={!paramEnabled ? 'opacity-50' : undefined}>
              <ColorPicker
                color={currentValue as string}
                onChange={(v) => onParamChange(itemEffect.id, key, v)}
                onLiveChange={(v) => onParamLiveChange(itemEffect.id, key, v)}
                {allowAlpha}
                disabled={!paramEnabled}
              />
              {#if keyframeProperty && keyframeValue !== null}
                <KeyframeToggle
                  {itemIds}
                  property={keyframeProperty}
                  currentValue={keyframeValue}
                  disabled={!paramEnabled}
                />
              {/if}
              <ParamResetButton
                effectId={itemEffect.id}
                paramKey={key}
                label={paramLabel}
                value={currentValue as string}
                defaultValue={param.default}
                {onParamChange}
              />
            </PropertyRow>
          {:else if param.type === 'text'}
            <TextParamRow
              effectId={itemEffect.id}
              paramKey={key}
              label={paramLabel}
              value={currentValue as string}
              defaultValue={param.default as string}
              disabled={!paramEnabled}
              class={!paramEnabled ? 'opacity-50' : undefined}
              {onParamChange}
              {onParamLiveChange}
            />
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
{/if}
