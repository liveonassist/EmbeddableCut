// SPDX-License-Identifier: MIT

/**
 * Timeline (keyframe-grid) cells for the dopesheet.
 *
 * These render the heavy, *frame-independent* part of each row — ticks,
 * keyframe diamonds, transition-blocked regions and drag-preview ghosts. They
 * are split out of the main editor so that moving the playhead (which only
 * changes the property-column controls and the playhead line) does not touch
 * any keyframe button: every prop stays referentially stable across scrubs.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import type { ProceduralBand } from '@/features/keyframes/utils/procedural-preview'
import type { Ref } from '../../ref-state.svelte'
import type { DopesheetPropertyGroupStructure } from '../dopesheet-helpers'
import type { KeyframeMeta } from '../dopesheet-types'
import type { SegmentEasingChange } from '../segment-easing-popover'

export type FrameGroup = DopesheetPropertyGroupStructure['frameGroups'][number]
export type StructureRow = { property: AnimatableProperty; keyframes: Keyframe[] }

type ButtonPointerEvent = PointerEvent & { currentTarget: HTMLButtonElement }
type DivPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

export function getTimelineGridLineStyle(
  ticks: number[],
  frameToX: (frame: number) => number,
): { left: number; boxShadow: string } {
  const positions = ticks.map((frame) => Math.round(frameToX(frame)))
  const left = positions[0] ?? 0
  return {
    left,
    boxShadow: positions
      .slice(1)
      .map((position) => `${position - left}px 0 currentColor`)
      .join(', '),
  }
}

export interface ConnectorSegment {
  key: string
  fromKeyframeId: string
  toKeyframeId: string
  fromFrame: number
  toFrame: number
  left: number
  width: number
  /** True when the value is held across the span (no interpolation). */
  held: boolean
}

/**
 * Build the horizontal segments drawn between consecutive keyframes. A segment
 * communicates that a property is *animating* across that span; a `held`
 * segment (the `from` keyframe uses `hold` easing) is dashed to show the value
 * is parked until the next keyframe.
 */
export function buildConnectorSegments(
  points: Array<{ id: string; frame: number; x: number; held: boolean }>,
): ConnectorSegment[] {
  const sorted = [...points].sort((a, b) => a.frame - b.frame)
  return sorted.flatMap((point, index) => {
    const next = sorted[index + 1]
    if (!next) return []
    const left = Math.min(point.x, next.x)
    const width = Math.abs(next.x - point.x)
    if (width <= 0) return []
    return [
      {
        key: point.id,
        fromKeyframeId: point.id,
        toKeyframeId: next.id,
        fromFrame: point.frame,
        toFrame: next.frame,
        left,
        width,
        held: point.held,
      },
    ]
  })
}

// Hatched fill marks a span as generated/procedural (distinct from solid
// connector lines and diamonds).
export const PROCEDURAL_HATCH =
  'repeating-linear-gradient(45deg, rgba(56,189,248,0.25) 0 2px, transparent 2px 5px)'

export interface GroupTimelineCellProps {
  groupId: string
  groupLabel: string
  expanded: boolean
  /** Stable, frame-independent grouped keyframes. */
  frameGroups: FrameGroup[]
  /** Stable structural rows (used for drag-preview frame remapping). */
  rows: StructureRow[]
  ticks: number[]
  axisWidth: number
  frameToX: (frame: number) => number
  gridFrameToX?: (frame: number) => number
  getRenderedKeyframeX: (frame: number) => number | null
  selectedKeyframeIds: Set<string>
  disabled: boolean
  isPropertyLocked: (property: AnimatableProperty) => boolean
  onGroupKeyframePointerDown: (frameGroup: FrameGroup, event: ButtonPointerEvent) => void
  onBackgroundPointerDown: (event: DivPointerEvent) => void
  sheetPreviewFrames: Record<string, number> | null
  sheetPreviewDuplicateKeyframeIds: string[] | null
}

export interface PropertyTimelineCellProps {
  itemId: string
  property: AnimatableProperty
  /** Stable, frame-independent sorted keyframes for this property. */
  keyframes: Keyframe[]
  locked: boolean
  ticks: number[]
  axisWidth: number
  frameToX: (frame: number) => number
  gridFrameToX?: (frame: number) => number
  getRenderedKeyframeX: (frame: number) => number | null
  renderedKeyframeXById: Map<string, number>
  transitionBlockedRanges: BlockedFrameRange[]
  /** Procedural generator band for this property (when not keyframed). */
  proceduralBand?: ProceduralBand
  selectedKeyframeIds: Set<string>
  disabled: boolean
  onRowPointerDown: (property: AnimatableProperty, event: DivPointerEvent) => void
  onKeyframePointerDown: (
    property: AnimatableProperty,
    keyframeId: string,
    event: ButtonPointerEvent,
  ) => void
  onSegmentEasingChange?: SegmentEasingChange
  onSegmentDragStart?: () => void
  onSegmentDragEnd?: () => void
  setKeyframeButtonRef: (keyframeId: string, node: HTMLButtonElement | null) => void
  keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>>
  sheetPreviewFrames: Record<string, number> | null
  sheetPreviewDuplicateKeyframeIds: string[] | null
}
