<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('GpuLutPanel')

  /** Imported LUTs are resampled down to this grid to bound param/project size (~143KB rgba8). */
  const MAX_EMBEDDED_LUT_SIZE = 33
</script>

<script lang="ts">
  import { fileBackedHandle, pickFilesWithInput } from '@/infrastructure/browser/file-backed-handle'
  import FileUp from '@lucide/svelte/icons/file-up'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import {
    parseCubeLut,
    resampleCubeLut,
    encodeLutData,
  } from '@/infrastructure/gpu-effects/lut/cube-lut'
  import { KeyframeToggle } from '@/features/effects/deps/keyframes-ui-contract'
  import { PropertyRow, SliderInput } from '@/shared/ui/property-controls'
  import { getEffectDefinitionName } from '@/features/effects/utils/effect-i18n'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import ParamResetButton from './param-reset-button.svelte'
  import type { GpuKeyframePanelProps, GpuParamUpdates } from './panel-props'

  interface GpuLutPanelProps extends GpuKeyframePanelProps {
    onParamsBatchChange: (effectId: string, updates: GpuParamUpdates) => void
  }

  /**
   * Panel for the gpu-lut effect: imports a .cube file, embeds the (resampled)
   * LUT into the effect params, and exposes an intensity slider.
   */
  let {
    itemIds,
    effect: itemEffect,
    gpuEffect,
    definition,
    getKeyframeProperty,
    onParamChange,
    onParamLiveChange,
    onParamsBatchChange,
    onReset,
    onToggle,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
  }: GpuLutPanelProps = $props()

  let importError = $state<string | null>(null)
  let collapsed = $state(false)

  const lutName = $derived(
    typeof gpuEffect.params.lutName === 'string' ? gpuEffect.params.lutName : '',
  )
  const hasLut = $derived(
    typeof gpuEffect.params.lutData === 'string' && gpuEffect.params.lutData.length > 0,
  )
  const intensityParam = $derived(definition.params.intensity)
  const intensityDefault = $derived(
    typeof intensityParam?.default === 'number' ? intensityParam.default : 1,
  )
  const intensity = $derived(
    typeof gpuEffect.params.intensity === 'number' ? gpuEffect.params.intensity : intensityDefault,
  )
  const lutParamKeys = ['lutName', 'lutSize', 'lutData'] as const
  const lutIsDefault = $derived(
    lutParamKeys.every(
      (key) =>
        (gpuEffect.params[key] ?? definition.params[key]?.default) ===
        definition.params[key]?.default,
    ),
  )
  const isDefault = $derived(lutIsDefault && intensity === intensityDefault)
  const fileLabel = $derived(t('effects.lut.file'))
  const resetFileLabel = $derived(`${t('effects.panel.resetToDefaults')}: ${fileLabel}`)

  const handleImport = async () => {
    let handles: FileSystemFileHandle[]
    try {
      // EmbeddableCut: a file input stands in for the picker where there's none (Firefox).
      handles =
        typeof window.showOpenFilePicker === 'function'
          ? await window.showOpenFilePicker({
              multiple: false,
              types: [
                {
                  description: '3D LUT',
                  accept: { 'application/octet-stream': ['.cube'] },
                },
              ],
            })
          : (await pickFilesWithInput({ accept: '.cube' })).map(fileBackedHandle)
    } catch {
      return // user cancelled the picker
    }

    const handle = handles[0]
    if (!handle) return

    try {
      const file = await handle.getFile()
      const parsed = resampleCubeLut(parseCubeLut(await file.text()), MAX_EMBEDDED_LUT_SIZE)
      onParamsBatchChange(itemEffect.id, {
        lutName: parsed.title ?? file.name.replace(/\.cube$/i, ''),
        lutSize: String(parsed.size),
        lutData: encodeLutData(parsed.data),
      })
      importError = null
    } catch (error) {
      logger.warn('Failed to import .cube LUT:', error)
      importError = t('effects.lut.importFailed')
    }
  }

  const keyframeProperty = $derived(getKeyframeProperty(itemEffect.id, 'intensity'))
</script>

<div class="space-y-0">
  <EffectPanelHeaderRow
    label={getEffectDefinitionName(definition)}
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
    <div class="space-y-0">
      <PropertyRow label={t('effects.lut.file')} class={!itemEffect.enabled ? 'opacity-50' : undefined}>
        <div class="flex items-center gap-1 min-w-0 w-full">
          <Button
            variant="outline"
            size="sm"
            class="h-6 flex-1 min-w-0 justify-start gap-1.5 text-xs"
            onclick={() => void handleImport()}
            disabled={!itemEffect.enabled}
            title={t('effects.lut.importTooltip')}
          >
            <FileUp class="w-3 h-3 flex-shrink-0" />
            <span class="truncate">
              {hasLut && lutName ? lutName : t('effects.lut.import')}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onclick={() =>
              onParamsBatchChange(itemEffect.id, {
                lutName: definition.params.lutName?.default ?? '',
                lutSize: definition.params.lutSize?.default ?? '0',
                lutData: definition.params.lutData?.default ?? '',
              })}
            title={resetFileLabel}
            aria-label={resetFileLabel}
            disabled={lutIsDefault}
          >
            <RotateCcw class="h-3 w-3" />
          </Button>
        </div>
      </PropertyRow>
      {#if importError}
        <div class="px-2 pb-1 text-[11px] text-destructive">{importError}</div>
      {/if}

      <PropertyRow
        label={t('effects.lut.intensity')}
        class={!itemEffect.enabled ? 'opacity-50' : undefined}
      >
        <SliderInput
          value={intensity}
          onChange={(v) => onParamChange(itemEffect.id, 'intensity', v)}
          onLiveChange={(v) => onParamLiveChange(itemEffect.id, 'intensity', v)}
          min={0}
          max={1}
          step={0.01}
          disabled={!itemEffect.enabled}
          class="flex-1 min-w-0"
        />
        {#if keyframeProperty}
          <KeyframeToggle
            {itemIds}
            property={keyframeProperty}
            currentValue={intensity}
            disabled={!itemEffect.enabled}
          />
        {/if}
        {#if intensityParam}
          <ParamResetButton
            effectId={itemEffect.id}
            paramKey="intensity"
            label={t('effects.lut.intensity')}
            value={intensity}
            defaultValue={intensityParam.default}
            {onParamChange}
          />
        {/if}
      </PropertyRow>
    </div>
  {/if}
</div>
