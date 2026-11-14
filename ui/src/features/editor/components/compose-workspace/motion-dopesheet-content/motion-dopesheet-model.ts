// SPDX-License-Identifier: MIT

// The embedded dopesheet's row/property model: what the lanes shell estimates
// and the content tree derives, without any component state.

import type { MotionDopesheetLanesProps } from '../motion-dopesheet-lanes-equality'
import { MOTION_INLINE_PROPERTY_GROUP_IDS } from '../motion-timeline-primitives'
import { MOTION_VECTOR_ROW_DEFINITIONS, shouldUseMotionVectorRow } from '../motion-vector-rows'
import {
  resolveItemTransformAtFrame,
  type resolveTransform,
} from '@/features/editor/deps/composition-runtime'
import { getAnimatablePropertyBaseValue } from '@/features/editor/deps/keyframes'
import {
  findStoredVectorKeyframe,
  getStoredVectorKeyframeId,
  getVectorPropertyProxy,
  toVectorScalePercent,
} from '@/features/editor/deps/keyframes-contract'
import { useGizmoStore } from '@/features/editor/deps/preview'
import {
  GROUP_HEADER_HEIGHT,
  ROW_HEIGHT,
  getProceduralBands,
  getPropertyDisplayGroups,
  getShapeAnimatableBaseValue,
  interpolatePropertyValue,
  resolveAnimatedShapeItem,
} from '@/features/editor/deps/timeline-motion'
import { worldToLocalTransform } from '@/shared/utils/transform-parenting'
import {
  type AnimatableProperty,
  type DirectLinkableProperty,
  type ItemKeyframes,
  type Keyframe,
  type KeyframeRef,
  type VectorAnimatableProperty,
  type VectorKeyframe,
  getDirectPropertyLinks,
  isShapeAnimatableProperty,
  isTransformAnimatableProperty,
} from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { ResolvedTransform } from '@/types/transform'

type ButtonPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }

export const POSITION_VECTOR_ROW = MOTION_VECTOR_ROW_DEFINITIONS.find(
  (row) => row.property === 'position',
)!

export const MAX_DIMENSION_BAKE_FRAMES = 10_000

export const MOTION_GRAPH_INLINE_PROPERTY_GROUP_IDS = [
  'transform',
  ...MOTION_INLINE_PROPERTY_GROUP_IDS,
] as const

export const MOTION_INLINE_PROPERTY_GROUP_ID_SET: ReadonlySet<string> = new Set(
  MOTION_INLINE_PROPERTY_GROUP_IDS,
)

export function getEstimatedMotionDopesheetLaneHeight({
  item,
  itemKeyframes,
  properties,
  propertyFilter,
  expandedGroups,
}: Pick<MotionDopesheetLanesProps, 'item' | 'itemKeyframes' | 'properties' | 'propertyFilter'> & {
  expandedGroups?: Readonly<Record<string, boolean>>
}): number {
  const supportsVectorTransform = item.type !== 'audio' && item.type !== 'adjustment'
  const hiddenPropertyRows = new Set<AnimatableProperty>(
    supportsVectorTransform
      ? MOTION_VECTOR_ROW_DEFINITIONS.filter(
          (row) =>
            properties.includes(row.primary) &&
            properties.includes(row.secondary) &&
            shouldUseMotionVectorRow(itemKeyframes, row),
        ).map((row) => row.secondary)
      : [],
  )
  const scalarKeyframesByProperty = new Map(
    (itemKeyframes?.properties ?? []).map((entry) => [entry.property, entry.keyframes] as const),
  )
  const keyframesByProperty = Object.fromEntries(
    properties.map((property) => [property, scalarKeyframesByProperty.get(property) ?? []]),
  ) as Partial<Record<AnimatableProperty, Keyframe[]>>
  const proceduralPropertyIds = new Set(
    getProceduralBands(item.motionModifiers, item.durationInFrames, item.from).keys(),
  )
  const visibleProperties =
    propertyFilter === 'keyframed'
      ? properties.filter((property) =>
          isMotionPropertyVisible(
            property,
            keyframesByProperty,
            itemKeyframes,
            proceduralPropertyIds,
          ),
        )
      : properties
  const renderedVisibleProperties = visibleProperties.filter(
    (property) => !hiddenPropertyRows.has(property),
  )
  if (propertyFilter === 'keyframed' && renderedVisibleProperties.length === 0) return ROW_HEIGHT
  const displayGroups = getPropertyDisplayGroups(renderedVisibleProperties)
  const nonInlineGroups = displayGroups.filter(
    (group) => !MOTION_INLINE_PROPERTY_GROUP_ID_SET.has(group.id),
  )
  const visiblePropertyCount = displayGroups.reduce(
    (count, group) =>
      MOTION_INLINE_PROPERTY_GROUP_ID_SET.has(group.id) || expandedGroups?.[group.id] !== false
        ? count + group.properties.length
        : count,
    0,
  )
  return Math.max(
    ROW_HEIGHT,
    visiblePropertyCount * ROW_HEIGHT + nonInlineGroups.length * GROUP_HEADER_HEIGHT,
  )
}

