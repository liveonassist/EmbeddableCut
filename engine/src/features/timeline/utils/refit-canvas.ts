// SPDX-License-Identifier: MIT

/**
 * Moving a timeline's picture to a canvas of another size. Clips that filled
 * the old canvas fill the new one, letterboxed (`fit`) or cropped (`fill`);
 * everything placed by hand (text, shapes, picture in picture) is scaled with
 * it. Pure: the project action applies the result.
 */

import type { ItemKeyframes, Keyframe, VectorKeyframe } from '@/types/keyframe'
import type { TextStyleFields } from '@/types/text'
import type { TimelineItem } from '@/types/timeline'
import type { TransformProperties, TransformReference } from '@/types/transform'

export interface CanvasSize {
  width: number
  height: number
}

/** How clips that fill the canvas meet one of another shape. */
export type CanvasFraming =
  /** The whole picture, with bars beside or above it. */
  | 'fit'
  /** No bars: the picture covers the canvas and its edges are cropped. */
  | 'fill'

/** What a refit reads about an item. */
export type SourceSizeOf = (item: TimelineItem) => CanvasSize | undefined

/** How far a placement may be off from filling the canvas and count as filling it. */
const TOLERANCE = 0.005

/** Keyframed properties measured in canvas pixels along one axis. */
const X_PROPERTIES = new Set(['x'])
const Y_PROPERTIES = new Set(['y'])
/** Keyframed properties measured in canvas pixels of size. */
const SIZE_PROPERTIES = new Set([
  'width',
  'height',
  'anchorX',
  'anchorY',
  'cornerRadius',
  'textStyleScale',
  'fontSize',
  'textPadding',
  'backgroundRadius',
  'textShadowOffsetX',
  'textShadowOffsetY',
  'textShadowBlur',
  'strokeWidth',
])
/** Keyframed properties that place an item, which a refit would contradict. */
const PLACEMENT_PROPERTIES = new Set(['x', 'y', 'width', 'height'])

interface Scale {
  /** Sizes, uniform so nothing is stretched. */
  size: number
  x: number
  y: number
}

function containSize(source: CanvasSize, canvas: CanvasSize): CanvasSize {
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height)
  return { width: source.width * scale, height: source.height * scale }
}

function coverSize(source: CanvasSize, canvas: CanvasSize): CanvasSize {
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height)
  return { width: source.width * scale, height: source.height * scale }
}

function mapSize(size: CanvasSize, round: (length: number) => number): CanvasSize {
  return { width: round(size.width), height: round(size.height) }
}

function sameSize(a: CanvasSize, b: CanvasSize, canvas: CanvasSize): boolean {
  const slack = (length: number) => Math.max(1, length * TOLERANCE)
  return (
    Math.abs(a.width - b.width) <= slack(canvas.width) &&
    Math.abs(a.height - b.height) <= slack(canvas.height)
  )
}

function isPictureItem(item: TimelineItem): boolean {
  return (
    item.type === 'video' ||
    item.type === 'image' ||
    item.type === 'lottie' ||
    item.type === 'composition'
  )
}

function keyframedPlacement(entry: ItemKeyframes | undefined): boolean {
  if (!entry) return false
  return (
    entry.properties.some(
      (property) => PLACEMENT_PROPERTIES.has(property.property) && property.keyframes.length > 0,
    ) ||
    (entry.vectorProperties?.some(
      (property) => property.property === 'position' && property.keyframes.length > 0,
    ) ??
      false)
  )
}

/**
 * How an item fills the canvas, `null` when it doesn't: it's smaller, moved,
 * rotated, animated or parented, or isn't a picture.
 */
