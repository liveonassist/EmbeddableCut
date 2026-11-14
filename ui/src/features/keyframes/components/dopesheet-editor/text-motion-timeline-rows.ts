// SPDX-License-Identifier: MIT

import type { TextMotionTimelineBand } from '@/shared/timeline/text-motion-timeline'
import type { TextMotionSlot } from '@/types/text-motion'

export interface TextMotionTimelineRowsProps {
  bands: readonly TextMotionTimelineBand[]
  /** Inline style for each row's grid (the React prop was a style object). */
  gridStyle: string
  ticks: readonly number[]
  axisWidth: number
  frameToX: (frame: number) => number
  getPixelsPerFrame: () => number
  disabled: boolean
  onBackgroundPointerDown: (event: PointerEvent & { currentTarget: HTMLDivElement }) => void
  onDurationDragStart?: () => void
  onDurationCommit?: (slot: TextMotionSlot, durationFrames: number) => void
  onDurationCancel?: () => void
  onOffsetDragStart?: () => void
  onOffsetCommit?: (slot: TextMotionSlot, offsetFrames: number) => void
  onOffsetCancel?: () => void
  onBandClick?: (slot: TextMotionSlot) => void
}
