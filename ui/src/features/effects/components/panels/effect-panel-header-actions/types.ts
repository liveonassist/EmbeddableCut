// SPDX-License-Identifier: MIT

import type { EffectMoveProps } from '../panel-props'

export const EFFECT_HEADER_CLASS =
  'flex min-w-0 items-center justify-between gap-2 border-y border-border/60 bg-muted/35 px-2 py-1'

export interface EffectPanelHeaderActionsProps extends EffectMoveProps {
  effectId: string
  enabled: boolean
  isDefault: boolean
  onReset: (effectId: string) => void
  onToggle: (effectId: string) => void
  onRemove: (effectId: string) => void
  /** When set, render a button that jumps to the Color workspace. */
  onEditInColor?: () => void
}

export interface EffectPanelHeaderRowProps extends EffectPanelHeaderActionsProps {
  label: string
  /**
   * When provided, the row becomes a collapsible disclosure: a chevron + label
   * on the left toggle the panel body. `collapsed` reflects the current state.
   */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}
