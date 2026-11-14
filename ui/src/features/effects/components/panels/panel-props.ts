// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import { t } from '$lib/i18n.svelte'
import type { GpuEffectDefinition } from '@/infrastructure/gpu-effects'
import type { GpuEffect, ItemEffect } from '@/types/effects'
import type { AnimatableProperty } from '@/types/keyframe'

export type GpuParamValue = number | boolean | string
export type GpuParamUpdates = Record<string, GpuParamValue>

/**
 * The reactive `t`, typed as i18next's for the `effect-i18n` helpers, which take
 * a translator. Reading through it re-renders on a language change like `t`.
 */
export const effectT = t as unknown as TFunction

/** From `effect-move-buttons.tsx`: shared with the panel props below. */
export interface EffectMoveProps {
  /** Move the effect within the item's effect stack. Omitted = reordering unavailable. */
  onMove?: (effectId: string, direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

/** Props shared by every GPU effect panel (curves, wheels, lut, generic). */
export interface GpuPanelBaseProps extends EffectMoveProps {
  effect: ItemEffect
  gpuEffect: GpuEffect
  definition: GpuEffectDefinition
  onParamChange: (effectId: string, paramKey: string, value: GpuParamValue) => void
  onParamLiveChange: (effectId: string, paramKey: string, value: GpuParamValue) => void
  onReset: (effectId: string) => void
  onToggle: (effectId: string) => void
  onRemove: (effectId: string) => void
  /**
   * Render the panel as a collapsible disclosure. Used by the heavyweight grade
   * panels (wheels, curves) in the Edit sidebar so they show as a single
   * summary row instead of the full grading surface, which belongs to Color.
   */
  collapsible?: boolean
  /** Jump to the Color workspace, where the full grading surface lives. */
  onEditInColor?: () => void
}

/** Base props for panels whose params can be keyframed. */
export interface GpuKeyframePanelProps extends GpuPanelBaseProps {
  itemIds: string[]
  getKeyframeProperty: (effectId: string, paramKey: string) => AnimatableProperty | null
}
