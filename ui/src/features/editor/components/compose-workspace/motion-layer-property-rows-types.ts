// SPDX-License-Identifier: MIT

import type { InlineCurveState, StateSetter } from './motion-timeline-primitives'
import type { MotionTimeViewport } from './motion-time-viewport-controller'
import type { AnimatableProperty, DirectLinkableProperty, ItemKeyframes } from '@/types/keyframe'
import type { TextMotionTimelineBand } from '@/shared/timeline/text-motion-timeline'
import type { TimelineItem } from '@/types/timeline'

export interface MotionLayerPropertyRowsProps {
  item: TimelineItem
  expanded: boolean
  isLayerLocked: boolean
  isPathShape: boolean
  showAllPathVertices: boolean
  maskEditingItemId: string | null
  selectedPathVertexIndices: readonly number[]
  setAllPathVertexItemIds: StateSetter<Set<string>>
  textMotionBands: TextMotionTimelineBand[]
  timeViewport: MotionTimeViewport
  itemById: Record<string, TimelineItem>
  itemKeyframes: ItemKeyframes | undefined
  properties: AnimatableProperty[]
  durationInFrames: number
  fps: number
  canvas: { width: number; height: number }
  propertyFilter: 'all' | 'keyframed'
  activeInlineCurve: InlineCurveState | null
  activeCompositionId: string
  selectItems: (itemIds: string[]) => void
  setInlineCurve: StateSetter<InlineCurveState | null>
  pause: () => void
  setScrubFrame: (frame: number) => void
  updateTimeViewport: (viewport: MotionTimeViewport) => void
  beginPropertyLinkDrag: (
    event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement },
    itemId: string,
    property: DirectLinkableProperty,
  ) => void
  handleRemovePropertyLink: (itemId: string, property: DirectLinkableProperty) => void
  handleSetPropertyExpression: (
    itemId: string,
    property: DirectLinkableProperty,
    source: string,
    enabled: boolean,
  ) => void
  handleRemovePropertyExpression: (itemId: string, property: DirectLinkableProperty) => void
}
