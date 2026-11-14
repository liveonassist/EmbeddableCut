// SPDX-License-Identifier: MIT

/**
 * Dopesheet sheet structure.
 * Owns the rows the sheet is built from: the visible property list and its
 * filters, the frame-independent keyframe map, the grouped rows the group cells
 * read, and the flattened keyframe list the header counts read. Everything
 * here derives from the keyframe map and the property settings, so it
 * recomputes on data changes rather than on viewport or playhead movement —
 * except the per-row `controls`, which are deliberately playhead-dependent so
 * the timeline cells, which read only the frame-independent structure, skip
 * updating during a scrub.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import {
  buildGroupedPropertyRows,
  buildGroupedPropertyStructure,
  type DopesheetPropertyGroupStructure,
} from './dopesheet-helpers'
import { useGroupExpansion } from './use-group-expansion.svelte'
import type { DopesheetPropertyDerivations } from './use-dopesheet-property-derivations.svelte'
import type { DopesheetPropertyGroup, DopesheetPropertyRow } from './dopesheet-types'
import type { PropertyAccordionGroup } from './property-groups'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import { getDopesheetRowControlState } from './row-controls'

/** A sheet row before the playhead-dependent control state is attached. */
export interface DopesheetSheetRowStructure {
  property: AnimatableProperty
  keyframes: Keyframe[]
}

export interface UseDopesheetSheetStructureOptions {
  availableProperties: AnimatableProperty[]
  hiddenPropertyRowSet: DopesheetPropertyDerivations['hiddenPropertyRowSet']
  propertyGroupIdByProperty: DopesheetPropertyDerivations['propertyGroupIdByProperty']
  keyframedPropertyIds: DopesheetPropertyDerivations['keyframedPropertyIds']
  proceduralBandByProperty: DopesheetPropertyDerivations['proceduralBandByProperty']
  visibleGroups: Record<string, boolean>
  propertyFilter: DopesheetEditorProps['propertyFilter']
  showKeyframedOnly: boolean
  resolvedPropertyLinks: NonNullable<DopesheetEditorProps['propertyLinks']>
  keyframesByProperty: DopesheetEditorProps['keyframesByProperty']
  currentFrame: number
  selectedProperty: AnimatableProperty | null
  allPropertyGroups: PropertyAccordionGroup[]
  initialExpandedGroups: DopesheetEditorProps['initialExpandedGroups']
  onExpandedGroupsChange: DopesheetEditorProps['onExpandedGroupsChange']
}

export interface UseDopesheetSheetStructureReturn {
  readonly filterKeyframedOnly: boolean
  readonly visibleProperties: AnimatableProperty[]
  readonly propertyColumnProperties: AnimatableProperty[]
  readonly activeSelectedProperty: AnimatableProperty | null
  readonly hasPropertyFilters: boolean
  readonly sheetKeyframesByProperty: Map<AnimatableProperty, Keyframe[]>
  readonly sheetRowsStructure: DopesheetSheetRowStructure[]
  readonly groupTimelineById: Map<
    string,
    DopesheetPropertyGroupStructure<DopesheetSheetRowStructure>
  >
  readonly sheetRows: DopesheetPropertyRow[]
  readonly groupedSheetRows: DopesheetPropertyGroup[]
  readonly propertyRowByProperty: Map<AnimatableProperty, DopesheetPropertyRow>
  readonly visibleKeyframes: Array<{ property: AnimatableProperty; keyframe: Keyframe }>
  readonly expandedGroups: Record<string, boolean>
  toggleGroup: (groupId: string) => void
  setAllGroupsExpanded: (expanded: boolean) => void
}

