// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import {
  getDirectPropertyLinks,
  getPropertyExpressions,
  type ItemKeyframes,
} from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { TransformProperties } from '@/types/transform'
import { useSyncExternalStore } from '../../use-sync-external-store.svelte'

interface LiveItemTransformState {
  itemById: Record<string, TimelineItem>
}

export interface LiveItemTransformSource {
  getState: () => LiveItemTransformState
  subscribe: (listener: () => void) => () => void
}

const LIVE_ITEM_TRANSFORM_KEY = Symbol('embeddablecut.live-item-transform')
const subscribeToNothing = () => () => undefined

/** React's `LiveItemTransformContext.Provider`: `current` is the provider's `source` prop. */
export function setLiveItemTransformContext(source: {
  readonly current: LiveItemTransformSource | null
}): void {
  setContext(LIVE_ITEM_TRANSFORM_KEY, source)
}

function useLiveItemTransformSource(): { readonly current: LiveItemTransformSource | null } {
  return (
    getContext<{ readonly current: LiveItemTransformSource | null } | undefined>(
      LIVE_ITEM_TRANSFORM_KEY,
    ) ?? { current: null }
  )
}

const transformObjectIds = new WeakMap<object, number>()
let nextTransformObjectId = 1

function getTransformObjectId(transform: TransformProperties | undefined): number {
  if (!transform || typeof transform !== 'object') return 0
  const existing = transformObjectIds.get(transform)
  if (existing !== undefined) return existing
  const next = nextTransformObjectId
  nextTransformObjectId += 1
  transformObjectIds.set(transform, next)
  return next
}

function getItemTransform(item: TimelineItem | undefined): TransformProperties | undefined {
  return item && 'transform' in item ? item.transform : undefined
}

type GetItem = (itemId: string) => TimelineItem | undefined
export type GetItemKeyframes = (itemId: string) => ItemKeyframes | undefined
const getNoItemKeyframes: GetItemKeyframes = () => undefined

export interface ItemTransformDependencyPlan {
  /** Every item whose committed transform can affect the target. */
  sourceItemIds: ReadonlySet<string>
  /**
   * Sources whose translate preview can be presented as the same world-space
   * DOM delta without re-resolving the target.
   */
  linearTranslateSourceItemIds: ReadonlySet<string>
  /**
   * Expressions may reference any item through prop("id", "property"). Until
   * expression references are indexed, treat them as a conservative wildcard.
   */
  hasExpressionDependencies: boolean
}

function getEnabledPositionLink(itemId: string, getKeyframes: GetItemKeyframes) {
  return getDirectPropertyLinks(getKeyframes(itemId)).find(
    (link) =>
      link.enabled &&
      link.timeOffsetFrames === 0 &&
      link.targetProperty === 'position' &&
      link.sourceProperty === 'position',
  )
}

/**
 * Build the cross-item transform dependency graph for one rendered item.
 *
 * Canonical invalidation follows every parent and direct-link edge
 * transitively. The imperative translate subset is deliberately stricter:
 * transform ancestors are always world-linear, while Position links are only
 * world-linear when every link source shares the target's immediate parent
 * basis (including the common root/null basis).
 */
