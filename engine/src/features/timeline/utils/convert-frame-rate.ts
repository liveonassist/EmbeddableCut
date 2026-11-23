// SPDX-License-Identifier: MIT

/**
 * Moving a timeline to another frame rate with its timing unchanged: every
 * frame count that means a time is re-expressed at the new rate. Pure, so the
 * project action applies it to the live timeline and to stored compositions.
 */

import type { ItemKeyframes, PropertyKeyframes, VectorPropertyKeyframes } from '@/types/keyframe'
import type { TextMotionEffectBase } from '@/types/text-motion'
import type { ProjectMarker, TimelineItem } from '@/types/timeline'
import type { Transition } from '@/types/transition'

/** The frame-counted content of one timeline (Main's, or a composition's). */
export interface FrameRateContent {
  items: TimelineItem[]
  transitions: Transition[]
  keyframes: ItemKeyframes[]
  markers: ProjectMarker[]
  inPoint: number | null
  outPoint: number | null
}

/** Guards floors and collisions against representation error, e.g. `25 * (30 / 25)`. */
const EPSILON = 1e-6

/** A timeline position, on the new rate's nearest frame. */
export function convertFrame(frame: number, fromFps: number, toFps: number): number {
  return Math.round((frame * toFps) / fromFps)
}

/** A length that's part of something else's (a fade, a stagger): never rounded to nothing. */
function convertLength(frames: number, fromFps: number, toFps: number): number {
  return frames > 0 ? Math.max(1, convertFrame(frames, fromFps, toFps)) : frames
}

/**
 * Item spans, track by track. Both edges of an item are converted as
 * positions, so clips that met still meet and gaps stay gaps. Only a clip
 * shorter than a frame of the new rate needs more than its span: it keeps one
 * frame, and what followed it moves over.
 */
function convertSpans(
  items: readonly TimelineItem[],
  fromFps: number,
  toFps: number,
): Map<string, { from: number; durationInFrames: number }> {
  const byTrack = new Map<string, TimelineItem[]>()
  for (const item of items) {
    const track = byTrack.get(item.trackId)
    if (track) track.push(item)
    else byTrack.set(item.trackId, [item])
  }

  const spans = new Map<string, { from: number; durationInFrames: number }>()
  for (const trackItems of byTrack.values()) {
    let previousEnd = 0
    let previousSourceEnd = 0
    for (const item of [...trackItems].sort((a, b) => a.from - b.from)) {
      const sourceEnd = item.from + item.durationInFrames
      const start = convertFrame(item.from, fromFps, toFps)
      // Clips that overlapped (legacy transitions) keep their overlap.
      const from = item.from >= previousSourceEnd ? Math.max(start, previousEnd) : start
      const end = Math.max(from + 1, convertFrame(sourceEnd, fromFps, toFps))
      spans.set(item.id, { from, durationInFrames: end - from })
      previousEnd = Math.max(previousEnd, end)
      previousSourceEnd = Math.max(previousSourceEnd, sourceEnd)
    }
  }
  return spans
}

/** Keyframe positions, kept distinct: two landing on one frame would drop a value. */
function convertKeyedFrames<T extends { frame: number }>(
  keyframes: readonly T[],
  fromFps: number,
  toFps: number,
): T[] {
  let previous = -1
  return keyframes.map((keyframe) => {
    const frame = Math.max(previous + 1, convertFrame(keyframe.frame, fromFps, toFps))
    previous = frame
    return { ...keyframe, frame }
  })
}

function convertTextMotion<T extends TextMotionEffectBase>(
  effect: T,
  fromFps: number,
  toFps: number,
): T {
  return {
    ...effect,
    durationFrames: convertLength(effect.durationFrames, fromFps, toFps),
    staggerFrames: convertLength(effect.staggerFrames, fromFps, toFps),
    ...(effect.offsetFrames === undefined
      ? {}
      : { offsetFrames: convertLength(effect.offsetFrames, fromFps, toFps) }),
  }
}

/**
 * Source positions count the source's own frames. An item that doesn't name
 * its source's rate counts them at the timeline's, so it's told the old one.
 */
function sourceRateUpdate(item: TimelineItem, fromFps: number): Partial<TimelineItem> {
  if (item.type !== 'video' && item.type !== 'audio') return {}
  // A compound clip's audio counts its composition's frames (convertWrapperSource).
  if (item.compositionId !== undefined) return {}
  const countsSource =
    item.sourceStart !== undefined ||
    item.sourceEnd !== undefined ||
    item.sourceDuration !== undefined ||
    item.trimStart !== undefined ||
    item.offset !== undefined
  return countsSource && item.sourceFps === undefined ? { sourceFps: fromFps } : {}
}

