// SPDX-License-Identifier: MIT

/**
 * Dopesheet row and group-header prop bundles.
 * Both the sheet rows and the property column render the same row content and
 * the same group headers, so both come from one bundle each. A bundle keeps
 * its identity until one of its values changes, never following the options
 * object's identity: a fresh bundle per change of any editor value would make
 * every visible row re-read its props on every frame change.
 */

import type {
  DopesheetGroupHeaderProps,
  DopesheetPropertyRowContentProps,
} from './dopesheet-row-renderers'

export interface UseDopesheetRowPropsOptions extends Omit<
  DopesheetPropertyRowContentProps,
  'row' | 'options'
> {
  expandedGroups: DopesheetGroupHeaderProps['expandedGroups']
  dimensionSeparationByProperty: DopesheetGroupHeaderProps['dimensionSeparationByProperty']
  setAllGroupsExpanded: DopesheetGroupHeaderProps['setAllGroupsExpanded']
  setGroupLocked: DopesheetGroupHeaderProps['setGroupLocked']
  toggleGroup: DopesheetGroupHeaderProps['toggleGroup']
  toggleGroupCurves: DopesheetGroupHeaderProps['toggleGroupCurves']
  handleClearGroup: DopesheetGroupHeaderProps['handleClearGroup']
}

export interface UseDopesheetRowPropsReturn {
  readonly rowContentProps: Omit<DopesheetPropertyRowContentProps, 'row' | 'options'>
  readonly groupHeaderProps: Omit<DopesheetGroupHeaderProps, 'group'>
}

/** Returns `previous` while every value in `next` is identical to it. */
function keepIfShallowEqual<T extends object>(previous: T | undefined, next: T): T {
  if (!previous) return next
  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  if (previousKeys.length !== nextKeys.length) return next
  for (const key of nextKeys) {
    if (!Object.is(previous[key as keyof T], next[key as keyof T])) return next
  }
  return previous
}

/** Builds the row-content and group-header bundles. */
export function useDopesheetRowProps(
  options: () => UseDopesheetRowPropsOptions,
): UseDopesheetRowPropsReturn {
  let lastRowContentProps: Omit<DopesheetPropertyRowContentProps, 'row' | 'options'> | undefined
  let lastGroupHeaderProps: Omit<DopesheetGroupHeaderProps, 'group'> | undefined

  const rowContentProps = $derived.by(() => {
    const {
      expandedGroups: _expandedGroups,
      dimensionSeparationByProperty: _dimensionSeparationByProperty,
      setAllGroupsExpanded: _setAllGroupsExpanded,
      setGroupLocked: _setGroupLocked,
      toggleGroup: _toggleGroup,
      toggleGroupCurves: _toggleGroupCurves,
      handleClearGroup: _handleClearGroup,
      ...rowContent
    } = options()
    lastRowContentProps = keepIfShallowEqual(lastRowContentProps, rowContent)
    return lastRowContentProps
  })

  const groupHeaderProps = $derived.by(() => {
    const opts = options()
    lastGroupHeaderProps = keepIfShallowEqual(lastGroupHeaderProps, {
      t: opts.t,
      expandedGroups: opts.expandedGroups,
      graphVisibleProperties: opts.graphVisibleProperties,
      dimensionSeparationByProperty: opts.dimensionSeparationByProperty,
      canClearRow: opts.canClearRow,
      disabled: opts.disabled,
      isPropertyLocked: opts.isPropertyLocked,
      onNavigateToKeyframe: opts.onNavigateToKeyframe,
      onResetPropertiesToDefault: opts.onResetPropertiesToDefault,
      presentation: opts.presentation,
      setAllGroupsExpanded: opts.setAllGroupsExpanded,
      setAllRowsLocked: opts.setAllRowsLocked,
      setGroupLocked: opts.setGroupLocked,
      toggleGroup: opts.toggleGroup,
      toggleGroupCurves: opts.toggleGroupCurves,
      handleClearGroup: opts.handleClearGroup,
      handleRowNavigate: opts.handleRowNavigate,
    })
    return lastGroupHeaderProps
  })

  return {
    get rowContentProps() {
      return rowContentProps
    },
    get groupHeaderProps() {
      return groupHeaderProps
    },
  }
}
