// SPDX-License-Identifier: MIT

/**
 * Property derivations for the dopesheet.
 * Resolves the property list the sheet shows, its graphable subset, the
 * accordion groups, filters and procedural bands. They depend only on the
 * keyframe map and the editor's property settings, so they recompute on data
 * changes rather than on viewport or playhead movement.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { MotionModifier } from '@/types/motion'
import { isColorAnimatableProperty } from '@/features/keyframes/property-value-ranges'
import {
  getProceduralBands,
  type ProceduralBand,
} from '@/features/keyframes/utils/procedural-preview'
import { getPropertyAccordionGroups, type PropertyAccordionGroup } from './property-groups'

export interface UseDopesheetPropertyDerivationsOptions {
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  /** Property rows the caller hides outright. */
  hiddenPropertyRows: readonly AnimatableProperty[]
  /** Groups rendered inline (no header row) inside their parent list. */
  inlinePropertyGroupIds: readonly string[]
  motionModifiers: readonly MotionModifier[] | undefined
  proceduralDurationInFrames: number
  proceduralFrameOffset: number
}

export interface DopesheetPropertyDerivations {
  readonly availableProperties: AnimatableProperty[]
  readonly hiddenPropertyRowSet: Set<AnimatableProperty>
  readonly graphableProperties: AnimatableProperty[]
  readonly allPropertyGroups: PropertyAccordionGroup[]
  readonly inlinePropertyGroupIdSet: Set<string>
  readonly propertyGroupIdByProperty: Map<AnimatableProperty, string>
  readonly keyframedPropertyIds: Set<string>
  readonly proceduralBandByProperty: Map<AnimatableProperty, ProceduralBand>
}

/** Derives the sheet's property lists, groups and procedural bands. */
export function useDopesheetPropertyDerivations(
  options: () => UseDopesheetPropertyDerivationsOptions,
): DopesheetPropertyDerivations {
  const keyframesByProperty = $derived(options().keyframesByProperty)
  const hiddenPropertyRows = $derived(options().hiddenPropertyRows)
  const inlinePropertyGroupIds = $derived(options().inlinePropertyGroupIds)
  const motionModifiers = $derived(options().motionModifiers)
  const proceduralDurationInFrames = $derived(options().proceduralDurationInFrames)
  const proceduralFrameOffset = $derived(options().proceduralFrameOffset)

  const availableProperties = $derived(Object.keys(keyframesByProperty) as AnimatableProperty[])
  const hiddenPropertyRowSet = $derived(new Set<AnimatableProperty>(hiddenPropertyRows))
  // Properties with an actual curve to draw (>= 2 keyframes). The graph picks a
  // default from these so it isn't blank when the selected/first property only
  // has a single keyframe.
  const graphableProperties = $derived(
    availableProperties.filter(
      (property) =>
        !isColorAnimatableProperty(property) && (keyframesByProperty[property]?.length ?? 0) >= 2,
    ),
  )
  const allPropertyGroups = $derived(getPropertyAccordionGroups(availableProperties))
  const inlinePropertyGroupIdSet = $derived(new Set(inlinePropertyGroupIds))
  const propertyGroupIdByProperty = $derived.by(() => {
    const map = new Map<AnimatableProperty, string>()
    for (const group of allPropertyGroups) {
      for (const property of group.properties) {
        map.set(property, group.id)
      }
    }
    return map
  })
  const keyframedPropertyIds = $derived(
    new Set<string>(
      availableProperties.filter((property) => (keyframesByProperty[property] ?? []).length > 0),
    ),
  )
  const proceduralBandByProperty = $derived(
    getProceduralBands(motionModifiers, proceduralDurationInFrames, proceduralFrameOffset),
  )

  return {
    get availableProperties() {
      return availableProperties
    },
    get hiddenPropertyRowSet() {
      return hiddenPropertyRowSet
    },
    get graphableProperties() {
      return graphableProperties
    },
    get allPropertyGroups() {
      return allPropertyGroups
    },
    get inlinePropertyGroupIdSet() {
      return inlinePropertyGroupIdSet
    },
    get propertyGroupIdByProperty() {
      return propertyGroupIdByProperty
    },
    get keyframedPropertyIds() {
      return keyframedPropertyIds
    },
    get proceduralBandByProperty() {
      return proceduralBandByProperty
    },
  }
}
