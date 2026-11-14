// SPDX-License-Identifier: MIT

/**
 * Graph interaction hook.
 * Handles pointer events, dragging, zoom, and pan for the value graph editor.
 * Uses pointer capture for reliable dragging even outside SVG bounds.
 */

import { useGraphSnapping } from './use-graph-snapping.svelte'
import { useGraphViewport } from './use-graph-viewport.svelte'
import { useGraphWheel } from './use-graph-wheel.svelte'
import { useMarquee } from './use-marquee.svelte'
import type { GraphBezierHandle, GraphDragState, GraphKeyframePoint } from './types'
import { PROPERTY_VALUE_RANGES } from './types'
import type { BezierControlPoints } from '@/types/keyframe'
import { getBezierPresetForEasing } from '@/features/keyframes/utils/easing-presets'
import { stateRef, type Ref } from '../ref-state.svelte'
import { updateBezierFromHandle } from './bezier-utils'
import {
  arePreviewValuesEqual,
  DRAG_THRESHOLD,
  type AdjacentSegmentInfo,
  type BezierDragStartState,
  type DragStartState,
  type UseGraphInteractionOptions,
  type UseGraphInteractionReturn,
} from './graph-interaction-types'

const EMPTY_TARGETS: number[] = []
const EMPTY_BLOCKED: NonNullable<UseGraphInteractionOptions['blockedFrameRanges']> = []

function createRef<T>(current: T): Ref<T> {
  return { current }
}

/**
 * Hook for managing graph interactions with proper pointer capture.
 */
