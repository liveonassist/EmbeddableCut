// SPDX-License-Identifier: MIT

import { DRAG_OPACITY } from '@/features/timeline/constants'
import { dragOffsetRef, dragPreviewOffsetByItemRef } from '../../hooks/use-timeline-drag.svelte'

interface ShellStyleSignals {
  itemId: string
  isBeingDragged: boolean
  isAltDrag: boolean
  isDragging: boolean
  dragOffset: { x: number; y: number }
  shouldDimForDrag: boolean
  trackHidden: boolean
  trackLocked: boolean
  isCompactShell: boolean
}

/** The shell's inline style properties; `undefined` leaves a property unset. */
export interface TimelineItemShellStyle {
  transform: string | undefined
  opacity: number
  pointerEvents: 'none' | 'auto'
  zIndex: number | undefined
  transition: 'none' | undefined
  contain: 'layout style' | 'layout style paint'
  contentVisibility: 'visible' | 'auto'
}

/**
 * Drag translate. The refs are read directly: a dragged clip that is not the
 * anchor follows the cohort offset, which lands after the anchor's own state
 * updates. Respecting the order the ternaries evaluate in matters — the refs
 * are only touched for an anchored, non-alt drag.
 */
function resolveShellDragTransform({
  itemId,
  isBeingDragged,
  isAltDrag,
  isDragging,
  dragOffset,
}: ShellStyleSignals): string | undefined {
  if (!isBeingDragged || isAltDrag) return undefined

  const offset = isDragging
    ? dragOffset
    : (dragPreviewOffsetByItemRef.current[itemId] ?? dragOffsetRef.current)

  return `translate(${offset.x}px, ${offset.y}px)`
}

function resolveShellOpacity({
  shouldDimForDrag,
  trackHidden,
  trackLocked,
}: ShellStyleSignals): number {
  if (shouldDimForDrag) return DRAG_OPACITY
  if (trackHidden) return 0.3
  if (trackLocked) return 0.6
  return 1
}

/** Shell style properties for this render. */
export function getTimelineItemShellStyle(signals: ShellStyleSignals): TimelineItemShellStyle {
  const { isBeingDragged, isCompactShell } = signals

  return {
    transform: resolveShellDragTransform(signals),
    opacity: resolveShellOpacity(signals),
    pointerEvents: isBeingDragged ? 'none' : 'auto',
    zIndex: isBeingDragged ? 50 : undefined,
    transition: isBeingDragged ? 'none' : undefined,
    // Compact shells already suppress rich content, and almost all of them are
    // onscreen in a dense track. Avoid giving each one a paint-containment
    // boundary that Layerize must revisit on every real-width zoom step.
    // Full-detail buffered clips keep browser layout/paint skipping while
    // offscreen.
    contain: isCompactShell ? 'layout style' : 'layout style paint',
    contentVisibility: isCompactShell ? 'visible' : 'auto',
  }
}