export function getMotionDopesheetLaneHeight(
  paneMode: 'lanes' | 'graph',
  laneContentHeight: number,
): number | undefined {
  return paneMode === 'lanes' ? Math.max(ROW_HEIGHT, laneContentHeight) : undefined
}

export function withoutPropertyExpressions(itemKeyframes: ItemKeyframes | undefined) {
  if (!itemKeyframes) return undefined
  return {
    ...itemKeyframes,
    propertyLinks: [...getDirectPropertyLinks(itemKeyframes)],
    expressions: [],
  }
}

export function getMotionVectorValue(
  property: VectorAnimatableProperty,
  transform: ReturnType<typeof resolveTransform>,
  baseTransform: ReturnType<typeof resolveTransform>,
): { x: number; y: number } {
  if (property === 'position') return { x: transform.x, y: transform.y }
  if (property === 'scale') {
    return {
      x: toVectorScalePercent(transform.width, baseTransform.width),
      y: toVectorScalePercent(transform.height, baseTransform.height),
    }
  }
  return { x: transform.anchorX, y: transform.anchorY }
}

export type GizmoPositionPreview = { x: number; y: number } | null

export interface MotionPositionValueSource {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => GizmoPositionPreview
}

export interface MotionScaleValueSource {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { x: number; y: number } | null
  setSnapshot: (value: { x: number; y: number }) => void
  clear: () => void
}

export function createMotionScaleValueSource(): MotionScaleValueSource {
  const listeners = new Set<() => void>()
  let snapshot: { x: number; y: number } | null = null
  const emit = () => {
    for (const listener of listeners) listener()
  }
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    setSnapshot: (value: { x: number; y: number }) => {
      if (snapshot?.x === value.x && snapshot.y === value.y) return
      snapshot = value
      emit()
    },
    clear: () => {
      if (snapshot === null) return
      snapshot = null
      emit()
    },
  }
}

export interface MotionPositionValueContext {
  item: TimelineItem
  resolvedTransform: ResolvedTransform | null
  committedValue: { x: number; y: number } | null
  itemById: Record<string, TimelineItem>
  allKeyframesByItemId: Record<string, ItemKeyframes>
  canvas: { width: number; height: number }
  fps: number
  currentFrame: number
}

function areMotionPositionsEqual(
  previous: GizmoPositionPreview,
  next: GizmoPositionPreview,
): boolean {
  return (
    previous === next ||
    (previous !== null && next !== null && previous.x === next.x && previous.y === next.y)
  )
}