function framingOf(
  item: TimelineItem,
  canvas: CanvasSize,
  source: CanvasSize | undefined,
  keyframes: ItemKeyframes | undefined,
): CanvasFraming | null {
  if (!isPictureItem(item) || !source || source.width <= 0 || source.height <= 0) return null
  if (item.transformParent || keyframedPlacement(keyframes)) return null
  const transform = item.transform
  if (Math.abs(transform?.x ?? 0) > 1 || Math.abs(transform?.y ?? 0) > 1) return null
  if (Math.abs(transform?.rotation ?? 0) > 0.01) return null
  const contain = containSize(source, canvas)
  const size = {
    width: transform?.width ?? contain.width,
    height: transform?.height ?? contain.height,
  }
  if (sameSize(size, contain, canvas)) return 'fit'
  return sameSize(size, coverSize(source, canvas), canvas) ? 'fill' : null
}

/** The items whose placement others hang off, or that hang off another's. */
function parentedItemIds(items: readonly TimelineItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.transformParent) continue
    ids.add(item.id)
    if (item.transformParent.parentItemId) ids.add(item.transformParent.parentItemId)
  }
  return ids
}

/**
 * How the timeline's full-canvas clips meet the canvas. `null` when none
 * does, or when they all have the canvas's own shape, where both framings
 * look the same; `mixed` when they differ.
 */
export function readCanvasFraming(
  items: readonly TimelineItem[],
  canvas: CanvasSize,
  sourceSizeOf: SourceSizeOf,
  keyframesById: ReadonlyMap<string, ItemKeyframes>,
): CanvasFraming | 'mixed' | null {
  let framing: CanvasFraming | null = null
  for (const item of items) {
    const source = sourceSizeOf(item)
    const own = framingOf(item, canvas, source, keyframesById.get(item.id))
    if (!own || !source) continue
    if (sameSize(containSize(source, canvas), coverSize(source, canvas), canvas)) continue
    if (framing !== null && framing !== own) return 'mixed'
    framing = own
  }
  return framing
}

function scaleTextStyle<T extends TextStyleFields>(style: T, factor: number): T {
  const scaled: T = { ...style }
  const scale = (value: number | undefined) => (value === undefined ? undefined : value * factor)
  for (const field of ['fontSize', 'letterSpacing', 'textPadding', 'backgroundRadius'] as const) {
    if (style[field] !== undefined) scaled[field] = scale(style[field])
  }
  if (style.textShadow) {
    scaled.textShadow = {
      ...style.textShadow,
      offsetX: style.textShadow.offsetX * factor,
      offsetY: style.textShadow.offsetY * factor,
      blur: style.textShadow.blur * factor,
    }
  }
  if (style.stroke) scaled.stroke = { ...style.stroke, width: style.stroke.width * factor }
  return scaled
}

function scaleSpan<T extends { fontSize?: number; letterSpacing?: number }>(
  span: T,
  factor: number,
): T {
  return {
    ...span,
    ...(span.fontSize === undefined ? {} : { fontSize: span.fontSize * factor }),
    ...(span.letterSpacing === undefined ? {} : { letterSpacing: span.letterSpacing * factor }),
  }
}

/** Sizes an item carries outside its transform: text, strokes, rounding. */
function scaleContent(item: TimelineItem, factor: number): TimelineItem {
  if (item.type === 'text') {
    const scaled = scaleTextStyle(item, factor)
    if (item.textStyleScale !== undefined) scaled.textStyleScale = item.textStyleScale * factor
    if (item.textSpans) scaled.textSpans = item.textSpans.map((span) => scaleSpan(span, factor))
    if (item.textLayoutDrafts) {
      const drafts = item.textLayoutDrafts
      scaled.textLayoutDrafts = {
        ...(drafts.single ? { single: scaleSpan(drafts.single, factor) } : {}),
        ...(drafts.twoSpans ? { twoSpans: drafts.twoSpans.map((s) => scaleSpan(s, factor)) } : {}),
        ...(drafts.threeSpans
          ? { threeSpans: drafts.threeSpans.map((s) => scaleSpan(s, factor)) }
          : {}),
      }
    }
    return scaled
  }
  if (item.type === 'subtitle') return scaleTextStyle(item, factor)
  if (item.type === 'shape') {
    return {
      ...item,
      ...(item.strokeWidth === undefined ? {} : { strokeWidth: item.strokeWidth * factor }),
      ...(item.cornerRadius === undefined ? {} : { cornerRadius: item.cornerRadius * factor }),
    }
  }
  return item
}