export function buildItemTransformDependencyPlan(
  item: TimelineItem,
  getItem: GetItem,
  getKeyframes: GetItemKeyframes,
): ItemTransformDependencyPlan {
  const sourceItemIds = new Set<string>()
  const pending: TimelineItem[] = [item]
  const inspected = new Set<string>()
  let hasExpressionDependencies = false

  while (pending.length > 0) {
    const candidate = pending.pop()!
    if (inspected.has(candidate.id)) continue
    inspected.add(candidate.id)

    const keyframes = getKeyframes(candidate.id)
    if (getPropertyExpressions(keyframes).some((expression) => expression.enabled)) {
      hasExpressionDependencies = true
    }

    const dependencyIds = [
      candidate.transformParent?.parentItemId,
      ...getDirectPropertyLinks(keyframes)
        .filter((link) => link.enabled)
        .map((link) => link.sourceItemId),
    ]
    for (const dependencyId of dependencyIds) {
      if (!dependencyId || dependencyId === item.id) continue
      sourceItemIds.add(dependencyId)
      const dependency = getItem(dependencyId)
      if (dependency) pending.push(dependency)
    }
  }

  const linearTranslateSourceItemIds = new Set<string>()

  // Translating any transform ancestor applies the same world-space delta to
  // every descendant, regardless of the descendant's local transform.
  let parentId = item.transformParent?.parentItemId
  const visitedParents = new Set<string>()
  while (parentId && !visitedParents.has(parentId)) {
    visitedParents.add(parentId)
    linearTranslateSourceItemIds.add(parentId)
    parentId = getItem(parentId)?.transformParent?.parentItemId
  }

  // A Position link copies local coordinates. Its source can use the fast
  // world-delta bridge only when target and source share that local basis.
  const targetParentBasis = item.transformParent?.parentItemId
  let linkedTarget = item
  const visitedPositionLinks = new Set<string>()
  while (!visitedPositionLinks.has(linkedTarget.id)) {
    visitedPositionLinks.add(linkedTarget.id)
    const link = getEnabledPositionLink(linkedTarget.id, getKeyframes)
    if (!link) break
    const source = getItem(link.sourceItemId)
    if (!source || source.transformParent?.parentItemId !== targetParentBasis) break
    linearTranslateSourceItemIds.add(source.id)
    linkedTarget = source
  }

  // An arbitrary expression can also consume the active source. Without a
  // parsed property-level dependency index, no raw-delta route is provably
  // equivalent to re-evaluating it.
  if (hasExpressionDependencies) {
    linearTranslateSourceItemIds.clear()
  }

  return {
    sourceItemIds,
    linearTranslateSourceItemIds,
    hasExpressionDependencies,
  }
}

/**
 * Merge only the live transform onto a runtime-enriched item.
 *
 * The fallback may contain resolved media URLs, track visibility/audio fields,
 * or StableVideoSequence metadata that does not exist in the editor item
 * store, so replacing the complete object would be unsafe.
 */
export function useLiveItemTransform<TItem extends TimelineItem>(
  fallback: () => TItem,
): { readonly current: TItem } {
  const source = useLiveItemTransformSource()
  const liveTransform = useSyncExternalStore(
    () => source.current?.subscribe ?? subscribeToNothing,
    () => {
      const item = fallback()
      return (
        getItemTransform(source.current?.getState().itemById[item.id]) ?? getItemTransform(item)
      )
    },
  )

  const merged = $derived.by(() => {
    const item = fallback()
    const transform = liveTransform.current
    if (!transform || !('transform' in item) || Object.is(transform, item.transform)) {
      return item
    }
    return { ...item, transform } as TItem
  })
  return {
    get current() {
      return merged
    },
  }
}

function canRetainContentTransform(
  previous: TransformProperties | undefined,
  next: TransformProperties | undefined,
): boolean {
  if (Object.is(previous, next)) return true
  if (!previous || !next) return false

  const previousRecord = previous as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>
  const previousKeys = Object.keys(previousRecord)
  const nextKeys = Object.keys(nextRecord)
  if (previousKeys.length !== nextKeys.length) return false

  for (const key of previousKeys) {
    if (!(key in nextRecord)) return false
    if (key !== 'x' && key !== 'y' && !Object.is(previousRecord[key], nextRecord[key])) {
      return false
    }
  }

  return true
}

function createContentTransformBridge({
  source,
  itemId,
  fallbackTransform,
}: {
  source: LiveItemTransformSource | null
  itemId: string
  fallbackTransform: TransformProperties | undefined
}): {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => TransformProperties | undefined
} {
  const readTransform = () =>
    getItemTransform(source?.getState().itemById[itemId]) ?? fallbackTransform
  let observedTransform = readTransform()
  let renderedTransform = observedTransform
  const listeners = new Set<() => void>()
  let unsubscribeSource: (() => void) | null = null

  const handleSourceChange = () => {
    const nextTransform = readTransform()
    if (Object.is(observedTransform, nextTransform)) return

    const previousTransform = observedTransform
    observedTransform = nextTransform
    if (canRetainContentTransform(previousTransform, nextTransform)) return

    renderedTransform = nextTransform
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => renderedTransform,
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1 && source) {
        unsubscribeSource = source.subscribe(handleSourceChange)
        handleSourceChange()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        unsubscribeSource?.()
        unsubscribeSource = null
      }
    },
  }
}

