<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import type { ShapeItem } from '@/types/timeline'
  import { PropertyRow, PropertySliderControl } from '../../components'
  import type { SharedShapeValue } from '../shape-section-shared-values'

  interface ShapeStrokeJoinControlsProps {
    /** Stroke gates shared with `ShapeStrokeControls`. */
    showStroke: boolean
    strokeEnabled: SharedShapeValue<boolean>
    showLineCap: boolean
    showLineJoin: boolean
    strokeLineCap: ShapeItem['strokeLineCap']
    strokeLineJoin: ShapeItem['strokeLineJoin']
    strokeMiterLimit: SharedShapeValue<number>
    updateShapeItems: (updates: Partial<ShapeItem>) => void
    onStrokeMiterLimitChange: (value: number) => void
    onStrokeMiterLimitLiveChange: (value: number) => void
    onStrokeMiterLimitReset: () => void
  }

  /** Line cap, line join, and the miter limit the miter join exposes. */
  let {
    showStroke,
    strokeEnabled,
    showLineCap,
    showLineJoin,
    strokeLineCap,
    strokeLineJoin,
    strokeMiterLimit,
    updateShapeItems,
    onStrokeMiterLimitChange,
    onStrokeMiterLimitLiveChange,
    onStrokeMiterLimitReset,
  }: ShapeStrokeJoinControlsProps = $props()
</script>

{#if showStroke && strokeEnabled !== false}
  {#if showLineCap}
    <PropertyRow label={t('editor.shapeSection.lineCap')}>
      <Select
        value={strokeLineCap}
        onValueChange={(value) =>
          updateShapeItems({ strokeLineCap: value as ShapeItem['strokeLineCap'] })}
      >
        <SelectTrigger class="h-7 text-xs flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="butt">{t('editor.shapeSection.capButt')}</SelectItem>
          <SelectItem value="round">{t('editor.shapeSection.capRound')}</SelectItem>
          <SelectItem value="square">{t('editor.shapeSection.capSquare')}</SelectItem>
        </SelectContent>
      </Select>
    </PropertyRow>
  {/if}
  {#if showLineJoin}
    <PropertyRow label={t('editor.shapeSection.lineJoin')}>
      <Select
        value={strokeLineJoin}
        onValueChange={(value) =>
          updateShapeItems({ strokeLineJoin: value as ShapeItem['strokeLineJoin'] })}
      >
        <SelectTrigger class="h-7 text-xs flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="miter">{t('editor.shapeSection.joinMiter')}</SelectItem>
          <SelectItem value="round">{t('editor.shapeSection.joinRound')}</SelectItem>
          <SelectItem value="bevel">{t('editor.shapeSection.joinBevel')}</SelectItem>
        </SelectContent>
      </Select>
    </PropertyRow>
  {/if}
  {#if showLineJoin && strokeLineJoin === 'miter'}
    <PropertyRow label={t('editor.shapeSection.miterLimit')}>
      <PropertySliderControl
        value={strokeMiterLimit}
        onChange={onStrokeMiterLimitChange}
        onLiveChange={onStrokeMiterLimitLiveChange}
        min={1}
        max={20}
        step={0.5}
        onReset={onStrokeMiterLimitReset}
        resetLabel={t('editor.shapeSection.resetToDefault')}
      />
    </PropertyRow>
  {/if}
{/if}
