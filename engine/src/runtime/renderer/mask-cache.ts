// SPDX-License-Identifier: MIT

/**
 * What a mask costs to draw, kept while its inputs hold. Every masked item
 * applied each active mask itself, so one feathered mask over N layers was
 * filled and blurred at full size N times a frame, from a path rebuilt and
 * re-parsed every frame. Mask items are replaced, never edited, and their
 * prepared paths and bitmaps are never drawn into, so identity keys hold.
 */

import type { ResolvedTransform } from '@/types/transform'
import type { ShapeItem } from '@/types/timeline'
import type { MaskCanvasSettings } from './canvas-masks'
import { releaseScratchCanvas } from './scratch-canvas-pool'

interface MaskPathEntry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  canvasWidth: number
  canvasHeight: number
  logicalWidth: number | undefined
  logicalHeight: number | undefined
  path: Path2D
}

const maskPaths = new WeakMap<ShapeItem, MaskPathEntry>()

/** The path last built for this mask item, while its geometry is unchanged. */
export function getCachedMaskPath(
  mask: ShapeItem,
  transform: ResolvedTransform,
  canvas: MaskCanvasSettings,
): Path2D | undefined {
  const entry = maskPaths.get(mask)
  if (
    entry &&
    entry.x === transform.x &&
    entry.y === transform.y &&
    entry.width === transform.width &&
    entry.height === transform.height &&
    entry.rotation === transform.rotation &&
    entry.canvasWidth === canvas.width &&
    entry.canvasHeight === canvas.height &&
    entry.logicalWidth === canvas.logicalWidth &&
    entry.logicalHeight === canvas.logicalHeight
  ) {
    return entry.path
  }
  return undefined
}

export function cacheMaskPath(
  mask: ShapeItem,
  transform: ResolvedTransform,
  canvas: MaskCanvasSettings,
  path: Path2D,
): Path2D {
  maskPaths.set(mask, {
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    logicalWidth: canvas.logicalWidth,
    logicalHeight: canvas.logicalHeight,
    path,
  })
  return path
}

interface RenderedMaskEntry {
  source: Path2D | OffscreenCanvas
  inverted: boolean
  feather: number
  width: number
  height: number
  canvas: OffscreenCanvas
}

/** Distinct rendered masks kept at once, each a frame-sized canvas. */
const MAX_RENDERED_MASKS = 4
const renderedMasks: RenderedMaskEntry[] = []

/** The filled, inverted and blurred alpha of a mask path or bitmap, if kept. */
export function getRenderedMask(
  source: Path2D | OffscreenCanvas,
  inverted: boolean,
  feather: number,
  canvas: MaskCanvasSettings,
): OffscreenCanvas | undefined {
  const index = renderedMasks.findIndex(
    (entry) =>
      entry.source === source &&
      entry.inverted === inverted &&
      entry.feather === feather &&
      entry.width === canvas.width &&
      entry.height === canvas.height,
  )
  if (index < 0) return undefined
  const [entry] = renderedMasks.splice(index, 1)
  renderedMasks.unshift(entry!)
  return entry!.canvas
}

/** Keeps a rendered mask, which nothing may draw into afterwards. */
export function keepRenderedMask(
  source: Path2D | OffscreenCanvas,
  inverted: boolean,
  feather: number,
  canvas: MaskCanvasSettings,
  rendered: OffscreenCanvas,
): void {
  renderedMasks.unshift({
    source,
    inverted,
    feather,
    width: canvas.width,
    height: canvas.height,
    canvas: rendered,
  })
  for (const evicted of renderedMasks.splice(MAX_RENDERED_MASKS)) {
    releaseScratchCanvas(evicted.canvas)
  }
}

/** Draws content through a rendered mask, as the alpha mask passes do. */
export function drawThroughMask(
  ctx: OffscreenCanvasRenderingContext2D,
  contentCanvas: OffscreenCanvas,
  mask: OffscreenCanvas,
  opacity: number,
): void {
  ctx.drawImage(contentCanvas, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.globalAlpha = opacity
  ctx.drawImage(mask, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