/** Derives the sheet's rows, group structure and flattened keyframe list. */
export function useDopesheetSheetStructure(
  options: () => UseDopesheetSheetStructureOptions,
): UseDopesheetSheetStructureReturn {
  const availableProperties = $derived(options().availableProperties)
  const hiddenPropertyRowSet = $derived(options().hiddenPropertyRowSet)
  const propertyGroupIdByProperty = $derived(options().propertyGroupIdByProperty)
  const keyframedPropertyIds = $derived(options().keyframedPropertyIds)
  const proceduralBandByProperty = $derived(options().proceduralBandByProperty)
  const visibleGroups = $derived(options().visibleGroups)
  const propertyFilter = $derived(options().propertyFilter)
  const showKeyframedOnly = $derived(options().showKeyframedOnly)
  const resolvedPropertyLinks = $derived(options().resolvedPropertyLinks)
  const keyframesByProperty = $derived(options().keyframesByProperty)
  const currentFrame = $derived(options().currentFrame)
  const selectedProperty = $derived(options().selectedProperty)
  const allPropertyGroups = $derived(options().allPropertyGroups)

  const filterKeyframedOnly = $derived(
    propertyFilter === undefined ? showKeyframedOnly : propertyFilter === 'keyframed',
  )
  const linkedTransformPropertyIds = $derived(
    new Set<string>(
      resolvedPropertyLinks.map((link) => {
        if (link.targetProperty === 'position') return 'x'
        if (link.targetProperty === 'scale') return 'width'
        if (link.targetProperty === 'anchor') return 'anchorX'
        return link.targetProperty
      }),
    ),
  )

  const filteredProperties = $derived(
    availableProperties
      .filter((property) => !hiddenPropertyRowSet.has(property))
      .filter((property) => {
        const groupId = propertyGroupIdByProperty.get(property)
        const groupVisible = groupId ? (visibleGroups[groupId] ?? true) : true
        if (!groupVisible) return false
        if (
          filterKeyframedOnly &&
          !keyframedPropertyIds.has(property) &&
          !linkedTransformPropertyIds.has(property) &&
          !proceduralBandByProperty.has(property)
        )
          return false
        return true
      }),
  )
  const activeSelectedProperty = $derived(
    selectedProperty && filteredProperties.includes(selectedProperty) ? selectedProperty : null,
  )
  const visibleProperties = $derived(filteredProperties)
  const propertyColumnProperties = $derived(filteredProperties)
  const hasPropertyFilters = $derived(
    filterKeyframedOnly || allPropertyGroups.some((group) => visibleGroups[group.id] === false),
  )

  // Frame-independent keyframe data. These references only change when the
  // properties or keyframes change — NOT when the playhead moves — so the
  // timeline grid cells skip updating during scrubs.
  const sheetKeyframesByProperty = $derived.by(() => {
    const map = new Map<AnimatableProperty, Keyframe[]>()
    for (const property of visibleProperties) {
      map.set(
        property,
        (keyframesByProperty[property] ?? []).toSorted((a, b) => a.frame - b.frame),
      )
    }
    return map
  })

  const sheetRowsStructure = $derived(
    visibleProperties.map((property) => ({
      property,
      keyframes: sheetKeyframesByProperty.get(property) ?? [],
    })),
  )

  // Stable, frame-independent group structure keyed by group id — used to feed
  // the group timeline cells.
  const groupTimelineById = $derived.by(() => {
    const map = new Map<string, DopesheetPropertyGroupStructure<DopesheetSheetRowStructure>>()
    for (const group of buildGroupedPropertyStructure(sheetRowsStructure)) {
      map.set(group.id, group)
    }
    return map
  })

  // Playhead-dependent rows (carry the per-frame `controls`). `propertyColumnProperties`
  // is the same list as `visibleProperties`, so the column/sheet rows are identical.
  const sheetRows = $derived<DopesheetPropertyRow[]>(
    sheetRowsStructure.map((row) => ({
      ...row,
      controls: getDopesheetRowControlState(row.keyframes, currentFrame),
    })),
  )

  const groupedSheetRows = $derived(buildGroupedPropertyRows(sheetRows, currentFrame))
  const propertyRowByProperty = $derived(new Map(sheetRows.map((row) => [row.property, row])))
  const groupExpansion = useGroupExpansion(() => ({
    allPropertyGroups,
    groupedSheetRows,
    groupedPropertyRows: groupedSheetRows,
    activeSelectedProperty,
    initialExpandedGroups: options().initialExpandedGroups,
    onExpandedGroupsChange: options().onExpandedGroupsChange,
  }))

  const visibleKeyframes = $derived(
    sheetRows.flatMap((row) =>
      row.keyframes.map((keyframe) => ({
        property: row.property,
        keyframe,
      })),
    ),
  )

  return {
    get filterKeyframedOnly() {
      return filterKeyframedOnly
    },
    get visibleProperties() {
      return visibleProperties
    },
    get propertyColumnProperties() {
      return propertyColumnProperties
    },
    get activeSelectedProperty() {
      return activeSelectedProperty
    },
    get hasPropertyFilters() {
      return hasPropertyFilters
    },
    get sheetKeyframesByProperty() {
      return sheetKeyframesByProperty
    },
    get sheetRowsStructure() {
      return sheetRowsStructure
    },
    get groupTimelineById() {
      return groupTimelineById
    },
    get sheetRows() {
      return sheetRows
    },
    get groupedSheetRows() {
      return groupedSheetRows
    },
    get propertyRowByProperty() {
      return propertyRowByProperty
    },
    get visibleKeyframes() {
      return visibleKeyframes
    },
    get expandedGroups() {
      return groupExpansion.expandedGroups
    },
    toggleGroup: groupExpansion.toggleGroup,
    setAllGroupsExpanded: groupExpansion.setAllGroupsExpanded,
  }
}
