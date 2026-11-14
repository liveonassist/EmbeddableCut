// SPDX-License-Identifier: MIT

/**
 * Graph viewport hook.
 * Owns coordinate math, viewport clamping, focus-point selection,
 * and zoom controls (in/out/fit) for the value graph editor.
 *
 * Extracted from useGraphInteraction so the orchestrator hook can be
 * a thinner composition of independent interaction surfaces.
 */

import type { GraphKeyframePoint, GraphPadding, GraphViewport } from './types'

export interface GraphDimensions {
  graphLeft: number
  graphTop: number
  graphWidth: number
  graphHeight: number
  frameRange: number
  valueRange: number
}

export function getGraphDimensions(
  viewport: GraphViewport,
  padding: GraphPadding,
): GraphDimensions {
  const graphLeft = padding.left
  const graphTop = padding.top
  const graphWidth = viewport.width - padding.left - padding.right
  const graphHeight = viewport.height - padding.top - padding.bottom
  const frameRange = viewport.endFrame - viewport.startFrame
  const valueRange = viewport.maxValue - viewport.minValue
  return { graphLeft, graphTop, graphWidth, graphHeight, frameRange, valueRange }
}

export interface UseGraphViewportOptions {
  viewport: GraphViewport
  padding: GraphPadding
  points: GraphKeyframePoint[]
  selectedKeyframeIds: Set<string>
  maxFrame?: number
  /** Lower bound for the value axis (renamed internally to clampMinValue) */
  minValue?: number
  /** Upper bound for the value axis (renamed internally to clampMaxValue) */
  maxValue?: number
  onViewportChange?: (viewport: GraphViewport) => void
}

export interface UseGraphViewportReturn {
  readonly graphDimensions: GraphDimensions
  readonly zoomFocusPoint: { frame: number; value: number } | null
  clampViewportToBounds: (next: GraphViewport) => GraphViewport
  ensureKeyframesRemainVisible: (next: GraphViewport) => GraphViewport
  screenToGraph: (screenX: number, screenY: number) => { frame: number; value: number }
  zoomIn: () => void
  zoomOut: () => void
  fitToContent: () => void
}