function scaleTransform(
  transform: TransformProperties | undefined,
  scale: Scale,
): TransformProperties | undefined {
  if (!transform) return transform
  const scaled = { ...transform }
  if (transform.x !== undefined) scaled.x = transform.x * scale.x
  if (transform.y !== undefined) scaled.y = transform.y * scale.y
  for (const field of ['width', 'height', 'anchorX', 'anchorY', 'cornerRadius'] as const) {
    const value = transform[field]
    if (value !== undefined) scaled[field] = value * scale.size
  }
  return scaled
}

function scaleReference(reference: TransformReference, scale: Scale): TransformReference {
  return {
    ...reference,
    x: reference.x * scale.x,
    y: reference.y * scale.y,
    width: reference.width * scale.size,
    height: reference.height * scale.size,
  }
}

/** Everything hung on an item's placement that's measured in canvas pixels. */
function scaleAttachments(item: TimelineItem, scale: Scale): TimelineItem {
  const scaled = { ...item }
  if (item.transformParent) {
    const { parentReference, childLocalReference, childWorldReference } = item.transformParent
    scaled.transformParent = {
      ...item.transformParent,
      ...(parentReference ? { parentReference: scaleReference(parentReference, scale) } : {}),
      childLocalReference: scaleReference(childLocalReference, scale),
      childWorldReference: scaleReference(childWorldReference, scale),
    }
  }
  if (item.motionLayers) {
    scaled.motionLayers = item.motionLayers.map((layer) => ({
      ...layer,
      tracks: layer.tracks.map((track) =>
        // Multiplicative tracks are factors, which no canvas changes.
        track.blend === 'multiply'
          ? track
          : {
              ...track,
              keyframes: track.keyframes.map((keyframe) => ({
                ...keyframe,
                value: scaleValue(track.property, keyframe.value, scale),
              })),
            },
      ),
    }))
  }
  if (item.transcriptCaptions?.style) {
    const style = item.transcriptCaptions.style
    scaled.transcriptCaptions = {
      ...item.transcriptCaptions,
      style: {
        ...scaleTextStyle(style, scale.size),
        ...(style.transform ? { transform: scaleTransform(style.transform, scale) } : {}),
      },
    }
  }
  return scaled
}

function scaleValue(property: string, value: number, scale: Scale): number {
  if (X_PROPERTIES.has(property)) return value * scale.x
  if (Y_PROPERTIES.has(property)) return value * scale.y
  return SIZE_PROPERTIES.has(property) ? value * scale.size : value
}

function scaleVectorKeyframe(
  property: 'position' | 'scale' | 'anchor',
  keyframe: VectorKeyframe,
  scale: Scale,
): VectorKeyframe {
  // Scale keyframes are percentages.
  if (property === 'scale') return keyframe
  const x = property === 'position' ? scale.x : scale.size
  const y = property === 'position' ? scale.y : scale.size
  const scaled: VectorKeyframe = {
    ...keyframe,
    value: { x: keyframe.value.x * x, y: keyframe.value.y * y },
  }
  if (keyframe.spatial) {
    const tangent = (v: { x: number; y: number }) => ({ x: v.x * x, y: v.y * y })
    scaled.spatial = {
      ...keyframe.spatial,
      inTangent: tangent(keyframe.spatial.inTangent),
      outTangent: tangent(keyframe.spatial.outTangent),
    }
  }
  return scaled
}