export function createMotionPositionValueSource(
  getContext: () => MotionPositionValueContext,
): MotionPositionValueSource {
  const listeners = new Set<() => void>()
  let unsubscribeFromGizmo: (() => void) | null = null
  let animationFrameId: number | null = null
  let cachedSnapshot: GizmoPositionPreview = null
  let emittedSnapshot: GizmoPositionPreview = null
  let acknowledgedHandoffId: number | null = null

  const cacheSnapshot = (next: GizmoPositionPreview): GizmoPositionPreview => {
    if (areMotionPositionsEqual(cachedSnapshot, next)) return cachedSnapshot
    cachedSnapshot = next
    return cachedSnapshot
  }

  const getSnapshot = (): GizmoPositionPreview => {
    const context = getContext()
    const gizmoState = useGizmoStore.getState()
    const active =
      gizmoState.activeGizmo?.itemId === context.item.id && gizmoState.previewTransform
        ? {
            interactionId: gizmoState.activeGizmo.interactionId,
            transform: gizmoState.previewTransform,
          }
        : null
    const handoff =
      !active && gizmoState.presentationHandoff?.itemId === context.item.id
        ? gizmoState.presentationHandoff
        : null

    if (!active && (!handoff || acknowledgedHandoffId === handoff.interactionId)) {
      return cacheSnapshot(null)
    }
    if (!context.resolvedTransform) return cacheSnapshot(null)
    if (active) acknowledgedHandoffId = null

    const target = active?.transform ?? handoff!.finalTransform
    const previewWorldTransform = {
      ...context.resolvedTransform,
      x: target.x,
      y: target.y,
    }
    const parentId = context.item.transformParent?.parentItemId
    const parent = parentId ? context.itemById[parentId] : undefined
    const parentWorldTransform = parent
      ? resolveItemTransformAtFrame(parent, {
          canvas: { ...context.canvas, fps: context.fps },
          frame: context.currentFrame,
          keyframes: context.allKeyframesByItemId[parent.id],
          getItem: (candidateId) => context.itemById[candidateId],
          getKeyframes: (candidateId) => context.allKeyframesByItemId[candidateId],
        })
      : undefined
    const local = worldToLocalTransform(
      previewWorldTransform,
      context.item.transformParent,
      parentWorldTransform,
    )

    if (
      handoff &&
      context.committedValue &&
      Math.abs(local.x - context.committedValue.x) < 0.001 &&
      Math.abs(local.y - context.committedValue.y) < 0.001
    ) {
      acknowledgedHandoffId = handoff.interactionId
      return cacheSnapshot(null)
    }

    return cacheSnapshot({ x: local.x, y: local.y })
  }

  const flush = () => {
    animationFrameId = null
    const next = getSnapshot()
    if (next === emittedSnapshot) return
    emittedSnapshot = next
    for (const listener of listeners) listener()
  }

  const schedule = () => {
    if (animationFrameId !== null) return
    animationFrameId = requestAnimationFrame(flush)
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        emittedSnapshot = getSnapshot()
        unsubscribeFromGizmo = useGizmoStore.subscribe(schedule)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        unsubscribeFromGizmo?.()
        unsubscribeFromGizmo = null
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    },
    getSnapshot,
  }
}

export interface ResolvedMotionVectorReference {
  reference: KeyframeRef
  proxy: { property: VectorAnimatableProperty; axis: 'x' | 'y' }
  keyframe: VectorKeyframe
}

export function resolveMotionVectorReference(
  itemKeyframes: ItemKeyframes | undefined,
  reference: KeyframeRef,
): ResolvedMotionVectorReference | null {
  const proxy = getVectorPropertyProxy(reference.property)
  if (!proxy) return null
  const keyframe = findStoredVectorKeyframe(
    itemKeyframes,
    proxy.property,
    getStoredVectorKeyframeId(reference.keyframeId, proxy.axis),
  )
  return keyframe ? { reference, proxy, keyframe } : null
}

export function partitionMotionVectorReferences(
  itemKeyframes: ItemKeyframes | undefined,
  references: readonly KeyframeRef[],
): { scalar: KeyframeRef[]; vector: ResolvedMotionVectorReference[] } {
  const scalar: KeyframeRef[] = []
  const vector: ResolvedMotionVectorReference[] = []
  const seenVectorKeys = new Set<string>()
  for (const reference of references) {
    const resolved = resolveMotionVectorReference(itemKeyframes, reference)
    if (!resolved) {
      scalar.push(reference)
      continue
    }
    const vectorKey = `${resolved.proxy.property}:${resolved.keyframe.id}`
    if (seenVectorKeys.has(vectorKey)) continue
    seenVectorKeys.add(vectorKey)
    vector.push(resolved)
  }
  return { scalar, vector }
}

export function getSelectedMotionVectorKeyframes(
  itemKeyframes: ItemKeyframes | undefined,
  selectedKeyframes: readonly KeyframeRef[],
  itemId: string,
  property: VectorAnimatableProperty,
): VectorKeyframe[] {
  return partitionMotionVectorReferences(
    itemKeyframes,
    selectedKeyframes.filter((reference) => reference.itemId === itemId),
  ).vector.flatMap((entry) => (entry.proxy.property === property ? [entry.keyframe] : []))
}

