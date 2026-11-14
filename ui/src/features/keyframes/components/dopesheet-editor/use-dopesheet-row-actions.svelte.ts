// SPDX-License-Identifier: MIT

/**
 * Row actions for the dopesheet sheet.
 * Owns every per-row command the row controls fire: clearing, property
 * activation, the add/toggle keyframe buttons, the auto-key switch and the
 * nudge shared by the graph pane and the shortcuts. The editor keeps the one
 * handler that has to sit next to state declared below this cluster
 * (`handleRowNavigate`, which writes the range-selection anchor).
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import type { DopesheetPropertyGroup, DopesheetPropertyRow } from './dopesheet-types'
import {
  buildPropertyKeyframeRefs,
  buildRowKeyframeRefs,
  removeSelectionIds,
} from './row-action-helpers'

export interface UseDopesheetRowActionsOptions extends Pick<
  DopesheetEditorProps,
  | 'onCurveVisibilityChange'
  | 'onPropertyChange'
  | 'onActivePropertyChange'
  | 'onRemoveKeyframes'
  | 'onSelectionChange'
  | 'onAddKeyframe'
> {
  disabled: boolean
  isPropertyLocked: (property: AnimatableProperty) => boolean
  itemId: string
  currentFrame: number
  /** Whether the playhead sits inside a transition region (adds are rejected). */
  isCurrentFrameBlocked: boolean
  /** Surfaces a rejected add (playhead inside a transition region). */
  notifyKeyframeBlocked: () => void
  propertyRowByProperty: Map<AnimatableProperty, DopesheetPropertyRow>
  selectedKeyframeIds: Set<string>
  /** Whether the graph pane is visible, so activation also drives its curve. */
  showGraphPane: boolean
  singleCurveMode: boolean
  setGraphVisibleProperties: (properties: Set<AnimatableProperty>) => void
  toggleAutoKeyframeEnabled: (itemId: string, property: AnimatableProperty) => void
  moveSelectedKeyframesByDelta: (deltaFrames: number) => void
}

export interface DopesheetRowActions {
  canClearRow: (row: DopesheetPropertyRow) => boolean
  activateProperty: (property: AnimatableProperty) => void
  showSinglePropertyCurve: (property: AnimatableProperty) => void
  handleClearProperty: (property: AnimatableProperty) => void
  handleClearGroup: (group: DopesheetPropertyGroup) => void
  handleRowToggleKeyframe: (property: AnimatableProperty, currentKeyframes: Keyframe[]) => void
  handleRowAddKeyframe: (property: AnimatableProperty, currentKeyframes: Keyframe[]) => void
  handleRowAutoKeyToggle: (property: AnimatableProperty) => void
  nudgeSelectedKeyframes: (deltaFrames: number) => void
}

/**
 * Builds the sheet's per-row commands.
 *
 * React rebuilt each command when a dependency changed, and memoized rows
 * re-rendered on the new identity. Here each command reads the latest options
 * when called, except `canClearRow`, whose result rows render from: it is
 * rebuilt (a getter) when `disabled`, `isPropertyLocked` or `onRemoveKeyframes`
 * change, so rows reading it update.
 */
