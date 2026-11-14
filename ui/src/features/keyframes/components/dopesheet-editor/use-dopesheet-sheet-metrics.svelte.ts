// SPDX-License-Identifier: MIT

/**
 * Dopesheet sheet layout metrics.
 * Owns how wide the shared time axis really is: the measured sheet width, the
 * linked main-timeline width when the Edit lane shares its axis, the cell
 * border, the reserved scrollbar gutter and the zoom ratios the toolbar
 * reports for it. The linked main timeline is authoritative whenever it is
 * linked: the Edit lane's own grid is a couple of pixels narrower, so using it
 * would drift the time-to-pixel mapping.
 */

import { getDopesheetDragPixelsPerFrame } from './dopesheet-drag-math'

export interface UseDopesheetSheetMetricsOptions {
  width: number
  columnWidth: number
  timelineWidth: number
  sheetScrollWidth: number
  showSheetPane: boolean
  presentation: 'editor' | 'classic' | 'lanes'
  linkedTimelineViewportWidth: number | undefined
  frameRange: number
  fps: number
  contentFrameMax: number
  minViewportFrames: number
  getTimelineLivePixelsPerSecond: (() => number) | undefined
}

export interface UseDopesheetSheetMetricsReturn {
  readonly horizontalZoomRatioBase: number
  readonly horizontalZoomValue: number
  readonly reservedScrollbarGutterWidth: number
  readonly hasLinkedTimelineAxis: boolean
  readonly timelineCellBorderWidth: number
  readonly effectiveTimelineWidth: number
  readonly timelineEdgeInset: 0 | undefined
  readonly timelinePixelsPerSecond: number
  /** The property/timeline grid columns, as a `style` string. */
  readonly propertyGridStyle: string
  getLiveDragPixelsPerFrame: () => number
}

export function useDopesheetSheetMetrics(
  options: () => UseDopesheetSheetMetricsOptions,
): UseDopesheetSheetMetricsReturn {
  const width = $derived(options().width)
  const columnWidth = $derived(options().columnWidth)
  const timelineWidth = $derived(options().timelineWidth)
  const sheetScrollWidth = $derived(options().sheetScrollWidth)
  const showSheetPane = $derived(options().showSheetPane)
  const presentation = $derived(options().presentation)
  const linkedTimelineViewportWidth = $derived(options().linkedTimelineViewportWidth)
  const frameRange = $derived(options().frameRange)
  const fps = $derived(options().fps)
  const contentFrameMax = $derived(options().contentFrameMax)
  const minViewportFrames = $derived(options().minViewportFrames)

  const horizontalZoomRatioBase = $derived(
    Math.max(1, contentFrameMax / Math.max(1, minViewportFrames)),
  )
  const horizontalZoomValue = $derived.by(() => {
    if (horizontalZoomRatioBase <= 1) {
      return 0
    }

    const normalized =
      Math.log(contentFrameMax / Math.max(1, frameRange)) / Math.log(horizontalZoomRatioBase)
    return Math.max(0, Math.min(100, normalized * 100))
  })
  const fullTimelineWidth = $derived(timelineWidth || Math.max(width - columnWidth, 1))
  const alignedTimelineWidth = $derived.by(() => {
    const sheetTimelineWidth = Math.max(0, sheetScrollWidth - columnWidth)
    return showSheetPane && sheetTimelineWidth > 0
      ? Math.min(fullTimelineWidth, sheetTimelineWidth)
      : fullTimelineWidth
  })
  const reservedScrollbarGutterWidth = $derived(
    Math.max(0, fullTimelineWidth - alignedTimelineWidth),
  )
  // The Edit lane shares the main timeline's axis. Its own grid is a couple of
  // pixels narrower because of a border and scrollbar gutter, so using its
  // measured width introduces a small but persistent time-to-pixel drift. Let
  // the main viewport be authoritative whenever it is linked.
  const hasLinkedTimelineAxis = $derived(
    presentation === 'classic' &&
      linkedTimelineViewportWidth !== undefined &&
      linkedTimelineViewportWidth > 0,
  )
  const timelineCellBorderWidth = $derived(
    presentation === 'classic' ? (hasLinkedTimelineAxis ? 0 : 1) : presentation === 'lanes' ? 1 : 0,
  )
  const effectiveTimelineWidth = $derived(
    Math.max(
      hasLinkedTimelineAxis
        ? linkedTimelineViewportWidth!
        : alignedTimelineWidth - timelineCellBorderWidth,
      1,
    ),
  )
  const timelineEdgeInset = $derived(presentation === 'classic' ? 0 : undefined)
  const timelinePixelsPerSecond = $derived((effectiveTimelineWidth / frameRange) * fps)
  const getLiveDragPixelsPerFrame = () =>
    getDopesheetDragPixelsPerFrame(
      options().getTimelineLivePixelsPerSecond,
      timelinePixelsPerSecond,
      fps,
    )

  const propertyGridStyle = $derived(`grid-template-columns: ${columnWidth}px 1fr`)

  return {
    get horizontalZoomRatioBase() {
      return horizontalZoomRatioBase
    },
    get horizontalZoomValue() {
      return horizontalZoomValue
    },
    get reservedScrollbarGutterWidth() {
      return reservedScrollbarGutterWidth
    },
    get hasLinkedTimelineAxis() {
      return hasLinkedTimelineAxis
    },
    get timelineCellBorderWidth() {
      return timelineCellBorderWidth
    },
    get effectiveTimelineWidth() {
      return effectiveTimelineWidth
    },
    get timelineEdgeInset() {
      return timelineEdgeInset
    },
    get timelinePixelsPerSecond() {
      return timelinePixelsPerSecond
    },
    get propertyGridStyle() {
      return propertyGridStyle
    },
    getLiveDragPixelsPerFrame,
  }
}