export function buildMotionPropertyValues(params: {
  item: TimelineItem
  itemKeyframes: ItemKeyframes | undefined
  properties: AnimatableProperty[]
  canvas: { width: number; height: number }
  fps: number
  currentFrame: number
  relativeFrame: number
  itemById: Record<string, TimelineItem>
  allKeyframesByItemId: Record<string, ItemKeyframes>
  originalKeyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  selectedKeyframeValueByProperty: Partial<Record<AnimatableProperty, number>>
}): Partial<Record<AnimatableProperty, number>> {
  const resolvedTransform = resolveItemTransformAtFrame(params.item, {
    canvas: { ...params.canvas, fps: params.fps },
    frame: params.currentFrame,
    keyframes: params.itemKeyframes,
    getItem: (itemId) => params.itemById[itemId],
    getKeyframes: (itemId) => params.allKeyframesByItemId[itemId],
  })
  const resolvedShape =
    params.item.type === 'shape'
      ? resolveAnimatedShapeItem(params.item, params.itemKeyframes, params.relativeFrame, {
          globalFrame: params.currentFrame,
          canvas: { ...params.canvas, fps: params.fps },
          getItem: (itemId) => params.itemById[itemId],
          getKeyframes: (itemId) => params.allKeyframesByItemId[itemId],
        })
      : null
  return Object.fromEntries(
    params.properties.map((property) => {
      const selectedValue = params.selectedKeyframeValueByProperty[property]
      const value = isTransformAnimatableProperty(property)
        ? resolvedTransform[property]
        : resolvedShape && isShapeAnimatableProperty(property)
          ? getShapeAnimatableBaseValue(resolvedShape, property)
          : interpolatePropertyValue(
              params.originalKeyframesByProperty[property] ?? [],
              params.relativeFrame,
              getAnimatablePropertyBaseValue(params.item, property, {
                ...params.canvas,
                fps: params.fps,
              }),
            )
      return [property, selectedValue ?? value]
    }),
  )
}

export function buildPropertyLinkSourceLabels(
  itemKeyframes: ItemKeyframes | undefined,
  itemById: Record<string, TimelineItem>,
): Partial<Record<DirectLinkableProperty, string>> {
  return Object.fromEntries(
    getDirectPropertyLinks(itemKeyframes).map((link) => {
      const sourceItem = itemById[link.sourceItemId]
      const sourceLabel = sourceItem?.label || sourceItem?.type || link.sourceItemId
      return [link.targetProperty, `${sourceLabel} -> ${link.sourceProperty}`]
    }),
  )
}

export function isMotionPropertyVisible(
  property: AnimatableProperty,
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>,
  itemKeyframes: ItemKeyframes | undefined,
  proceduralPropertyIds: ReadonlySet<AnimatableProperty>,
): boolean {
  const hasKeys = (keyframesByProperty[property]?.length ?? 0) > 0
  const vectorProperty = getVectorPropertyProxy(property)?.property
  const hasLink = getDirectPropertyLinks(itemKeyframes).some(
    (link) => link.targetProperty === property || link.targetProperty === vectorProperty,
  )
  const hasExpression = itemKeyframes?.expressions?.some(
    (expression) =>
      expression.type === 'expression' &&
      (expression.targetProperty === property || expression.targetProperty === vectorProperty),
  )
  return hasKeys || !!hasLink || !!hasExpression || proceduralPropertyIds.has(property)
}

export function buildPropertyLinkHandlers(params: {
  itemId: string
  paneMode: MotionDopesheetLanesProps['paneMode']
  onPointerDown: MotionDopesheetLanesProps['onPropertyLinkPointerDown']
  onRemove: MotionDopesheetLanesProps['onRemovePropertyLink']
}): {
  onPointerDown?: (event: ButtonPointerEvent, property: DirectLinkableProperty) => void
  onRemove?: (property: DirectLinkableProperty) => void
} {
  const onPointerDown = params.onPointerDown
    ? (event: ButtonPointerEvent, property: DirectLinkableProperty) =>
        params.onPointerDown?.(event, params.itemId, property)
    : undefined
  const onRemove = params.onRemove
    ? (property: DirectLinkableProperty) => params.onRemove?.(params.itemId, property)
    : undefined
  return { onPointerDown, onRemove }
}
