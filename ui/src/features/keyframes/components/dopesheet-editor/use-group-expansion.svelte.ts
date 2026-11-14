// SPDX-License-Identifier: MIT

/**
 * Group expansion hook.
 * Owns expanded/collapsed state for property accordion groups, the
 * normalization effect that prunes/adds entries as groups appear and
 * disappear, and the auto-open-on-active-property behavior. Lives in a
 * separate hook from property filters because it depends on the grouped
 * rows that are derived from the filtered properties.
 */

import { untrack } from 'svelte'
import type { AnimatableProperty } from '@/types/keyframe'
import type { DopesheetPropertyGroup } from './dopesheet-types'
import type { PropertyAccordionGroup } from './property-groups'

interface UseGroupExpansionOptions {
  allPropertyGroups: PropertyAccordionGroup[]
  groupedSheetRows: DopesheetPropertyGroup[]
  groupedPropertyRows: DopesheetPropertyGroup[]
  activeSelectedProperty: AnimatableProperty | null
  initialExpandedGroups?: Readonly<Record<string, boolean>>
  onExpandedGroupsChange?: (expandedGroups: Record<string, boolean>) => void
}

export interface UseGroupExpansionReturn {
  readonly expandedGroups: Record<string, boolean>
  toggleGroup: (groupId: string) => void
  setAllGroupsExpanded: (expanded: boolean) => void
}

export function useGroupExpansion(
  options: () => UseGroupExpansionOptions,
): UseGroupExpansionReturn {
  let expandedGroups = $state.raw<Record<string, boolean>>(
    untrack(() => ({ ...options().initialExpandedGroups })),
  )
  const update = (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    expandedGroups = updater(untrack(() => expandedGroups))
  }

  const groupedSheetRows = $derived(options().groupedSheetRows)
  const groupedPropertyRows = $derived(options().groupedPropertyRows)
  const activeSelectedProperty = $derived(options().activeSelectedProperty)
  const onExpandedGroupsChange = $derived(options().onExpandedGroupsChange)

  $effect(() => {
    onExpandedGroupsChange?.(expandedGroups)
  })

  // Keep expandedGroups in sync with the actual rendered groups
  $effect(() => {
    const groupIds = new Set([
      ...groupedSheetRows.map((group) => group.id),
      ...groupedPropertyRows.map((group) => group.id),
    ])

    update((prev) => {
      const next = { ...prev }
      let changed = false

      for (const groupId of groupIds) {
        if (next[groupId] === undefined) {
          next[groupId] = true
          changed = true
        }
      }

      for (const groupId of Object.keys(next)) {
        if (!groupIds.has(groupId)) {
          delete next[groupId]
          changed = true
        }
      }

      return changed ? next : prev
    })
  })

  // Auto-expand the group containing the selected property when it changes
  $effect(() => {
    if (!activeSelectedProperty) return

    const activeGroup = [...groupedPropertyRows, ...groupedSheetRows].find((group) =>
      group.rows.some((row) => row.property === activeSelectedProperty),
    )
    if (!activeGroup) return

    update((prev) => {
      if (prev[activeGroup.id] !== false) return prev
      return {
        ...prev,
        [activeGroup.id]: true,
      }
    })
  })

  const toggleGroup = (groupId: string) => {
    update((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }))
  }

  const setAllGroupsExpanded = (expanded: boolean) => {
    expandedGroups = Object.fromEntries(
      options().allPropertyGroups.map((group) => [group.id, expanded]),
    ) as Record<string, boolean>
  }

  return {
    get expandedGroups() {
      return expandedGroups
    },
    toggleGroup,
    setAllGroupsExpanded,
  }
}
