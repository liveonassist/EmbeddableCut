// SPDX-License-Identifier: MIT

/**
 * Graph view state hook.
 * Owns the curve visibility set (with localStorage persistence per item),
 * the ruler unit, the show-all-handles + auto-zoom toggles, and the
 * vertical zoom level. Also exposes the toggle callbacks for individual
 * property curves and group curve batches.
 */

import { untrack } from 'svelte'
import type { AnimatableProperty } from '@/types/keyframe'
import {
  getDefaultGraphVisibleProperties,
  loadGraphVisibleProperties,
  saveGraphVisibleProperties,
} from './graph-visibility-storage'
import { resolveSetState, type SetState } from '../ref-state.svelte'

interface UseGraphViewStateOptions {
  itemId: string
  availableProperties: AnimatableProperty[]
  /** Properties that actually have a drawable curve (>= 2 keyframes). */
  graphableProperties: AnimatableProperty[]
  selectedProperty: AnimatableProperty | null
  onPropertyChange?: (property: AnimatableProperty | null) => void
  onActivePropertyChange?: (property: AnimatableProperty) => void
}

export interface UseGraphViewStateReturn {
  readonly graphVisibleProperties: Set<AnimatableProperty>
  setGraphVisibleProperties: SetState<Set<AnimatableProperty>>
  readonly graphRulerUnit: 'frames' | 'seconds'
  setGraphRulerUnit: SetState<'frames' | 'seconds'>
  readonly showAllGraphHandles: boolean
  setShowAllGraphHandles: SetState<boolean>
  readonly autoZoomGraphHeight: boolean
  setAutoZoomGraphHeight: SetState<boolean>
  readonly graphVerticalZoomValue: number
  setGraphVerticalZoomValue: SetState<number>
  togglePropertyCurve: (property: AnimatableProperty) => void
  toggleGroupCurves: (properties: AnimatableProperty[]) => void
}

