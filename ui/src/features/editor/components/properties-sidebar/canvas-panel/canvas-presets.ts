// SPDX-License-Identifier: MIT

/** The canvas shapes and resolutions the canvas panel offers. */

export interface CanvasAspect {
  id: string
  width: number
  height: number
}

export const CANVAS_ASPECTS: readonly CanvasAspect[] = [
  { id: '16:9', width: 16, height: 9 },
  { id: '9:16', width: 9, height: 16 },
  { id: '1:1', width: 1, height: 1 },
  { id: '4:5', width: 4, height: 5 },
]

export interface CanvasResolution {
  id: string
  /** The canvas's shorter side, so `1080p` is 1920×1080 and 1080×1920 alike. */
  shortSide: number
}

export const CANVAS_RESOLUTIONS: readonly CanvasResolution[] = [
  { id: '720p', shortSide: 720 },
  { id: '1080p', shortSide: 1080 },
  { id: '1440p', shortSide: 1440 },
  { id: '4K', shortSide: 2160 },
]

interface Size {
  width: number
  height: number
}

/** The canvas of a shape whose shorter side is `shortSide`, in even pixels. */
export function canvasSize(aspect: Size, shortSide: number): Size {
  const scale = shortSide / Math.min(aspect.width, aspect.height)
  const even = (length: number) => Math.round((length * scale) / 2) * 2
  return { width: even(aspect.width), height: even(aspect.height) }
}

/** The offered shape a canvas has; `null` when it's another. */
export function aspectOf(size: Size): CanvasAspect | null {
  const shortSide = Math.min(size.width, size.height)
  return (
    CANVAS_ASPECTS.find((aspect) => {
      const exact = canvasSize(aspect, shortSide)
      return exact.width === size.width && exact.height === size.height
    }) ?? null
  )
}

/** The offered resolution a canvas has, whatever its shape; `null` when it's another. */
export function resolutionOf(size: Size): CanvasResolution | null {
  const shortSide = Math.min(size.width, size.height)
  return CANVAS_RESOLUTIONS.find((resolution) => resolution.shortSide === shortSide) ?? null
}