function convertItem(
  item: TimelineItem,
  span: { from: number; durationInFrames: number },
  fromFps: number,
  toFps: number,
): TimelineItem {
  const converted = {
    ...item,
    ...span,
    ...sourceRateUpdate(item, fromFps),
  } as TimelineItem
  if (item.reverseConformLocalStart !== undefined) {
    // An offset into a file prepared for the clip, in timeline frames.
    converted.reverseConformLocalStart = convertFrame(item.reverseConformLocalStart, fromFps, toFps)
  }
  if (item.motionModifiers) {
    converted.motionModifiers = item.motionModifiers.map((modifier) => ({
      ...modifier,
      phaseFrames: convertFrame(modifier.phaseFrames, fromFps, toFps),
    }))
  }
  if (item.motionLayers) {
    converted.motionLayers = item.motionLayers.map((layer) => ({
      ...layer,
      tracks: layer.tracks.map((track) => ({
        ...track,
        keyframes: convertKeyedFrames(track.keyframes, fromFps, toFps),
      })),
    }))
  }
  if (item.effects?.some((effect) => effect.audioPulse)) {
    converted.effects = item.effects.map((effect) =>
      effect.audioPulse
        ? {
            ...effect,
            audioPulse: {
              ...effect.audioPulse,
              durationFrames: convertLength(effect.audioPulse.durationFrames, fromFps, toFps),
              beats: convertKeyedFrames(effect.audioPulse.beats, fromFps, toFps),
            },
          }
        : effect,
    )
  }
  if (converted.type === 'text' && converted.textMotion) {
    const motion = converted.textMotion
    converted.textMotion = {
      ...(motion.in ? { in: convertTextMotion(motion.in, fromFps, toFps) } : {}),
      ...(motion.out ? { out: convertTextMotion(motion.out, fromFps, toFps) } : {}),
      ...(motion.loop ? { loop: convertTextMotion(motion.loop, fromFps, toFps) } : {}),
    }
  }
  return converted
}

function convertItemKeyframes(entry: ItemKeyframes, fromFps: number, toFps: number): ItemKeyframes {
  const converted: ItemKeyframes = {
    ...entry,
    properties: entry.properties.map((property): PropertyKeyframes => ({
      ...property,
      keyframes: convertKeyedFrames(property.keyframes, fromFps, toFps),
    })),
  }
  if (entry.vectorProperties) {
    converted.vectorProperties = entry.vectorProperties.map(
      (property): VectorPropertyKeyframes => ({
        ...property,
        keyframes: convertKeyedFrames(property.keyframes, fromFps, toFps),
      }),
    )
  }
  if (entry.propertyLinks) {
    converted.propertyLinks = entry.propertyLinks.map((link) => ({
      ...link,
      timeOffsetFrames: convertFrame(link.timeOffsetFrames, fromFps, toFps),
    }))
  }
  if (entry.expressions) {
    // Older projects keep direct links among the expressions.
    converted.expressions = entry.expressions.map((expression) =>
      'timeOffsetFrames' in expression
        ? {
            ...expression,
            timeOffsetFrames: convertFrame(expression.timeOffsetFrames, fromFps, toFps),
          }
        : expression,
    )
  }
  return converted
}

/** Transitions are rounded down, so the handles that covered them still do. */
function convertTransition(transition: Transition, fromFps: number, toFps: number): Transition {
  return {
    ...transition,
    durationInFrames: Math.max(
      1,
      Math.floor((transition.durationInFrames * toFps) / fromFps + EPSILON),
    ),
  }
}

/**
 * In and out points as positions. An out point on the last frame's far edge
 * stays there; one that would meet the in point is left a frame after it.
 */
function convertRange(
  inPoint: number | null,
  outPoint: number | null,
  fromFps: number,
  toFps: number,
): { inPoint: number | null; outPoint: number | null } {
  const start = inPoint === null ? null : convertFrame(inPoint, fromFps, toFps)
  const end = outPoint === null ? null : convertFrame(outPoint, fromFps, toFps)
  return {
    inPoint: start,
    outPoint: start !== null && end !== null ? Math.max(start + 1, end) : end,
  }
}

/** One timeline's content at `toFps`, showing what it showed at `fromFps` at every time. */
export function convertTimelineFrameRate<T extends FrameRateContent>(
  content: T,
  fromFps: number,
  toFps: number,
): T {
  if (fromFps === toFps || !(fromFps > 0) || !(toFps > 0)) return content
  const spans = convertSpans(content.items, fromFps, toFps)
  return {
    ...content,
    items: content.items.map((item) => convertItem(item, spans.get(item.id)!, fromFps, toFps)),
    transitions: content.transitions.map((t) => convertTransition(t, fromFps, toFps)),
    keyframes: content.keyframes.map((entry) => convertItemKeyframes(entry, fromFps, toFps)),
    markers: content.markers.map((marker) => ({
      ...marker,
      frame: convertFrame(marker.frame, fromFps, toFps),
    })),
    ...convertRange(content.inPoint, content.outPoint, fromFps, toFps),
  }
}

/**
 * Compound clips place their composition in its own frames. After that
 * composition moves to `toFps`, its wrappers' source fields follow it.
 */
export function convertWrapperSource(
  item: TimelineItem,
  fromFps: number,
  toFps: number,
): TimelineItem {
  if (item.compositionId === undefined) return item
  const scale = (value: number | undefined) =>
    value === undefined ? undefined : convertFrame(value, fromFps, toFps)
  const scaled = {
    ...item,
    ...(item.sourceFps === undefined ? {} : { sourceFps: toFps }),
  } as TimelineItem
  for (const field of [
    'sourceStart',
    'sourceEnd',
    'sourceDuration',
    'trimStart',
    'trimEnd',
  ] as const) {
    const value = scale(item[field])
    if (value !== undefined) scaled[field] = value
  }
  return scaled
}
