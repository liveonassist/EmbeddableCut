// SPDX-License-Identifier: MIT

/**
 * Sheet row assembly.
 * FreeCut's hook built the React nodes the sheet body and the property column
 * reuse. Here they are two components fed the same options:
 * `dopesheet-sheet-rows.svelte` renders what React returned as `rowElements`
 * and `dopesheet-property-column.svelte` what it returned as
 * `propertyColumnElements`. The row controls depend only on the row content
 * and group header bundles, never on the time viewport, so a pan/zoom only
 * re-runs the timeline cells' geometry.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { TextMotionTimelineBand } from '@/shared/timeline/text-motion-timeline'
import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import type { getProceduralBands } from '@/features/keyframes/utils/procedural-preview'
import type { Ref } from '../ref-state.svelte'
import type { buildGroupedPropertyStructure } from './dopesheet-helpers'
import type {
  DopesheetGroupHeaderProps,
  DopesheetPropertyRowContentProps,
} from './dopesheet-row-renderers'
import type { DopesheetPropertyGroup, KeyframeMeta, RenderedSheetEntry } from './dopesheet-types'
import type { SegmentEasingChange } from './segment-easing-popover'
import type { UseSheetPreviewDomReturn } from './sheet-preview-dom'
import type { TextMotionTimelineRowsProps } from './text-motion-timeline-rows'
import type { KeyframeDrag } from './use-keyframe-drag.svelte'

/** Frame-independent group entry the timeline cells remap previews from. */
export type GroupStructureEntry = ReturnType<typeof buildGroupedPropertyStructure>[number]

/** Band-row handlers the classic presentation forwards to the text-motion rows. */
export type TextMotionBandHandlers = Pick<
  TextMotionTimelineRowsProps,
  | 'onDurationDragStart'
  | 'onDurationCommit'
  | 'onDurationCancel'
  | 'onOffsetDragStart'
  | 'onOffsetCommit'
  | 'onOffsetCancel'
  | 'onBandClick'
>

type DivPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

// Stable empty fallbacks so timeline cells don't see fresh `[]` refs.
export const EMPTY_KEYFRAMES: Keyframe[] = []
export const EMPTY_STRUCTURE_ROWS: GroupStructureEntry['rows'] = []
export const EMPTY_FRAME_GROUPS: GroupStructureEntry['frameGroups'] = []

export interface UseDopesheetSheetRowsOptions {
  /** Row content props shared by the sheet rows and the property column. */
  rowContentProps: Omit<DopesheetPropertyRowContentProps, 'row' | 'options'>
  /** Group header props shared by the sheet rows and the property column. */
  groupHeaderProps: Omit<DopesheetGroupHeaderProps, 'group'>
  /** Rendered sheet entries (groups and rows) with their vertical offsets. */
  renderedSheetEntries: { entries: RenderedSheetEntry[]; contentHeight: number }
  /** Stable, frame-independent group structure keyed by group id. */
  groupTimelineById: Map<string, GroupStructureEntry>
  groupedPropertyRows: DopesheetPropertyGroup[]
  expandedGroups: Record<string, boolean>
  inlinePropertyGroupIdSet: Set<string>
  rowKeyframesByProperty: Map<AnimatableProperty, Keyframe[]>
  renderedKeyframeXById: Map<string, number>
  proceduralBandByProperty: ReturnType<typeof getProceduralBands>
  selectedKeyframeIds: Set<string>
  transitionBlockedRanges: BlockedFrameRange[]
  ticks: number[]
  frameToX: (frame: number) => number
  sharedGridFrameToX: (frame: number) => number
  getRenderedKeyframeX: (frame: number) => number | null
  effectiveTimelineWidth: number
  timelineGridDivisions?: number
  /** Inline style for the property/timeline grid (`grid-template-columns: …`). */
  propertyGridStyle: string
  presentation: 'editor' | 'classic' | 'lanes'
  disabled: boolean
  isPropertyLocked: (property: AnimatableProperty) => boolean
  itemId: string
  textMotionBands: readonly TextMotionTimelineBand[]
  getLiveDragPixelsPerFrame: () => number
  sheetPreviewFrames: Record<string, number> | null
  sheetPreviewDuplicateKeyframeIds: string[] | null
  keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>>
  setKeyframeButtonRef: UseSheetPreviewDomReturn['setKeyframeButtonRef']
  handleRowPointerDown: (property: AnimatableProperty, event: DivPointerEvent) => void
  handleTimelineBackgroundPointerDown: (event: DivPointerEvent) => void
  handleKeyframePointerDown: KeyframeDrag['handleKeyframePointerDown']
  handleGroupKeyframePointerDown: KeyframeDrag['handleGroupKeyframePointerDown']
  onSegmentEasingChange?: SegmentEasingChange
  onDragStart?: () => void
  onDragEnd?: () => void
  /** Edit text-motion band handlers, forwarded straight to the band rows. */
  textMotionHandlers: TextMotionBandHandlers
}

/** The props `dopesheet-property-column.svelte` reads. */
export type DopesheetPropertyColumnProps = Pick<
  UseDopesheetSheetRowsOptions,
  | 'rowContentProps'
  | 'groupHeaderProps'
  | 'groupedPropertyRows'
  | 'expandedGroups'
  | 'inlinePropertyGroupIdSet'
>

/** One sheet row's grid style: the property grid plus its fixed height (and lane culling). */
export function getSheetRowStyle(
  propertyGridStyle: string,
  height: number,
  presentation: UseDopesheetSheetRowsOptions['presentation'],
): string {
  const lanes =
    presentation === 'lanes'
      ? `;content-visibility:auto;contain-intrinsic-size:auto ${height}px`
      : ''
  const grid = propertyGridStyle.trim().replace(/;$/, '')
  return `${grid ? `${grid};` : ''}height:${height}px${lanes}`
}
