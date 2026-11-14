// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import type {
  AnimatableProperty,
  DirectLinkableProperty,
  PropertyExpression,
} from '@/types/keyframe'
import type { CompoundPropertyInputConfig } from '../compound-property-inputs'
import type { Ref, SetState } from '../../ref-state.svelte'

export interface DopesheetResetButtonProps {
  label: string
  onReset: () => void
}

export interface PropertyRowResetProps {
  classic: boolean
  canResetRow: boolean
  resetRowLabel: string
  canResetEffectProperty: boolean
  property: AnimatableProperty
  onResetToDefault?: (properties: AnimatableProperty[]) => void
  onClearProperty: (property: AnimatableProperty) => void
}

export interface PropertyRowCurveButtonProps {
  property: AnimatableProperty
  rowLabel: string
  singleCurveMode: boolean
  showGraphPane: boolean
  selectedCurveVisibleExternally: boolean
  selectedProperty: AnimatableProperty | null
  graphProperties: ReadonlySet<AnimatableProperty>
  visible: boolean
  onCurveVisibilityChange?: (property: AnimatableProperty, visible: boolean) => void
  showSinglePropertyCurve: (property: AnimatableProperty) => void
  togglePropertyCurve: (property: AnimatableProperty) => void
  t: TFunction
}

export interface PropertyRowLockButtonProps {
  rowLocked: boolean
  property: AnimatableProperty
  rowLabel: string
  visible: boolean
  setAllRowsLocked: (locked: boolean) => void
  toggleLockedProperty: (property: AnimatableProperty) => void
  t: TFunction
}

export interface PropertyRowAutoKeyButtonProps {
  property: AnimatableProperty
  rowLabel: string
  autoKeyEnabled: boolean | undefined
  disabled: boolean
  rowLocked: boolean
  canCommit: boolean
  onToggleAutoKey: (property: AnimatableProperty) => void
  t: TFunction
}

export type PropertyLinkPointerEvent = PointerEvent & { currentTarget: HTMLButtonElement }

export interface PropertyRowLinkButtonProps {
  linkableProperty: DirectLinkableProperty | null
  rowLabel: string
  visible: boolean
  hasPropertyLink: boolean
  sourceLabels: Partial<Record<DirectLinkableProperty, string>> | undefined
  linkSource: { sourceProperty: string } | undefined
  onBeginLink?: (event: PropertyLinkPointerEvent, property: DirectLinkableProperty) => void
  onRemoveLink?: (property: DirectLinkableProperty) => void
  t: TFunction
}

export interface PropertyRowAxisConstraintButtonProps {
  axisConstraint:
    | {
        label: string
        constrained: boolean
        onChange: (constrained: boolean) => void
      }
    | undefined
  visible: boolean
  disabled: boolean
  rowLocked: boolean
}

export interface PropertyRowCompoundInputProps {
  property: AnimatableProperty
  compoundRow: CompoundPropertyInputConfig
  compoundSecondaryProperties: Partial<Record<AnimatableProperty, AnimatableProperty>>
  spacious: boolean
  disabled: boolean
  rowLocked: boolean
  hasPropertyLink: boolean
  hasKeyframeAtCurrentFrame: boolean
  isCurrentFrameBlocked: boolean
  autoKeyEnabled: boolean
  activateProperty: (property: AnimatableProperty) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragCancel?: () => void
  onPropertyValuePreview?: (property: AnimatableProperty, value: number) => void
}

export type PropertyValueScrubEvent = PointerEvent & { currentTarget: HTMLInputElement }

export interface PropertyRowValueInputProps {
  property: AnimatableProperty
  rowLabel: string
  spacious: boolean
  hasPropertyLink: boolean
  disabled: boolean
  rowLocked: boolean
  canCommit: boolean
  hasKeyframeAtCurrentFrame: boolean
  isCurrentFrameBlocked: boolean
  autoKeyEnabled: boolean
  propertyValues: Partial<Record<AnimatableProperty, number>>
  valueDrafts: Partial<Record<AnimatableProperty, string>>
  valueDraftAtFocusRef: Ref<Partial<Record<AnimatableProperty, string>>>
  skipNextBlurCommitPropertyRef: Ref<AnimatableProperty | null>
  onValueChange: (property: AnimatableProperty, value: string) => void
  onScrubStart: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  onScrubMove: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  onScrubEnd: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  onScrubCancel: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  onValueCommit: (property: AnimatableProperty, options?: { allowCreate?: boolean }) => void
  onFocusProperty: (property: AnimatableProperty) => void
  onEditingChange: SetState<AnimatableProperty | null>
  onDraftsChange: SetState<Partial<Record<AnimatableProperty, string>>>
  formatDisplayValue: (property: AnimatableProperty, value: number | undefined) => string
  t: TFunction
}

export interface PropertyRowExpressionButtonProps {
  linkableProperty: DirectLinkableProperty | null
  rowLabel: string
  visible: boolean
  canEdit: boolean
  expressionError: string | undefined
  disabled: boolean
  rowLocked: boolean
  propertyExpression: PropertyExpression | undefined
  onOpenExpression: (property: DirectLinkableProperty, expression?: PropertyExpression) => void
}
