// SPDX-License-Identifier: MIT

/**
 * The two regions an After Effects timeline draws over its layers: the comp's own
 * extent, and the active (work) region inside it.
 *
 * Both matter here because the Motion axis is `max(comp duration, content end)` —
 * a layer is free to run past the end of the comp, where it is simply not
 * rendered. Without the comp end marked, that overhang looks like ordinary
 * timeline. The active region is the in/out range: what a render actually covers.
 *
 * Bands are pure paint (`pointer-events-none`) positioned in `%` of the caller's
 * viewport box, so they line up with the ruler ticks and the layer spans without
 * knowing the pixel width of either.
 */

export interface MotionRegionViewport {
  startFrame: number
  endFrame: number
}

export function toPercent(frame: number, viewport: MotionRegionViewport): number {
  const frameRange = Math.max(1, viewport.endFrame - viewport.startFrame)
  return ((frame - viewport.startFrame) / frameRange) * 100
}

export function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}
