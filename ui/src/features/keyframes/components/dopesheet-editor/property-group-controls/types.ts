// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { DopesheetPropertyGroup } from '../dopesheet-types'

export interface GroupCurvesButtonProps {
  groupProperties: AnimatableProperty[]
  groupLabel: string
  curveVisible: boolean
  onToggleGroupCurves: (properties: AnimatableProperty[]) => void
  t: TFunction
}

export interface GroupLockButtonProps {
  groupProperties: AnimatableProperty[]
  groupLabel: string
  allRowsLocked: boolean
  setAllRowsLocked: (locked: boolean) => void
  setGroupLocked: (properties: AnimatableProperty[], locked: boolean) => void
  t: TFunction
}

export interface GroupExpandButtonProps {
  groupId: string
  groupLabel: string
  isOpen: boolean
  setAllGroupsExpanded: (expanded: boolean) => void
  toggleGroup: (groupId: string) => void
  t: TFunction
}

export interface GroupKeyframeNavButtonProps {
  direction: 'prev' | 'next'
  entry: DopesheetPropertyGroup['prevKeyframe']
  fallbackProperty: AnimatableProperty
  groupLabel: string
  disabled: boolean
  canNavigate: boolean
  onNavigate: (property: AnimatableProperty, keyframe: Keyframe | null) => void
  t: TFunction
}

export interface GroupResetProps {
  groupId: string
  canResetGroup: boolean
  resetGroupLabel: string
  canResetEffectGroup: boolean
  groupProperties: AnimatableProperty[]
  onResetToDefault?: (properties: AnimatableProperty[]) => void
  onClearGroup: () => void
}