export function useGraphViewport(options: () => UseGraphViewportOptions): UseGraphViewportReturn {
  // Each option in its own derived, so a memo below re-runs only when one of
  // its own inputs changes (React's dependency lists).
  const viewport = $derived(options().viewport)
  const padding = $derived(options().padding)
  const points = $derived(options().points)
  const selectedKeyframeIds = $derived(options().selectedKeyframeIds)

  const graphDimensions = $derived(getGraphDimensions(viewport, padding))

  const zoomFocusPoint = $derived.by(() => {
    const selectedPoints = points.filter((point) => selectedKeyframeIds.has(point.keyframe.id))
    const visiblePoints = points.filter(
      (point) =>
        point.keyframe.frame >= viewport.startFrame &&
        point.keyframe.frame <= viewport.endFrame &&
        point.keyframe.value >= viewport.minValue &&
        point.keyframe.value <= viewport.maxValue,
    )
    const focusPoints =
      selectedPoints.length > 0 ? selectedPoints : visiblePoints.length > 0 ? visiblePoints : points

    if (focusPoints.length === 0) return null

    const totals = focusPoints.reduce(
      (acc, point) => ({
        frame: acc.frame + point.keyframe.frame,
        value: acc.value + point.keyframe.value,
      }),
      { frame: 0, value: 0 },
    )

    return {
      frame: totals.frame / focusPoints.length,
      value: totals.value / focusPoints.length,
    }
  })

  const clampViewportToBounds = (nextViewport: GraphViewport): GraphViewport => {
    const { maxFrame, minValue: clampMinValue, maxValue: clampMaxValue } = options()
    let startFrame = nextViewport.startFrame
    let endFrame = nextViewport.endFrame
    let minValue = nextViewport.minValue
    let maxValue = nextViewport.maxValue

    const frameRange = Math.max(1, endFrame - startFrame)
    const maxFrameExtent = Math.max(maxFrame ?? 0, frameRange)

    if (startFrame < 0) {
      endFrame -= startFrame
      startFrame = 0
    }
    if (endFrame > maxFrameExtent) {
      const overflow = endFrame - maxFrameExtent
      startFrame = Math.max(0, startFrame - overflow)
      endFrame = maxFrameExtent
    }

    const valueRange = Math.max(0.0001, maxValue - minValue)
    if (clampMinValue !== undefined && clampMaxValue !== undefined) {
      const totalRange = Math.max(0.0001, clampMaxValue - clampMinValue)
      const boundedRange = Math.min(valueRange, totalRange)
      minValue = Math.max(clampMinValue, Math.min(clampMaxValue - boundedRange, minValue))
      maxValue = minValue + boundedRange
    } else {
      if (clampMinValue !== undefined && minValue < clampMinValue) {
        maxValue += clampMinValue - minValue
        minValue = clampMinValue
      }
      if (clampMaxValue !== undefined && maxValue > clampMaxValue) {
        minValue -= maxValue - clampMaxValue
        maxValue = clampMaxValue
      }
    }

    return {
      ...nextViewport,
      startFrame,
      endFrame,
      minValue,
      maxValue,
    }
  }

  const ensureKeyframesRemainVisible = (nextViewport: GraphViewport): GraphViewport => {
    const { points } = options()
    const clampedViewport = clampViewportToBounds(nextViewport)
    const focus = zoomFocusPoint
    if (points.length === 0 || !focus) {
      return clampedViewport
    }

    const hasVisiblePoint = points.some(
      (point) =>
        point.keyframe.frame >= clampedViewport.startFrame &&
        point.keyframe.frame <= clampedViewport.endFrame &&
        point.keyframe.value >= clampedViewport.minValue &&
        point.keyframe.value <= clampedViewport.maxValue,
    )

    if (hasVisiblePoint) {
      return clampedViewport
    }

    const frameRange = Math.max(1, clampedViewport.endFrame - clampedViewport.startFrame)
    const valueRange = Math.max(0.0001, clampedViewport.maxValue - clampedViewport.minValue)

    return clampViewportToBounds({
      ...clampedViewport,
      startFrame: focus.frame - frameRange / 2,
      endFrame: focus.frame + frameRange / 2,
      minValue: focus.value - valueRange / 2,
      maxValue: focus.value + valueRange / 2,
    })
  }

  const screenToGraph = (screenX: number, screenY: number): { frame: number; value: number } => {
    const { viewport } = options()
    const { graphLeft, graphTop, graphWidth, graphHeight, frameRange, valueRange } = graphDimensions
    const frame = viewport.startFrame + ((screenX - graphLeft) / graphWidth) * frameRange
    const value = viewport.maxValue - ((screenY - graphTop) / graphHeight) * valueRange
    return { frame, value }
  }

  const zoomBy = (factor: number) => {
    const { viewport, onViewportChange } = options()
    const { frameRange, valueRange } = graphDimensions
    const centerFrame = zoomFocusPoint?.frame ?? (viewport.startFrame + viewport.endFrame) / 2
    const centerValue = zoomFocusPoint?.value ?? (viewport.minValue + viewport.maxValue) / 2
    const newFrameRange = frameRange * factor
    const newValueRange = valueRange * factor

    onViewportChange?.(
      ensureKeyframesRemainVisible({
        ...viewport,
        startFrame: centerFrame - newFrameRange / 2,
        endFrame: centerFrame + newFrameRange / 2,
        minValue: centerValue - newValueRange / 2,
        maxValue: centerValue + newValueRange / 2,
      }),
    )
  }

  const zoomIn = () => zoomBy(0.8)
  const zoomOut = () => zoomBy(1.25)

  const fitToContent = () => {
    const {
      viewport,
      maxFrame,
      minValue: clampMinValue,
      maxValue: clampMaxValue,
      onViewportChange,
    } = options()
    onViewportChange?.(
      clampViewportToBounds({
        ...viewport,
        startFrame: 0,
        endFrame: Math.max(maxFrame ?? 60, 60),
        minValue: clampMinValue ?? 0,
        maxValue: clampMaxValue ?? 1,
      }),
    )
  }

  return {
    get graphDimensions() {
      return graphDimensions
    },
    get zoomFocusPoint() {
      return zoomFocusPoint
    },
    clampViewportToBounds,
    ensureKeyframesRemainVisible,
    screenToGraph,
    zoomIn,
    zoomOut,
    fitToContent,
  }
}
