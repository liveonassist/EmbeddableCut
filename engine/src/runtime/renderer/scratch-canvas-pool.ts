// SPDX-License-Identifier: MIT

/**
 * Canvases of any size, reused across frames. `CanvasPool` holds canvases at
 * the frame's size only, and an item drawn at its own size, as a corner-pinned
 * one is, made a canvas and a context per frame for the collector to reclaim.
 * Held canvases are never shared, so interleaved renders are safe.
 */

const MAX_FREE = 4

const free: OffscreenCanvas[] = []

export function acquireScratchCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null {
  const index = free.findIndex((canvas) => canvas.width === width && canvas.height === height)
  const reused = index >= 0 ? free.splice(index, 1)[0] : free.pop()
  const canvas = reused ?? new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (canvas.width !== width || canvas.height !== height) {
    // Resizing clears the canvas and resets its context.
    canvas.width = width
    canvas.height = height
  } else if (reused) {
    ctx.reset()
  }
  return { canvas, ctx }
}

export function releaseScratchCanvas(canvas: OffscreenCanvas): void {
  if (free.length < MAX_FREE && !free.includes(canvas)) free.push(canvas)
}
