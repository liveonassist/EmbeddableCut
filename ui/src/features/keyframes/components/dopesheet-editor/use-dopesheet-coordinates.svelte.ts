// SPDX-License-Identifier: MIT

/**
 * Dopesheet sheet coordinates.
 * Owns the frame→pixel mappers, the rendered-sheet position pass, the ruler
 * ticks and the client→sheet converters. These callback identities gate the
 * timeline cells and the rows, so each one is rebuilt only when the inputs it
 * had in FreeCut's dependency array change: a viewport change must move it, an
 * unrelated change must not. The lane content-height report deliberately stays
 * in the editor.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import type { Ref } from '../ref-state.svelte'
import { getFrameAxisX, getFrameFromAxisX, getVisibleKeyframeX } from './layout'
import {
  buildDopesheetTicks,
  buildMarqueeKeyframePoints,
  buildRenderedKeyframeXById,
  buildRenderedSheetEntries,
  type RenderedSheetEntries,
} from './dopesheet-sheet-geometry'
import type { DopesheetPropertyGroup, Viewport } from './dopesheet-types'
import { clampFrame } from './frame-utils'

export interface UseDopesheetCoordinatesOptions {
  viewport: Viewport
  effectiveTimelineWidth: number
  timelineEdgeInset: 0 | undefined
  timelineCellBorderWidth: number
  timelineGridDivisions: number | undefined
  timelineScrollContainerRef: Ref<HTMLElement | null> | undefined
  sheetRowsStructure: readonly { property: AnimatableProperty; keyframes: Keyframe[] }[]
  groupedSheetRows: readonly DopesheetPropertyGroup[]
  presentation: 'editor' | 'classic' | 'lanes'
  textMotionBandCount: number
  inlinePropertyGroupIdSet: Set<string>
  expandedGroups: Record<string, boolean>
  isPropertyLocked: (property: AnimatableProperty) => boolean
  affectedFrameRange: { fromFrame: number; toFrame: number } | undefined
  timelineRef: Ref<HTMLDivElement | null>
  scrollAreaRef: Ref<HTMLDivElement | null>
  currentFrame: number
  scrubClampToItemBounds: boolean
  scrubFrameBounds: { minFrame: number; maxFrame: number } | undefined
  totalFrames: number
  frameRange: number
}

export interface UseDopesheetCoordinatesReturn {
  readonly frameToX: (frame: number) => number
  readonly affectedFrameRangeGeometry: { left: number; width: number } | null
  readonly sharedGridFrameToX: (frame: number) => number
  readonly getRenderedKeyframeX: (frame: number) => number | null
  readonly renderedKeyframeXById: Map<string, number>
  readonly renderedSheetEntries: RenderedSheetEntries
  readonly getKeyframePoints: () => Array<{ keyframeId: string; x: number; y: number }>
  readonly getFrameFromClientX: (clientX: number) => number
  readonly getTimelineXFromClientX: (clientX: number) => number
  readonly getContentYFromClientY: (clientY: number) => number
  readonly ticks: number[]
}

export function useDopesheetCoordinates(
  options: () => UseDopesheetCoordinatesOptions,
): UseDopesheetCoordinatesReturn {
  // One derived per option, so each memo below re-runs only when an input it
  // reads changes identity.
  const viewport = $derived(options().viewport)
  const viewportStartFrame = $derived(viewport.startFrame)
  const viewportEndFrame = $derived(viewport.endFrame)
  const effectiveTimelineWidth = $derived(options().effectiveTimelineWidth)
  const timelineEdgeInset = $derived(options().timelineEdgeInset)
  const timelineCellBorderWidth = $derived(options().timelineCellBorderWidth)
  const timelineGridDivisions = $derived(options().timelineGridDivisions)
  const hasTimelineScrollContainer = $derived(Boolean(options().timelineScrollContainerRef))
  const sheetRowsStructure = $derived(options().sheetRowsStructure)
  const groupedSheetRows = $derived(options().groupedSheetRows)
  const presentation = $derived(options().presentation)
  const textMotionBandCount = $derived(options().textMotionBandCount)
  const inlinePropertyGroupIdSet = $derived(options().inlinePropertyGroupIdSet)
  const expandedGroups = $derived(options().expandedGroups)
  const isPropertyLocked = $derived(options().isPropertyLocked)
  const affectedFrameRange = $derived(options().affectedFrameRange)
  const scrubClampToItemBounds = $derived(options().scrubClampToItemBounds)
  const scrubFrameBounds = $derived(options().scrubFrameBounds)
  const totalFrames = $derived(options().totalFrames)
  const frameRange = $derived(options().frameRange)
  // Ref boxes are stable; read their `current` at call time.
  const timelineRef = $derived(options().timelineRef)
  const scrollAreaRef = $derived(options().scrollAreaRef)

  const frameToX = $derived.by(() => {
    const v = viewport
    const width = effectiveTimelineWidth
    const inset = timelineEdgeInset
    return (frame: number) => getFrameAxisX(frame, v, width, inset)
  })
  const affectedFrameRangeGeometry = $derived.by(() => {
    const range = affectedFrameRange
    if (!range || range.toFrame <= range.fromFrame) {
      return null
    }
    const rawLeft = frameToX(range.fromFrame)
    const rawRight = frameToX(range.toFrame)
    const left = Math.max(0, Math.min(effectiveTimelineWidth, rawLeft))
    const right = Math.max(0, Math.min(effectiveTimelineWidth, rawRight))
    if (right <= left) return null
    return { left, width: right - left }
  })
  const sharedGridFrameToX = $derived.by(() => {
    const v = viewport
    const width = effectiveTimelineWidth
    const border = timelineCellBorderWidth
    return (frame: number) => getFrameAxisX(frame, v, width + border, 0) - border
  })
  const getRenderedKeyframeX = $derived.by(() => {
    const v = viewport
    const width = effectiveTimelineWidth
    const inset = timelineEdgeInset
    return (frame: number) => getVisibleKeyframeX(frame, v, width, inset)
  })
  const renderedKeyframeXById = $derived(
    buildRenderedKeyframeXById(sheetRowsStructure, getRenderedKeyframeX),
  )
  const renderedSheetEntries = $derived(
    buildRenderedSheetEntries({
      groupedSheetRows,
      presentation,
      textMotionBandCount,
      inlinePropertyGroupIdSet,
      expandedGroups,
    }),
  )
  // Marquee points are only needed while a selection marquee is moving.
  // Building them eagerly duplicated the viewport-sensitive keyframe position
  // pass on every zoom frame, even when no marquee interaction was active.
  const getKeyframePoints = $derived.by(() => {
    const entries = renderedSheetEntries.entries
    const getX = getRenderedKeyframeX
    const xById = renderedKeyframeXById
    const locked = isPropertyLocked
    return () => buildMarqueeKeyframePoints(entries, getX, xById, locked)
  })

  const xToFrame = $derived.by(() => {
    const v = viewport
    const width = effectiveTimelineWidth
    const inset = timelineEdgeInset
    return (x: number) => getFrameFromAxisX(x, v, width, inset)
  })

  const getFrameFromClientX = $derived.by(() => {
    const toFrame = xToFrame
    const border = timelineCellBorderWidth
    const clamp = scrubClampToItemBounds
    const bounds = scrubFrameBounds
    const total = totalFrames
    const ref = timelineRef
    return (clientX: number) => {
      const node = ref.current
      if (!node) return options().currentFrame
      const rect = node.getBoundingClientRect()
      const frame = toFrame(clientX - rect.left - border)
      if (clamp) return clampFrame(frame, total)
      if (!bounds) return frame
      return Math.max(bounds.minFrame, Math.min(bounds.maxFrame, frame))
    }
  })

  const getTimelineXFromClientX = $derived.by(() => {
    const width = effectiveTimelineWidth
    const border = timelineCellBorderWidth
    const ref = timelineRef
    return (clientX: number) => {
      const node = ref.current
      if (!node) return 0
      const rect = node.getBoundingClientRect()
      return Math.max(0, Math.min(width - 1, clientX - rect.left - border))
    }
  })

  const contentHeight = $derived(renderedSheetEntries.contentHeight)
  const getContentYFromClientY = $derived.by(() => {
    const height = contentHeight
    const ref = scrollAreaRef
    return (clientY: number) => {
      const node = ref.current
      if (!node) return 0
      const rect = node.getBoundingClientRect()
      const y = clientY - rect.top + node.scrollTop
      const maxY = Math.max(0, height)
      return Math.max(0, Math.min(maxY, y))
    }
  })

  const ticks = $derived(
    buildDopesheetTicks({
      startFrame: viewportStartFrame,
      endFrame: viewportEndFrame,
      frameRange,
      timelineGridDivisions,
      // Edit pans the already-rendered sheet on the compositor while expensive
      // keyframe rows settle less frequently. Keep a generous ruler-only buffer
      // on both sides so incoming tick marks are already present and move with
      // the main ruler instead of appearing at the next settled update.
      rulerOverscanFrames: hasTimelineScrollContainer ? frameRange * 2 : 0,
    }),
  )

  return {
    get frameToX() {
      return frameToX
    },
    get affectedFrameRangeGeometry() {
      return affectedFrameRangeGeometry
    },
    get sharedGridFrameToX() {
      return sharedGridFrameToX
    },
    get getRenderedKeyframeX() {
      return getRenderedKeyframeX
    },
    get renderedKeyframeXById() {
      return renderedKeyframeXById
    },
    get renderedSheetEntries() {
      return renderedSheetEntries
    },
    get getKeyframePoints() {
      return getKeyframePoints
    },
    get getFrameFromClientX() {
      return getFrameFromClientX
    },
    get getTimelineXFromClientX() {
      return getTimelineXFromClientX
    },
    get getContentYFromClientY() {
      return getContentYFromClientY
    },
    get ticks() {
      return ticks
    },
  }
}