export function useGraphInteraction(
  options: () => UseGraphInteractionOptions,
): UseGraphInteractionReturn {
  const opts = () => {
    const o = options()
    return {
      ...o,
      snapEnabled: o.snapEnabled ?? false,
      snapFrameTargets: o.snapFrameTargets ?? EMPTY_TARGETS,
      snapValueTargets: o.snapValueTargets ?? EMPTY_TARGETS,
      blockedFrameRanges: o.blockedFrameRanges ?? EMPTY_BLOCKED,
      disabled: o.disabled ?? false,
    }
  }

  // Reactive boxes (not bare `$state` lets) so the hook-purity lint sees
  // handler writes as writes to a ref, which is what they are.
  const dragState = stateRef<GraphDragState | null>(null)
  const isDragging = stateRef(false)
  const previewValues = stateRef<Record<string, { frame: number; value: number }> | null>(null)
  const draggingHandle = stateRef<{ keyframeId: string; type: 'in' | 'out' } | null>(null)
  const previewBezierConfigs = stateRef<Record<string, BezierControlPoints> | null>(null)
  const constraintAxis = stateRef<'x' | 'y' | null>(null)

  // Refs for stable values during drag
  const dragStartRef = createRef<DragStartState | null>(null)
  const bezierDragStartRef = createRef<BezierDragStartState | null>(null)
  const svgRef = createRef<SVGSVGElement | null>(null)
  const pointsRef: Ref<GraphKeyframePoint[]> = {
    get current() {
      return options().points
    },
    set current(_value) {},
  }

  // Track whether we've called onDragStart for the current drag operation
  const dragStartCalled = createRef(false)

  // Timestamp of last keyframe/handle interaction (used to ignore click events
  // that fire on the SVG after pointer capture redirects them away from the original target)
  const lastInteractionTimeRef = createRef(0)

  const graphViewport = useGraphViewport(() => {
    const o = options()
    return {
      viewport: o.viewport,
      padding: o.padding,
      points: o.points,
      selectedKeyframeIds: o.selectedKeyframeIds,
      maxFrame: o.maxFrame,
      minValue: o.minValue,
      maxValue: o.maxValue,
      onViewportChange: o.onViewportChange,
    }
  })
  const { clampViewportToBounds, ensureKeyframesRemainVisible, screenToGraph, zoomIn, zoomOut } =
    graphViewport

  const marquee = useMarquee(() => {
    const o = opts()
    return {
      disabled: o.disabled,
      viewport: o.viewport,
      selectedKeyframeIds: o.selectedKeyframeIds,
      pointsRef,
      svgRef,
      dragStartRef,
      bezierDragStartRef,
      onSelectionChange: o.onSelectionChange,
    }
  })
  const { marqueeStateRef, marqueeJustEndedRef, handleBackgroundPointerDown } = marquee

  const snapping = useGraphSnapping(() => {
    const o = opts()
    return {
      snapEnabled: o.snapEnabled,
      graphDimensions: graphViewport.graphDimensions,
      blockedFrameRanges: o.blockedFrameRanges,
    }
  })
  const { snapToTargets, clampToAvoidBlockedRanges } = snapping

  // Handle keyframe pointer down (start potential drag)
  const handleKeyframePointerDown = (point: GraphKeyframePoint, event: PointerEvent) => {
    const { disabled, selectedKeyframeIds, points, onSelectionChange, onDuplicateKeyframes } =
      opts()
    if (disabled) return

    event.preventDefault()
    event.stopPropagation()
    lastInteractionTimeRef.current = Date.now()

    // Capture pointer on the SVG element (not the keyframe itself)
    const svg = (event.currentTarget as Element | null)?.closest('svg') ?? null
    if (svg) {
      svg.setPointerCapture(event.pointerId)
      svgRef.current = svg as SVGSVGElement
    }

    // If not already selected, select it (clear others unless shift)
    const selectionForDrag = selectedKeyframeIds.has(point.keyframe.id)
      ? new Set(selectedKeyframeIds)
      : event.shiftKey
        ? new Set([...selectedKeyframeIds, point.keyframe.id])
        : new Set([point.keyframe.id])
    if (!selectedKeyframeIds.has(point.keyframe.id)) {
      onSelectionChange?.(selectionForDrag)
    }

    const draggedPoints = points.filter((candidate) => selectionForDrag.has(candidate.keyframe.id))
    const pointsForDrag = draggedPoints.length > 1 ? draggedPoints : [point]
    const initialKeyframeStates = new Map(
      pointsForDrag.map((dragPoint) => [
        dragPoint.keyframe.id,
        (() => {
          const range = PROPERTY_VALUE_RANGES[dragPoint.property]
          return {
            itemId: dragPoint.itemId,
            property: dragPoint.property,
            frame: dragPoint.keyframe.frame,
            value: dragPoint.keyframe.value,
            minValue: range?.min ?? Number.NEGATIVE_INFINITY,
            maxValue: range?.max ?? Number.POSITIVE_INFINITY,
          }
        })(),
      ]),
    )

    // Store initial state in ref (with cached bounding rect!)
    dragStartRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      initialFrame: point.keyframe.frame,
      initialValue: point.keyframe.value,
      boundingRect: svg?.getBoundingClientRect() || new DOMRect(),
      pointerId: event.pointerId,
      point,
      initialKeyframeStates,
      duplicateOnCommit: !!onDuplicateKeyframes && event.altKey,
    }

    dragState.current = {
      type: 'keyframe',
      keyframeId: point.keyframe.id,
      draggedKeyframeIds: pointsForDrag.map((dragPoint) => dragPoint.keyframe.id),
      itemId: point.itemId,
      property: point.property,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      initialFrame: point.keyframe.frame,
      initialValue: point.keyframe.value,
    }
  }

  // Handle keyframe click (selection only - called when drag threshold not met)
  const handleKeyframeClick = (point: GraphKeyframePoint, event: MouseEvent) => {
    const { disabled, selectedKeyframeIds, onSelectionChange } = opts()
    if (disabled) return

    let newSelection: Set<string>
    if (event.shiftKey) {
      // Toggle selection
      newSelection = new Set(selectedKeyframeIds)
      if (newSelection.has(point.keyframe.id)) {
        newSelection.delete(point.keyframe.id)
      } else {
        newSelection.add(point.keyframe.id)
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Add to selection
      newSelection = new Set([...selectedKeyframeIds, point.keyframe.id])
    } else {
      // Single select
      newSelection = new Set([point.keyframe.id])
    }

    onSelectionChange?.(newSelection)
  }

  // Handle bezier handle pointer down
  const handleBezierPointerDown = (handle: GraphBezierHandle, event: PointerEvent) => {
    const { disabled, points, onDragStart } = opts()
    if (disabled) return

    event.preventDefault()
    event.stopPropagation()
    lastInteractionTimeRef.current = Date.now()

    const point = points.find((p) => p.keyframe.id === handle.keyframeId)
    if (!point) return

    const bezier =
      point.keyframe.easingConfig?.bezier ?? getBezierPresetForEasing(point.keyframe.easing)
    if (!bezier) return

    // Find start and end points for this segment
    const sortedPoints = [...points].sort((a, b) => a.keyframe.frame - b.keyframe.frame)
    const pointIndex = sortedPoints.findIndex((p) => p.keyframe.id === handle.keyframeId)
    if (pointIndex === -1 || pointIndex >= sortedPoints.length - 1) return

    const startPoint = sortedPoints[pointIndex]!
    const endPoint = sortedPoints[pointIndex + 1]!

    // Capture pointer on the SVG element
    const svg = (event.currentTarget as Element | null)?.closest('svg') ?? null
    if (svg) {
      svg.setPointerCapture(event.pointerId)
      svgRef.current = svg as SVGSVGElement
    }

    // Determine mid-point and adjacent segment for tangent mirroring
    let adjacent: AdjacentSegmentInfo | null = null
    let midPoint: { x: number; y: number }

    if (handle.type === 'out') {
      // Anchor (mid-point) is startPoint; adjacent is the previous segment ending at startPoint
      midPoint = { x: startPoint.x, y: startPoint.y }
      const prevPoint = pointIndex > 0 ? sortedPoints[pointIndex - 1] : undefined
      if (prevPoint) {
        const adjBezier =
          prevPoint.keyframe.easingConfig?.bezier ??
          getBezierPresetForEasing(prevPoint.keyframe.easing)
        if (adjBezier) {
          // Opposite handle is the 'in' handle of prev segment (x2, y2), anchored at startPoint
          const segW = startPoint.x - prevPoint.x
          const segH = startPoint.y - prevPoint.y
          const oppX = prevPoint.x + adjBezier.x2 * segW
          const oppY = prevPoint.y + adjBezier.y2 * segH
          const dx = oppX - midPoint.x
          const dy = oppY - midPoint.y
          adjacent = {
            keyframeId: prevPoint.keyframe.id,
            itemId: prevPoint.itemId,
            property: prevPoint.property,
            handleType: 'in',
            startPoint: prevPoint,
            endPoint: startPoint,
            initialBezier: { ...adjBezier },
            initialLength: Math.hypot(dx, dy),
          }
        }
      }
    } else {
      // handle.type === 'in': anchor (mid-point) is endPoint; adjacent is the next segment starting at endPoint
      midPoint = { x: endPoint.x, y: endPoint.y }
      const nextNextPoint =
        pointIndex + 2 < sortedPoints.length ? sortedPoints[pointIndex + 2] : undefined
      if (nextNextPoint) {
        const adjBezier =
          endPoint.keyframe.easingConfig?.bezier ??
          getBezierPresetForEasing(endPoint.keyframe.easing)
        if (adjBezier) {
          // Opposite handle is the 'out' handle of next segment (x1, y1), anchored at endPoint
          const segW = nextNextPoint.x - endPoint.x
          const segH = nextNextPoint.y - endPoint.y
          const oppX = endPoint.x + adjBezier.x1 * segW
          const oppY = endPoint.y + adjBezier.y1 * segH
          const dx = oppX - midPoint.x
          const dy = oppY - midPoint.y
          adjacent = {
            keyframeId: endPoint.keyframe.id,
            itemId: endPoint.itemId,
            property: endPoint.property,
            handleType: 'out',
            startPoint: endPoint,
            endPoint: nextNextPoint,
            initialBezier: { ...adjBezier },
            initialLength: Math.hypot(dx, dy),
          }
        }
      }
    }

    bezierDragStartRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      boundingRect: svg?.getBoundingClientRect() || new DOMRect(),
      pointerId: event.pointerId,
      handle,
      startPoint,
      endPoint,
      initialBezier: { ...bezier },
      adjacent,
      midPoint,
    }

    // Call onDragStart for bezier handle drag (no threshold, starts immediately)
    if (!dragStartCalled.current) {
      dragStartCalled.current = true
      onDragStart?.()
    }

    draggingHandle.current = { keyframeId: handle.keyframeId, type: handle.type }
    isDragging.current = true
    dragState.current = {
      type: 'bezier-handle',
      keyframeId: handle.keyframeId,
      itemId: point.itemId,
      property: point.property,
      handleType: handle.type,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      initialFrame: point.keyframe.frame,
      initialValue: point.keyframe.value,
      initialControlPoint:
        handle.type === 'out' ? { x: bezier.x1, y: bezier.y1 } : { x: bezier.x2, y: bezier.y2 },
    }
  }

  // Handle pointer move (SVG level)
  const handlePointerMove = (event: PointerEvent) => {
    const {
      disabled,
      viewport,
      padding,
      maxFrame,
      snapEnabled,
      snapFrameTargets,
      snapValueTargets,
      constrainFrameDelta,
      onDragStart,
    } = opts()
    if (disabled) return

    // Handle keyframe dragging
    if (dragStartRef.current && dragState.current?.type === 'keyframe') {
      const { mouseX, mouseY, point, initialKeyframeStates } = dragStartRef.current
      const anchorInitialState = initialKeyframeStates.get(point.keyframe.id)
      if (!anchorInitialState) return

      // Use fresh viewport dimensions (not cached) to handle resize during drag
      const graphWidth = viewport.width - padding.left - padding.right
      const graphHeight = viewport.height - padding.top - padding.bottom
      const frameRange = viewport.endFrame - viewport.startFrame
      const valueRange = Math.max(0.0001, viewport.maxValue - viewport.minValue)
      const dx = event.clientX - mouseX
      const dy = event.clientY - mouseY
      const exceededThreshold = Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD

      // Check threshold before committing to drag
      if (!isDragging.current && exceededThreshold) {
        isDragging.current = true
        // Call onDragStart when we first exceed threshold
        if (!dragStartCalled.current && !dragStartRef.current.duplicateOnCommit) {
          dragStartCalled.current = true
          onDragStart?.()
        }
      }

      if (!isDragging.current && !exceededThreshold) {
        return
      }

      // Calculate DELTA in graph coordinates (relative movement)
      let frameDelta = (dx / graphWidth) * frameRange
      let valueDelta = -(dy / graphHeight) * valueRange

      // Alt = fine adjustment (half speed)
      if (event.altKey && !dragStartRef.current.duplicateOnCommit) {
        frameDelta *= 0.5
        valueDelta *= 0.5
      }

      let newFrame = anchorInitialState.frame + frameDelta
      let newValue = anchorInitialState.value + valueDelta

      // Shift = constrain to axis
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) {
          newValue = anchorInitialState.value // Lock Y (only change frame)
          constraintAxis.current = 'x' // Horizontal constraint (frame only)
        } else {
          newFrame = anchorInitialState.frame // Lock X (only change value)
          constraintAxis.current = 'y' // Vertical constraint (value only)
        }
      } else {
        constraintAxis.current = null
      }

      // Bounds checking - clamp to valid frame range [0, maxFrame]
      newFrame = Math.round(newFrame)
      newFrame = Math.max(0, newFrame)
      if (maxFrame !== undefined) {
        newFrame = Math.min(maxFrame - 1, newFrame) // -1 because last valid frame is maxFrame - 1
      }

      // Bounds checking - clamp to valid value range
      newValue = Math.max(
        anchorInitialState.minValue,
        Math.min(anchorInitialState.maxValue, newValue),
      )

      // Apply snapping if enabled (but not when Ctrl is held to temporarily disable)
      if (snapEnabled && !event.ctrlKey && !event.metaKey) {
        const { snapThresholds } = snapping
        // Snap frame to targets
        const frameSnap = snapToTargets(newFrame, snapFrameTargets, snapThresholds.frameThreshold)
        newFrame = frameSnap.snapped

        // Snap value to targets
        const valueSnap = snapToTargets(newValue, snapValueTargets, snapThresholds.valueThreshold)
        newValue = valueSnap.snapped
      }

      // Prevent dragging into blocked (transition) regions
      newFrame = clampToAvoidBlockedRanges(newFrame, anchorInitialState.frame)

      const constrainedFrameDelta = constrainFrameDelta
        ? constrainFrameDelta(
            newFrame - anchorInitialState.frame,
            Array.from(initialKeyframeStates.keys()),
          )
        : newFrame - anchorInitialState.frame
      newFrame = anchorInitialState.frame + constrainedFrameDelta

      const appliedFrameDelta = newFrame - anchorInitialState.frame
      const appliedValueDelta = newValue - anchorInitialState.value
      const nextPreviewValues: Record<string, { frame: number; value: number }> = {}

      for (const [keyframeId, initialState] of initialKeyframeStates) {
        let nextFrame = Math.round(initialState.frame + appliedFrameDelta)
        nextFrame = Math.max(0, nextFrame)
        if (maxFrame !== undefined) {
          nextFrame = Math.min(maxFrame - 1, nextFrame)
        }
        nextFrame = clampToAvoidBlockedRanges(nextFrame, initialState.frame)

        let nextValue = initialState.value + appliedValueDelta
        nextValue = Math.max(initialState.minValue, Math.min(initialState.maxValue, nextValue))

        nextPreviewValues[keyframeId] = { frame: nextFrame, value: nextValue }
      }

      if (!arePreviewValuesEqual(previewValues.current, nextPreviewValues)) {
        previewValues.current = nextPreviewValues
      }
      return
    }

    // Handle bezier handle dragging — use local preview, commit on pointer up
    if (bezierDragStartRef.current && dragState.current?.type === 'bezier-handle') {
      const { boundingRect, startPoint, endPoint, handle, initialBezier, adjacent, midPoint } =
        bezierDragStartRef.current

      const mouseX = event.clientX - boundingRect.left
      const mouseY = event.clientY - boundingRect.top

      // Calculate new handle position in segment-relative coordinates
      const segmentWidth = endPoint.x - startPoint.x
      const segmentHeight = endPoint.y - startPoint.y

      if (segmentWidth === 0) return

      let newX = (mouseX - startPoint.x) / segmentWidth
      let newY = segmentHeight === 0 ? 0.5 : (mouseY - startPoint.y) / segmentHeight

      // Shift = constrain to initial direction (scale length only)
      if (event.shiftKey) {
        const initX = handle.type === 'out' ? initialBezier.x1 : initialBezier.x2
        const initY = handle.type === 'out' ? initialBezier.y1 : initialBezier.y2
        // Anchor in segment-relative coords: 'out' anchored at (0,0), 'in' anchored at (1,1)
        const anchorX = handle.type === 'out' ? 0 : 1
        const anchorY = handle.type === 'out' ? 0 : 1
        const dirX = initX - anchorX
        const dirY = initY - anchorY
        const dirLen = Math.hypot(dirX, dirY)
        if (dirLen > 0) {
          // Project mouse onto the initial direction line
          const toMouseX = newX - anchorX
          const toMouseY = newY - anchorY
          const dot = (toMouseX * dirX + toMouseY * dirY) / (dirLen * dirLen)
          newX = anchorX + dirX * dot
          newY = anchorY + dirY * dot
        }
      }

      const clampedNewX = Math.max(0, Math.min(1, newX))

      // Compute preview bezier for the dragged handle
      const newBezier = updateBezierFromHandle(initialBezier, handle.type, clampedNewX, newY)

      const nextPreview: Record<string, BezierControlPoints> = {
        [handle.keyframeId]: newBezier,
      }

      // Compute mirrored bezier for mid-point tangent continuity
      if (adjacent && adjacent.initialLength > 0) {
        const handleAbsX = startPoint.x + clampedNewX * segmentWidth
        const handleAbsY = startPoint.y + newY * segmentHeight

        const dx = handleAbsX - midPoint.x
        const dy = handleAbsY - midPoint.y
        const len = Math.hypot(dx, dy)

        if (len > 0) {
          const mirrorX = midPoint.x - (dx / len) * adjacent.initialLength
          const mirrorY = midPoint.y - (dy / len) * adjacent.initialLength

          const adjSegW = adjacent.endPoint.x - adjacent.startPoint.x
          const adjSegH = adjacent.endPoint.y - adjacent.startPoint.y

          if (adjSegW !== 0) {
            const adjRelX = (mirrorX - adjacent.startPoint.x) / adjSegW
            const adjRelY = adjSegH === 0 ? 0.5 : (mirrorY - adjacent.startPoint.y) / adjSegH

            nextPreview[adjacent.keyframeId] = updateBezierFromHandle(
              adjacent.initialBezier,
              adjacent.handleType,
              Math.max(0, Math.min(1, adjRelX)),
              adjRelY,
            )
          }
        }
      }

      previewBezierConfigs.current = nextPreview
    }
  }

  const resetDragState = () => {
    dragState.current = null
    isDragging.current = false
    previewValues.current = null
    previewBezierConfigs.current = null
    draggingHandle.current = null
    constraintAxis.current = null
  }

  // Handle pointer up (SVG level)
  const handlePointerUp = (event: PointerEvent) => {
    const { onDuplicateKeyframes, onKeyframeMove, onBezierHandleMove, onDragEnd } = opts()
    const dragStateType = dragState.current?.type
    // Release pointer capture
    if (
      svgRef.current &&
      (dragStartRef.current || bezierDragStartRef.current || marqueeStateRef.current)
    ) {
      try {
        svgRef.current.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer capture may have been lost
      }
    }

    // If we never exceeded threshold, treat as click (selection only)
    // Selection was already handled in pointerDown, no additional action needed

    const committedPreviewValues = previewValues.current
    if (dragStateType === 'keyframe' && dragStartRef.current && committedPreviewValues) {
      if (dragStartRef.current.duplicateOnCommit) {
        const entries = Array.from(dragStartRef.current.initialKeyframeStates.entries()).flatMap(
          ([keyframeId, initialState]) => {
            const previewValue = committedPreviewValues[keyframeId]
            if (!previewValue) {
              return []
            }

            return [
              {
                ref: {
                  itemId: initialState.itemId,
                  property: initialState.property,
                  keyframeId,
                },
                frame: previewValue.frame,
                value: previewValue.value,
              },
            ]
          },
        )

        if (entries.length > 0) {
          onDuplicateKeyframes?.(entries)
        }
      } else {
        for (const [keyframeId, initialState] of dragStartRef.current.initialKeyframeStates) {
          const previewValue = committedPreviewValues[keyframeId]
          if (!previewValue) continue
          onKeyframeMove?.(
            {
              itemId: initialState.itemId,
              property: initialState.property,
              keyframeId,
            },
            previewValue.frame,
            previewValue.value,
          )
        }
      }
    }

    // Commit bezier handle preview on pointer up
    const previews = previewBezierConfigs.current
    if (dragStateType === 'bezier-handle' && bezierDragStartRef.current && previews) {
      const { handle, startPoint, adjacent } = bezierDragStartRef.current

      // Commit the primary handle
      const primaryBezier = previews[handle.keyframeId]
      if (primaryBezier) {
        onBezierHandleMove?.(
          {
            itemId: startPoint.itemId,
            property: startPoint.property,
            keyframeId: handle.keyframeId,
          },
          primaryBezier,
        )
      }

      // Commit the mirrored adjacent handle
      if (adjacent) {
        const adjBezier = previews[adjacent.keyframeId]
        if (adjBezier) {
          onBezierHandleMove?.(
            {
              itemId: adjacent.itemId,
              property: adjacent.property,
              keyframeId: adjacent.keyframeId,
            },
            adjBezier,
          )
        }
      }
    }

    // Call onDragEnd if we actually started a drag operation
    if (dragStartCalled.current) {
      dragStartCalled.current = false
      onDragEnd?.()
    }

    // Stamp interaction time so the post-drag click doesn't deselect
    // Only stamp when there was an actual keyframe/handle interaction
    if (dragStartRef.current || bezierDragStartRef.current) {
      lastInteractionTimeRef.current = Date.now()
    }

    // Reset all drag state
    dragStartRef.current = null
    bezierDragStartRef.current = null
    svgRef.current = null
    resetDragState()
  }

  const { handleWheel } = useGraphWheel(() => {
    const o = opts()
    return {
      disabled: o.disabled,
      viewport: o.viewport,
      graphDimensions: graphViewport.graphDimensions,
      screenToGraph,
      clampViewportToBounds,
      ensureKeyframesRemainVisible,
      dragStartRef,
      bezierDragStartRef,
      onViewportChange: o.onViewportChange,
    }
  })

  // Handle background click (deselect)
  const handleBackgroundClick = (_event: MouseEvent) => {
    const { disabled, onSelectionChange, onBackgroundClick } = opts()
    if (disabled) return
    if (marqueeJustEndedRef.current) return
    // Pointer capture redirects click targets to SVG — ignore clicks
    // that happen right after a keyframe/handle interaction
    if (Date.now() - lastInteractionTimeRef.current < 300) return
    onSelectionChange?.(new Set())
    onBackgroundClick?.()
  }

  return {
    get dragState() {
      return dragState.current
    },
    get isDragging() {
      return isDragging.current
    },
    get previewValues() {
      return previewValues.current
    },
    get draggingHandle() {
      return draggingHandle.current
    },
    get previewBezierConfigs() {
      return previewBezierConfigs.current
    },
    get constraintAxis() {
      return constraintAxis.current
    },
    handleKeyframePointerDown,
    handleKeyframeClick,
    handleBezierPointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleBackgroundPointerDown,
    handleBackgroundClick,
    lastInteractionTime: lastInteractionTimeRef,
    get marqueeRect() {
      return marquee.marqueeRect
    },
    zoomIn,
    zoomOut,
    fitToContent: graphViewport.fitToContent,
  }
}