export function useDopesheetRowActions(
  options: () => UseDopesheetRowActionsOptions,
): DopesheetRowActions {
  const disabled = $derived(options().disabled)
  const isPropertyLocked = $derived(options().isPropertyLocked)
  const onRemoveKeyframes = $derived(options().onRemoveKeyframes)

  const canClearRow = $derived.by(() => {
    const isDisabled = disabled
    const isLocked = isPropertyLocked
    const remove = onRemoveKeyframes
    return (row: DopesheetPropertyRow) => {
      if (isDisabled || !remove) return false
      if (isLocked(row.property)) return false
      return row.keyframes.length > 0
    }
  })

  const activateProperty = (property: AnimatableProperty) => {
    const {
      showGraphPane,
      singleCurveMode,
      setGraphVisibleProperties,
      onCurveVisibilityChange,
      onPropertyChange,
      onActivePropertyChange,
    } = options()
    if (showGraphPane) {
      if (singleCurveMode) {
        setGraphVisibleProperties(new Set([property]))
        onCurveVisibilityChange?.(property, true)
      }
      onPropertyChange?.(property)
    }
    onActivePropertyChange?.(property)
  }

  const showSinglePropertyCurve = (property: AnimatableProperty) => {
    const {
      setGraphVisibleProperties,
      onPropertyChange,
      onActivePropertyChange,
      onCurveVisibilityChange,
    } = options()
    setGraphVisibleProperties(new Set([property]))
    onPropertyChange?.(property)
    onActivePropertyChange?.(property)
    onCurveVisibilityChange?.(property, true)
  }

  const removeKeyframesForRows = (rows: DopesheetPropertyRow[]) => {
    const { onRemoveKeyframes, itemId, onSelectionChange, selectedKeyframeIds } = options()
    if (!onRemoveKeyframes) return

    const refs = buildRowKeyframeRefs(itemId, rows)

    if (refs.length === 0) return

    onRemoveKeyframes(refs)

    if (onSelectionChange) {
      onSelectionChange(
        removeSelectionIds(
          selectedKeyframeIds,
          refs.map((ref) => ref.keyframeId),
        ),
        { preserveExternalSelection: true },
      )
    }
  }

  const handleClearProperty = (property: AnimatableProperty) => {
    const row = options().propertyRowByProperty.get(property)
    if (!row || !canClearRow(row)) return

    activateProperty(property)
    removeKeyframesForRows([row])
  }

  const handleClearGroup = (group: DopesheetPropertyGroup) => {
    removeKeyframesForRows(group.rows.filter((row) => canClearRow(row)))
  }

  const handleRowToggleKeyframe = (property: AnimatableProperty, currentKeyframes: Keyframe[]) => {
    const {
      isPropertyLocked,
      onRemoveKeyframes,
      itemId,
      onSelectionChange,
      selectedKeyframeIds,
      isCurrentFrameBlocked,
      notifyKeyframeBlocked,
      onAddKeyframe,
      currentFrame,
    } = options()
    if (isPropertyLocked(property)) return
    activateProperty(property)
    if (currentKeyframes.length > 0) {
      if (!onRemoveKeyframes) return
      const refs = buildPropertyKeyframeRefs(itemId, property, currentKeyframes)
      onRemoveKeyframes(refs)
      if (onSelectionChange) {
        onSelectionChange(
          removeSelectionIds(
            selectedKeyframeIds,
            currentKeyframes.map((keyframe) => keyframe.id),
          ),
          { preserveExternalSelection: true },
        )
      }
      return
    }

    if (isCurrentFrameBlocked) {
      notifyKeyframeBlocked()
      return
    }
    if (!onAddKeyframe) return
    onAddKeyframe(property, currentFrame)
  }

  const handleRowAddKeyframe = (property: AnimatableProperty, currentKeyframes: Keyframe[]) => {
    const {
      isPropertyLocked,
      isCurrentFrameBlocked,
      notifyKeyframeBlocked,
      onAddKeyframe,
      currentFrame,
    } = options()
    if (isPropertyLocked(property)) return
    activateProperty(property)
    if (currentKeyframes.length > 0) return
    if (isCurrentFrameBlocked) {
      notifyKeyframeBlocked()
      return
    }
    onAddKeyframe?.(property, currentFrame)
  }

  const handleRowAutoKeyToggle = (property: AnimatableProperty) => {
    const { isPropertyLocked, toggleAutoKeyframeEnabled, itemId } = options()
    if (isPropertyLocked(property)) return
    activateProperty(property)
    toggleAutoKeyframeEnabled(itemId, property)
  }

  const nudgeSelectedKeyframes = (deltaFrames: number) => {
    options().moveSelectedKeyframesByDelta(deltaFrames)
  }

  return {
    get canClearRow() {
      return canClearRow
    },
    activateProperty,
    showSinglePropertyCurve,
    handleClearProperty,
    handleClearGroup,
    handleRowToggleKeyframe,
    handleRowAddKeyframe,
    handleRowAutoKeyToggle,
    nudgeSelectedKeyframes,
  }
}
