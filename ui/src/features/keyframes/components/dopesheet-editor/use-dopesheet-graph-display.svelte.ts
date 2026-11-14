// SPDX-License-Identifier: MIT

/**
 * Dopesheet graph-pane display state.
 * Owns what the graph pane shows: the visible property list and its value
 * scale, which property's curve is drawn, and the keys the focused pane
 * claims. The decisions themselves live in dopesheet-graph-display; this hook
 * is the wiring around them.
 */

import type { AnimatableProperty, Keyframe, KeyframeRef } from '@/types/keyframe'
import { getCombinedGraphValueRange } from '../value-graph-editor/value-range-utils'
import { PROPERTY_VALUE_RANGES } from '@/features/keyframes/property-value-ranges'
import type { Ref } from '../ref-state.svelte'
import {
  handleGraphPaneKeyDown as runGraphPaneKeyDown,
  resolveGraphDisplayProperty,
} from './dopesheet-graph-display'

export interface UseDopesheetGraphDisplayOptions {
  graphPaneRef: Ref<HTMLDivElement | null>
  graphVisibleProperties: Set<AnimatableProperty>
  compoundSecondaryProperties: Partial<Record<AnimatableProperty, AnimatableProperty>>
  graphableProperties: AnimatableProperty[]
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  autoZoomGraphHeight: boolean
  activeSelectedProperty: AnimatableProperty | null
  isPropertyLocked: (property: AnimatableProperty) => boolean
  disabled: boolean
  selectedRefs: KeyframeRef[]
  nudgeSelectedKeyframes: (deltaFrames: number) => void
  onRemoveKeyframes?: (refs: KeyframeRef[]) => void
}

export interface UseDopesheetGraphDisplayReturn {
  readonly visibleGraphProperties: AnimatableProperty[]
  readonly verticalZoomRatioBase: number
  readonly graphDisplayProperty: AnimatableProperty | null
  readonly graphDisplayPropertyLocked: boolean
  focusGraphPane: () => void
  handleGraphPaneKeyDown: (event: KeyboardEvent) => void
}

export function useDopesheetGraphDisplay(
  options: () => UseDopesheetGraphDisplayOptions,
): UseDopesheetGraphDisplayReturn {
  const graphVisibleProperties = $derived(options().graphVisibleProperties)
  const compoundSecondaryProperties = $derived(options().compoundSecondaryProperties)
  const graphableProperties = $derived(options().graphableProperties)
  const keyframesByProperty = $derived(options().keyframesByProperty)
  const autoZoomGraphHeight = $derived(options().autoZoomGraphHeight)
  const activeSelectedProperty = $derived(options().activeSelectedProperty)
  const isPropertyLocked = $derived(options().isPropertyLocked)

  const visibleGraphProperties = $derived.by(() => {
    const properties = new Set(graphVisibleProperties)
    for (const property of graphVisibleProperties) {
      const secondary = compoundSecondaryProperties[property]
      if (secondary) properties.add(secondary)
    }
    return [...properties]
  })
  const graphBaseValueRange = $derived(
    getCombinedGraphValueRange(
      visibleGraphProperties.map((property) => PROPERTY_VALUE_RANGES[property] ?? null),
      visibleGraphProperties.map((property) => keyframesByProperty[property] ?? []),
      autoZoomGraphHeight,
    ),
  )
  const graphBaseValueSpan = $derived(
    Math.max(0.0001, graphBaseValueRange.max - graphBaseValueRange.min),
  )
  const graphMinZoomValueSpan = $derived(Math.max(graphBaseValueSpan * 0.02, 0.0001))
  const verticalZoomRatioBase = $derived(Math.max(1, graphBaseValueSpan / graphMinZoomValueSpan))

  const graphDisplayProperty = $derived(
    resolveGraphDisplayProperty(
      graphVisibleProperties,
      graphableProperties,
      activeSelectedProperty,
    ),
  )
  const graphDisplayPropertyLocked = $derived(
    graphDisplayProperty ? isPropertyLocked(graphDisplayProperty) : false,
  )
  const focusGraphPane = () => {
    // `preventScroll` is essential: focusing a tabindex="-1" element inside a
    // scrollable container makes the browser scroll it into view. Without this,
    // pressing a keyframe (which focuses the pane via a capturing pointerdown)
    // shifts the entire dopesheet scroll.
    options().graphPaneRef.current?.focus({ preventScroll: true })
  }
  const handleGraphPaneKeyDown = (event: KeyboardEvent) => {
    const { disabled, selectedRefs, onRemoveKeyframes, nudgeSelectedKeyframes } = options()
    runGraphPaneKeyDown(event, {
      disabled,
      propertyLocked: graphDisplayPropertyLocked,
      selectedRefs,
      onRemoveKeyframes,
      onNudge: nudgeSelectedKeyframes,
    })
  }

  return {
    get visibleGraphProperties() {
      return visibleGraphProperties
    },
    get verticalZoomRatioBase() {
      return verticalZoomRatioBase
    },
    get graphDisplayProperty() {
      return graphDisplayProperty
    },
    get graphDisplayPropertyLocked() {
      return graphDisplayPropertyLocked
    },
    focusGraphPane,
    handleGraphPaneKeyDown,
  }
}
