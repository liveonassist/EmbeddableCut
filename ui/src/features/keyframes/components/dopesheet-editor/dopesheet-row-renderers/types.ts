// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import type {
  AnimatableProperty,
  DirectLinkableProperty,
  DirectPropertyLink,
  Keyframe,
  PropertyExpression,
} from '@/types/keyframe'
import type { ExpressionValue } from '@/features/keyframes/utils/property-expression'
import type { CompoundPropertyInputConfig } from '../compound-property-inputs'
import type { PropertyExpressionDraft } from '../expression-reference-utils'
import type { DopesheetPropertyGroup, DopesheetPropertyRow } from '../dopesheet-types'
import type {
  DopesheetDimensionSeparationControl,
  DopesheetDimensionSeparationEntry,
} from '../dopesheet-group-options-menu'
import type { Ref, SetState } from '../../ref-state.svelte'
import type {
  PropertyLinkPointerEvent,
  PropertyValueScrubEvent,
} from '../property-row-controls/types'

/** First row in the group whose control owns a coupled/separated dimension pair. */
export function findGroupDimensionSeparation(
  rows: readonly DopesheetPropertyRow[],
  controls: Partial<Record<AnimatableProperty, DopesheetDimensionSeparationControl>>,
): DopesheetDimensionSeparationEntry | null {
  for (const row of rows) {
    const control = controls[row.property]
    if (control) return { property: row.property, control }
  }
  return null
}

export interface DopesheetGroupHeaderProps {
  group: DopesheetPropertyGroup
  t: TFunction
  expandedGroups: Record<string, boolean>
  graphVisibleProperties: Set<AnimatableProperty>
  dimensionSeparationByProperty: Partial<
    Record<AnimatableProperty, DopesheetDimensionSeparationControl>
  >
  canClearRow: (row: DopesheetPropertyRow) => boolean
  disabled: boolean
  isPropertyLocked: (property: AnimatableProperty) => boolean
  onNavigateToKeyframe?: (frame: number) => void
  onResetPropertiesToDefault?: (properties: AnimatableProperty[]) => void
  presentation: 'editor' | 'classic' | 'lanes'
  setAllGroupsExpanded: (expanded: boolean) => void
  setAllRowsLocked: (locked: boolean) => void
  setGroupLocked: (properties: AnimatableProperty[], locked: boolean) => void
  toggleGroup: (groupId: string) => void
  toggleGroupCurves: (properties: AnimatableProperty[]) => void
  handleClearGroup: (group: DopesheetPropertyGroup) => void
  handleRowNavigate: (property: AnimatableProperty, keyframe: Keyframe | null) => void
}

export interface DopesheetPropertyRowContentProps {
  row: DopesheetPropertyRow
  /** Row presentation flags from the sheet or lane layout. */
  options?: { classic?: boolean; indented?: boolean }
  activateProperty: (property: AnimatableProperty) => void
  axisConstraintByProperty: Partial<
    Record<
      AnimatableProperty,
      { label: string; constrained: boolean; onChange: (constrained: boolean) => void }
    >
  >
  autoKeyEnabledByProperty: Partial<Record<AnimatableProperty, boolean>>
  beginPropertyLink?: (event: PropertyLinkPointerEvent, property: DirectLinkableProperty) => void
  canClearRow: (row: DopesheetPropertyRow) => boolean
  compoundPropertyRows: Partial<Record<AnimatableProperty, CompoundPropertyInputConfig>>
  compoundSecondaryProperties: Partial<Record<AnimatableProperty, AnimatableProperty>>
  itemId: string
  itemFrom: number
  currentFrame: number
  fps: number
  disabled: boolean
  expressionEditor: PropertyExpressionDraft | null
  formatPropertyValue: (property: AnimatableProperty, value: number | undefined) => string
  globalFrame?: number | null | undefined
  graphVisibleProperties: Set<AnimatableProperty>
  handleClearProperty: (property: AnimatableProperty) => void
  handleRowAutoKeyToggle: (property: AnimatableProperty) => void
  handleRowNavigate: (property: AnimatableProperty, keyframe: Keyframe | null) => void
  handleRowToggleKeyframe: (property: AnimatableProperty, currentKeyframes: Keyframe[]) => void
  handleRowValueChange: (property: AnimatableProperty, value: string) => void
  handleRowValueCommit: (property: AnimatableProperty, options?: { allowCreate?: boolean }) => void
  handleValueScrubEnd: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  handleValueScrubCancel: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  handleValueScrubMove: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  handleValueScrubStart: (event: PropertyValueScrubEvent, property: AnimatableProperty) => void
  isPropertyLocked: (property: AnimatableProperty) => boolean
  isCurrentFrameBlocked: boolean
  onAddKeyframe?: (property: AnimatableProperty, frame: number) => void
  onNavigateToKeyframe?: (frame: number) => void
  onCurveVisibilityChange?: (property: AnimatableProperty, visible: boolean) => void
  onDragCancel?: () => void
  onDragEnd?: () => void
  onDragStart?: () => void
  onPropertyValueCommit?: (
    property: AnimatableProperty,
    value: number,
    options?: { allowCreate?: boolean },
  ) => void
  onPropertyValuePreview?: (property: AnimatableProperty, value: number) => void
  resolvedPropertyLinks: readonly DirectPropertyLink[]
  resolvedPropertyLinkSourceLabels: Partial<Record<DirectLinkableProperty, string>>
  removePropertyLink?: (property: DirectLinkableProperty) => void
  propertyExpressions: readonly PropertyExpression[]
  propertyLabels: Partial<Record<AnimatableProperty, string>>
  preExpressionPropertyValues: Partial<Record<AnimatableProperty, number>>
  resolveExpressionReference?: (
    itemId: string,
    property: DirectLinkableProperty,
  ) => ExpressionValue | null
  onSetPropertyExpression?: (
    property: DirectLinkableProperty,
    source: string,
    enabled: boolean,
  ) => void
  openPropertyExpressionEditor: (
    property: DirectLinkableProperty,
    expression?: PropertyExpression,
  ) => void
  onResetPropertiesToDefault?: (properties: AnimatableProperty[]) => void
  propertyValues: Partial<Record<AnimatableProperty, number>>
  presentation: 'editor' | 'classic' | 'lanes'
  selectedProperty: AnimatableProperty | null
  selectedCurveVisibleExternally: boolean
  setAllRowsLocked: (locked: boolean) => void
  setEditingValueProperty: SetState<AnimatableProperty | null>
  setValueDrafts: SetState<Partial<Record<AnimatableProperty, string>>>
  showGraphPane: boolean
  showSinglePropertyCurve: (property: AnimatableProperty) => void
  singleCurveMode: boolean
  skipNextBlurCommitPropertyRef: Ref<AnimatableProperty | null>
  spacious: boolean
  t: TFunction
  togglePropertyCurve: (property: AnimatableProperty) => void
  toggleLockedProperty: (property: AnimatableProperty) => void
  valueDraftAtFocusRef: Ref<Partial<Record<AnimatableProperty, string>>>
  valueDrafts: Partial<Record<AnimatableProperty, string>>
}