export function useGraphViewState(
  options: () => UseGraphViewStateOptions,
): UseGraphViewStateReturn {
  const itemId = $derived(options().itemId)
  const availableProperties = $derived(options().availableProperties)
  const graphableProperties = $derived(options().graphableProperties)

  let skipNextSave = false
  let prevItemId = untrack(() => itemId)
  let prevGraphable = untrack(() => graphableProperties)

  let graphRulerUnit = $state<'frames' | 'seconds'>('frames')
  let showAllGraphHandles = $state(false)
  let autoZoomGraphHeight = $state(true)
  let graphVerticalZoomValue = $state(0)
  let graphVisibleProperties = $state.raw<Set<AnimatableProperty>>(
    untrack(() =>
      loadGraphVisibleProperties(
        itemId,
        availableProperties,
        options().selectedProperty,
        graphableProperties,
      ),
    ),
  )

  // Keep the visible-curve set in sync as the clip or its keyframed properties
  // change. Selection is read untracked so this only re-runs on clip or
  // available-property changes.
  $effect.pre(() => {
    const id = itemId
    const available = availableProperties
    const graphableList = graphableProperties
    untrack(() => {
      const selectedProperty = options().selectedProperty
      if (prevItemId !== id) {
        // Switched clip: restore that clip's saved curves.
        prevItemId = id
        prevGraphable = graphableList
        skipNextSave = true
        graphVisibleProperties = loadGraphVisibleProperties(
          id,
          available,
          selectedProperty,
          graphableList,
        )
        return
      }

      // Same clip, but its drawable curves changed (e.g. a preset just added
      // keyframes). We key off GRAPHABLE properties (>= 2 keyframes), not merely
      // "available" ones — `keyframesByProperty` carries empty entries for every
      // property, so availability never changes when a preset animates one.
      const previousGraphable = prevGraphable
      prevGraphable = graphableList
      const newlyGraphable = graphableList.filter(
        (property) => !previousGraphable.includes(property),
      )

      const prev = graphVisibleProperties
      const availableSet = new Set(available)
      const graphable = new Set(graphableList)
      const next = new Set([...prev].filter((property) => availableSet.has(property)))
      // Reveal curves that just became drawable (the preset's properties).
      for (const property of newlyGraphable) next.add(property)
      // If no drawable curve is shown but the clip has some, fall back to a
      // default so the graph isn't blank. Toggling a curve off doesn't change
      // `graphableProperties`, so an intentional hide-all is left alone.
      const showsAGraphable = [...next].some((property) => graphable.has(property))
      if (!showsAGraphable && graphableList.length > 0) {
        graphVisibleProperties = getDefaultGraphVisibleProperties(
          available,
          selectedProperty,
          graphableList,
        )
        return
      }
      const unchanged = next.size === prev.size && [...next].every((property) => prev.has(property))
      if (!unchanged) graphVisibleProperties = next
    })
  })

  // Persist visible curves whenever they change (skip the restore-driven update).
  $effect(() => {
    const visible = graphVisibleProperties
    const id = itemId
    if (skipNextSave) {
      skipNextSave = false
      return
    }

    saveGraphVisibleProperties(id, visible)
  })

  // Reset vertical zoom when the clip changes or auto-zoom mode toggles
  $effect.pre(() => {
    void itemId
    void autoZoomGraphHeight
    graphVerticalZoomValue = 0
  })

  const togglePropertyCurve = (property: AnimatableProperty) => {
    const { onPropertyChange, onActivePropertyChange } = options()
    const next = new Set(graphVisibleProperties)
    if (next.has(property)) {
      next.delete(property)
    } else {
      next.add(property)
    }
    // Set primary to this property when toggling on
    if (next.has(property)) {
      onPropertyChange?.(property)
      onActivePropertyChange?.(property)
    } else if (next.size > 0) {
      // Switch primary to first remaining visible
      const first = [...next][0]!
      onPropertyChange?.(first)
      onActivePropertyChange?.(first)
    }
    graphVisibleProperties = next
  }

  const toggleGroupCurves = (properties: AnimatableProperty[]) => {
    if (properties.length === 0) return
    const { onPropertyChange, onActivePropertyChange } = options()
    const prev = graphVisibleProperties
    const anyVisible = properties.some((p) => prev.has(p))
    const next = new Set(prev)
    if (anyVisible) {
      // Turn all off
      for (const p of properties) next.delete(p)
      if (next.size > 0) {
        const first = [...next][0]!
        onPropertyChange?.(first)
        onActivePropertyChange?.(first)
      }
    } else {
      // Turn all on
      for (const p of properties) next.add(p)
      onPropertyChange?.(properties[0]!)
      onActivePropertyChange?.(properties[0]!)
    }
    graphVisibleProperties = next
  }

  return {
    get graphVisibleProperties() {
      return graphVisibleProperties
    },
    setGraphVisibleProperties: (next) => {
      graphVisibleProperties = resolveSetState(next, graphVisibleProperties)
    },
    get graphRulerUnit() {
      return graphRulerUnit
    },
    setGraphRulerUnit: (next) => {
      graphRulerUnit = resolveSetState(next, graphRulerUnit)
    },
    get showAllGraphHandles() {
      return showAllGraphHandles
    },
    setShowAllGraphHandles: (next) => {
      showAllGraphHandles = resolveSetState(next, showAllGraphHandles)
    },
    get autoZoomGraphHeight() {
      return autoZoomGraphHeight
    },
    setAutoZoomGraphHeight: (next) => {
      autoZoomGraphHeight = resolveSetState(next, autoZoomGraphHeight)
    },
    get graphVerticalZoomValue() {
      return graphVerticalZoomValue
    },
    setGraphVerticalZoomValue: (next) => {
      graphVerticalZoomValue = resolveSetState(next, graphVerticalZoomValue)
    },
    togglePropertyCurve,
    toggleGroupCurves,
  }
}
