// SPDX-License-Identifier: MIT

/**
 * Property filter hook.
 * Owns the dopesheet's filter state — group visibility, keyframed-only
 * mode, and per-property lock state — plus the normalization effects
 * that keep each map in sync with the current set of properties/groups,
 * and the mutators (toggle, group-set).
 *
 * Kept separate from useGroupExpansion because filtered rows depend on
 * this hook's output, and group-expanded state depends on those rows.
 */

import { untrack } from 'svelte'
import type { AnimatableProperty } from '@/types/keyframe'
import { resolveSetState, type SetState } from '../ref-state.svelte'
import type { PropertyAccordionGroup } from './property-groups'

interface UsePropertyFiltersOptions {
  allPropertyGroups: PropertyAccordionGroup[]
  availableProperties: AnimatableProperty[]
  initialVisibleGroupIds?: readonly string[]
}

export interface UsePropertyFiltersReturn {
  readonly visibleGroups: Record<string, boolean>
  setVisibleGroups: SetState<Record<string, boolean>>
  readonly showKeyframedOnly: boolean
  setShowKeyframedOnly: SetState<boolean>
  readonly lockedProperties: Partial<Record<AnimatableProperty, boolean>>
  toggleVisibleGroup: (groupId: string) => void
  /** Rebuilt when the lock map changes, so rows rendering from it update. */
  readonly isPropertyLocked: (property: AnimatableProperty) => boolean
  toggleLockedProperty: (property: AnimatableProperty) => void
  setGroupLocked: (properties: AnimatableProperty[], locked: boolean) => void
}

export function usePropertyFilters(
  options: () => UsePropertyFiltersOptions,
): UsePropertyFiltersReturn {
  const initialVisibleGroupIds = untrack(() => {
    const ids = options().initialVisibleGroupIds
    return ids ? new Set(ids) : null
  })
  let visibleGroups = $state.raw<Record<string, boolean>>(
    untrack(() =>
      Object.fromEntries(
        options().allPropertyGroups.map((group) => [
          group.id,
          initialVisibleGroupIds?.has(group.id) ?? true,
        ]),
      ),
    ),
  )
  let showKeyframedOnly = $state(false)
  let lockedProperties = $state.raw<Partial<Record<AnimatableProperty, boolean>>>({})

  const setVisibleGroups: SetState<Record<string, boolean>> = (next) => {
    visibleGroups = resolveSetState(
      next,
      untrack(() => visibleGroups),
    )
  }
  const setShowKeyframedOnly: SetState<boolean> = (next) => {
    showKeyframedOnly = resolveSetState(
      next,
      untrack(() => showKeyframedOnly),
    )
  }
  const setLockedProperties = (
    updater: (
      prev: Partial<Record<AnimatableProperty, boolean>>,
    ) => Partial<Record<AnimatableProperty, boolean>>,
  ) => {
    lockedProperties = updater(untrack(() => lockedProperties))
  }

  const allPropertyGroups = $derived(options().allPropertyGroups)
  const availableProperties = $derived(options().availableProperties)

  // Keep visibleGroups in sync with the actual set of groups
  $effect(() => {
    const groupIds = new Set(allPropertyGroups.map((group) => group.id))

    setVisibleGroups((prev) => {
      const next = { ...prev }
      let changed = false

      for (const groupId of groupIds) {
        if (next[groupId] === undefined) {
          next[groupId] = initialVisibleGroupIds?.has(groupId) ?? true
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

  // Keep lockedProperties in sync with the actual set of properties
  $effect(() => {
    const propertyIds = new Set(availableProperties)

    setLockedProperties((prev) => {
      const next = { ...prev }
      let changed = false

      for (const property of propertyIds) {
        if (next[property] === undefined) {
          next[property] = false
          changed = true
        }
      }

      for (const property of Object.keys(next) as AnimatableProperty[]) {
        if (!propertyIds.has(property)) {
          delete next[property]
          changed = true
        }
      }

      return changed ? next : prev
    })
  })

  const toggleVisibleGroup = (groupId: string) => {
    setVisibleGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }))
  }

  const isPropertyLocked = $derived.by(() => {
    const locked = lockedProperties
    return (property: AnimatableProperty) => locked[property] ?? false
  })

  const toggleLockedProperty = (property: AnimatableProperty) => {
    setLockedProperties((prev) => ({
      ...prev,
      [property]: !(prev[property] ?? false),
    }))
  }

  const setGroupLocked = (properties: AnimatableProperty[], locked: boolean) => {
    setLockedProperties((prev) => ({
      ...prev,
      ...Object.fromEntries(properties.map((property) => [property, locked])),
    }))
  }

  return {
    get visibleGroups() {
      return visibleGroups
    },
    setVisibleGroups,
    get showKeyframedOnly() {
      return showKeyframedOnly
    },
    setShowKeyframedOnly,
    get lockedProperties() {
      return lockedProperties
    },
    toggleVisibleGroup,
    get isPropertyLocked() {
      return isPropertyLocked
    },
    toggleLockedProperty,
    setGroupLocked,
  }
}