/**
 * Keeps content components idle for position-only commits.
 *
 * Position is rendered by ItemVisualWrapper, which has its own full live
 * transform subscription. Content still refreshes immediately for size,
 * rotation, opacity, transform flags, and every non-transform item edit
 * delivered through the regular composition snapshot.
 */
export function useLiveItemContentTransform<TItem extends TimelineItem>(
  fallback: () => TItem,
): { readonly current: TItem } {
  const source = useLiveItemTransformSource()
  const itemId = $derived(fallback().id)
  const fallbackTransform = $derived(getItemTransform(fallback()))
  const bridge = $derived(
    createContentTransformBridge({
      source: source.current,
      itemId,
      fallbackTransform,
    }),
  )
  const contentTransform = useSyncExternalStore(
    () => bridge.subscribe,
    () => bridge.getSnapshot(),
  )

  const merged = $derived.by(() => {
    const item = fallback()
    const transform = contentTransform.current
    if (!transform || !('transform' in item) || Object.is(transform, item.transform)) {
      return item
    }
    return { ...item, transform } as TItem
  })
  return {
    get current() {
      return merged
    },
  }
}

/**
 * Returns a stable resolver for hierarchy/expression reads. Store items are
 * safe here because transform resolution only consumes item geometry and
 * relationship fields; rendered content continues to use enriched props.
 */
export function useLiveTimelineItemResolver(): (itemId: string) => TimelineItem | undefined {
  const source = useLiveItemTransformSource()
  return (itemId: string) => source.current?.getState().itemById[itemId]
}

function collectTransformDependencySignature(
  source: LiveItemTransformSource | null,
  fallbackItems: readonly TimelineItem[],
  getKeyframes: GetItemKeyframes,
): string {
  if (!source) return ''
  const itemById = source.getState().itemById
  const getItem = (itemId: string) => itemById[itemId]
  const dependencyIds = new Set<string>()
  let hasExpressionDependencies = false

  for (const fallbackItem of fallbackItems) {
    const plan = buildItemTransformDependencyPlan(fallbackItem, getItem, getKeyframes)
    for (const dependencyId of plan.sourceItemIds) {
      dependencyIds.add(dependencyId)
    }
    hasExpressionDependencies ||= plan.hasExpressionDependencies
  }

  // Expressions can reference any layer by ID. Conservatively subscribing to
  // every live transform is still far cheaper than waking the whole stable
  // composition tree, and expression-bearing items are uncommon.
  if (hasExpressionDependencies) {
    for (const itemId of Object.keys(itemById)) dependencyIds.add(itemId)
  }

  return [...dependencyIds]
    .sort()
    .map((itemId) => `${itemId}:${getTransformObjectId(getItemTransform(itemById[itemId]))}`)
    .join('|')
}

/**
 * Re-runs a visual only when one of its transitive transform dependencies
 * changes. Read the returned signature in the transform derivation; unrelated
 * item commits keep it unchanged.
 */
export function useLiveTransformDependencySignature(
  item: () => TimelineItem,
  getKeyframes?: () => GetItemKeyframes | undefined,
): { readonly current: string } {
  const source = useLiveItemTransformSource()
  return useSyncExternalStore(
    () => source.current?.subscribe ?? subscribeToNothing,
    () =>
      collectTransformDependencySignature(
        source.current,
        [item()],
        getKeyframes?.() ?? getNoItemKeyframes,
      ),
  )
}

/**
 * Aggregate variant for composition-wide consumers such as the active mask
 * plan. It avoids one external-store subscription per mask.
 */
export function useLiveTransformDependencySignatureForItems(
  items: () => readonly TimelineItem[],
  getKeyframes?: () => GetItemKeyframes | undefined,
): { readonly current: string } {
  const source = useLiveItemTransformSource()
  return useSyncExternalStore(
    () => source.current?.subscribe ?? subscribeToNothing,
    () =>
      collectTransformDependencySignature(
        source.current,
        items(),
        getKeyframes?.() ?? getNoItemKeyframes,
      ),
  )
}