function scaleKeyframes(entry: ItemKeyframes, scale: Scale): ItemKeyframes {
  return {
    ...entry,
    properties: entry.properties.map((property) => ({
      ...property,
      keyframes: property.keyframes.map((keyframe): Keyframe => ({
        ...keyframe,
        value: scaleValue(property.property, keyframe.value, scale),
      })),
    })),
    ...(entry.vectorProperties
      ? {
          vectorProperties: entry.vectorProperties.map((property) => ({
            ...property,
            keyframes: property.keyframes.map((keyframe) =>
              scaleVectorKeyframe(property.property, keyframe, scale),
            ),
          })),
        }
      : {}),
  }
}

/** A clip that filled the old canvas, filling the new one. */
function reframe(
  item: TimelineItem,
  source: CanvasSize,
  canvas: CanvasSize,
  framing: CanvasFraming,
  cornerScale: number,
): TimelineItem {
  const { width: _w, height: _h, anchorX: _x, anchorY: _y, ...rest } = item.transform ?? {}
  const transform: TransformProperties = { ...rest }
  if (rest.cornerRadius !== undefined) transform.cornerRadius = rest.cornerRadius * cornerScale
  // Whole pixels, as imported clips get (computeInitialTransform); rounded up, a fill leaves no edge.
  if (framing === 'fill') Object.assign(transform, mapSize(coverSize(source, canvas), Math.ceil))
  else if (item.transform?.width !== undefined || item.transform?.height !== undefined) {
    // A clip whose size was pinned stays pinned; others take the default fit.
    Object.assign(transform, mapSize(containSize(source, canvas), Math.round))
  }
  return Object.keys(transform).length === 0 && item.transform === undefined
    ? item
    : ({ ...item, transform } as TimelineItem)
}

export interface RefitInput {
  items: readonly TimelineItem[]
  keyframes: readonly ItemKeyframes[]
  from: CanvasSize
  to: CanvasSize
  framing: CanvasFraming
  sourceSizeOf: SourceSizeOf
}

/** The items and keyframes as they should be on the new canvas. */
export function refitCanvas(input: RefitInput): {
  items: TimelineItem[]
  keyframes: ItemKeyframes[]
} {
  const { from, to, framing, sourceSizeOf } = input
  const ratioX = to.width / from.width
  const ratioY = to.height / from.height
  const size = Math.min(ratioX, ratioY)
  // Fitted, the old picture shrinks as one and overlays stay on what they
  // point at; filled, they spread out to the same part of the new canvas.
  const scale: Scale =
    framing === 'fit' ? { size, x: size, y: size } : { size, x: ratioX, y: ratioY }
  const resized = ratioX !== 1 || ratioY !== 1

  const keyframesById = new Map(input.keyframes.map((entry) => [entry.itemId, entry]))
  const parented = parentedItemIds(input.items)

  const items = input.items.map((item): TimelineItem => {
    if (item.type === 'audio' || item.type === 'adjustment') return item
    const source = sourceSizeOf(item)
    const current = parented.has(item.id)
      ? null
      : framingOf(item, from, source, keyframesById.get(item.id))
    if (current && source) {
      const attached = resized ? scaleAttachments(item, scale) : item
      return reframe(attached, source, to, framing, size)
    }
    if (!resized) return item
    const transform = scaleTransform(item.transform, scale)
    const placed = { ...item, ...(transform ? { transform } : {}) } as TimelineItem
    // A box the size of the old canvas (full-canvas text, a background) is one of the new.
    if (
      transform &&
      !parented.has(item.id) &&
      item.transform?.width !== undefined &&
      item.transform.height !== undefined &&
      !isPictureItem(item) &&
      sameSize({ width: item.transform.width, height: item.transform.height }, from, from)
    ) {
      transform.width = to.width
      transform.height = to.height
    }
    return scaleAttachments(scaleContent(placed, size), scale)
  })

  if (!resized) return { items, keyframes: [...input.keyframes] }
  return { items, keyframes: input.keyframes.map((entry) => scaleKeyframes(entry, scale)) }
}
