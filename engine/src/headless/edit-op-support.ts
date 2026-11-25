/**
 * Shared foundation for headless edit ops.
 *
 * Declares the wire operation contract, the canvas of the project being edited,
 * and the store lookups and item builders the op handlers drive. Moved out of
 * edit.ts so that module can dispatch ops through a handler table; every body
 * below is unchanged.
 */
import type { TimelineItem, TimelineTrack, TextItem } from '@/types/timeline'
import type { MediaMetadata } from '@/types/storage'
import type { Transition } from '@/types/transition'

import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { createClassicTrack } from '@/features/timeline/utils/classic-tracks'
import { setTracks, updateTransition } from '@/features/timeline/stores/timeline-actions'

export type EditOperationName =
  | 'addText'
  | 'addItem'
  | 'updateItem'
  | 'moveItem'
  | 'removeItems'
  | 'split'
  | 'trimStart'
  | 'trimEnd'
  | 'addTransition'
  | 'updateTransition'
  | 'removeTransition'
  | 'addTrack'
  | 'addClip'
  | 'addKeyframe'
  | 'removeKeyframes'
  | 'setTransformParent'
  | 'addEffect'
  | 'removeEffect'
  | 'setTransform'

/** A wire operation. Runtime dispatch validates its discriminator before invoking a handler. */
export type EditOp = Record<string, unknown> & { op: EditOperationName }

// Canvas of the project being edited (set per editProject call) — transform-parent
// binds resolve world transforms against it.
let editCanvas = { width: 1920, height: 1080, fps: 30 }

export const asString = (value: unknown, fallback?: string): string | undefined =>
  typeof value === 'string' ? value : fallback
export const asNumber = (value: unknown, fallback?: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function tracks(): TimelineTrack[] {
  return useItemsStore.getState().tracks
}

export function requireItem(id: string, field = 'id'): TimelineItem {
  const item = useItemsStore.getState().itemById[id]
  if (!item) throw new Error(`${field}: item "${id}" does not exist`)
  return item
}

export function requireTransition(id: string, field = 'id'): Transition {
  const transition = useTransitionsStore.getState().transitions.find((t) => t.id === id)
  if (!transition) throw new Error(`${field}: transition "${id}" does not exist`)
  return transition
}

/**
 * Confirm an `updateTransition` actually landed.
 *
 * `updateTransition` runs handle validation for `durationInFrames` / `alignment`
 * and, on rejection, only logs — its signature is `void`, so a caller cannot tell
 * a rejected edit from an applied one. Comparing against the post-update state
 * catches every rejection path, present and future, without changing the shared
 * store API.
 */
export function assertTransitionUpdateApplied(
  id: string,
  updates: Parameters<typeof updateTransition>[1],
): void {
  const applied = requireTransition(id)
  const rejected = Object.entries(updates)
    .filter(([field, requested]) => {
      const actual = (applied as unknown as Record<string, unknown>)[field]
      // `properties` is a plain object; the rest are scalars.
      return JSON.stringify(actual) !== JSON.stringify(requested)
    })
    .map(([field, requested]) => `${field}=${JSON.stringify(requested)}`)

  if (rejected.length === 0) return
  throw new Error(
    `updateTransition("${id}") was rejected: ${rejected.join(', ')} — the transition is unchanged. ` +
      'Duration and alignment must fit the handles available on both clips.',
  )
}

export function requireTrack(id: string, field = 'trackId'): TimelineTrack {
  const track = tracks().find((candidate) => candidate.id === id)
  if (!track) throw new Error(`${field}: track "${id}" does not exist`)
  if (track.isGroup) throw new Error(`${field}: track "${id}" is a group and cannot contain items`)
  return track
}

/** Resolve a usable trackId: the requested one if it exists, else the first non-group video track. */
function resolveTrackId(preferred: unknown, kind: 'video' | 'audio' = 'video'): string {
  const all = tracks()
  const requested = asString(preferred)
  if (requested) {
    const track = requireTrack(requested)
    if ((track.kind ?? 'video') !== kind)
      throw new Error(`trackId: track "${requested}" is not ${kind}`)
    return requested
  }
  const match = all.find((t) => !t.isGroup && (t.kind ?? 'video') === kind)
  const fallback = match ?? all.find((t) => !t.isGroup)
  if (!fallback) throw new Error('No track available to place item on (add a track first)')
  return fallback.id
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Find a non-group track of the given kind, or create one (video on top, audio at bottom). */
export function getOrCreateTrack(kind: 'video' | 'audio'): string {
  const all = tracks()
  const existing = all.find((t) => !t.isGroup && (t.kind ?? 'video') === kind)
  if (existing) return existing.id
  const orders = all.map((t) => t.order)
  const order = kind === 'video' ? Math.min(0, ...orders) - 1 : Math.max(0, ...orders) + 1
  const track = createClassicTrack({ tracks: all, kind, order })
  setTracks([...all, track])
  return track.id
}

/** The requested track if it exists, else find-or-create one of the given kind. */
export function resolveOrCreateTrack(preferred: unknown, kind: 'video' | 'audio'): string {
  const requested = asString(preferred)
  if (requested) {
    const track = requireTrack(requested)
    if ((track.kind ?? 'video') !== kind)
      throw new Error(`trackId: track "${requested}" is not ${kind}`)
    return requested
  }
  return getOrCreateTrack(kind)
}

/** EmbeddableCut: an audio track with nothing between `from` and `end`, made if there's none. */
export function getOrCreateFreeAudioTrack(from: number, end: number): string {
  const { items } = useItemsStore.getState()
  const isFree = (trackId: string) =>
    !items.some(
      (item) =>
        item.trackId === trackId && item.from < end && item.from + item.durationInFrames > from,
    )
  const preferred = getOrCreateTrack('audio')
  if (isFree(preferred)) return preferred

  const all = tracks()
  const other = all.find((track) => !track.isGroup && track.kind === 'audio' && isFree(track.id))
  if (other) return other.id
  const order = Math.max(...all.map((track) => track.order)) + 1
  const track = createClassicTrack({ tracks: all, kind: 'audio', order })
  setTracks([...all, track])
  return track.id
}

/**
 * EmbeddableCut: the part of its media a new clip plays, and for how long: from
 * `sourceStartSeconds` to `sourceEndSeconds`, or for `durationInFrames`, the rest of it by default.
 * The media either side stays there to trim out to.
 */
export function clipRangeFor(op: EditOp, media: MediaMetadata, projectFps: number) {
  const sourceFps = media.fps && media.fps > 0 ? media.fps : projectFps
  const mediaSeconds = media.duration ?? 0
  const sourceDuration = Math.max(1, Math.round(mediaSeconds * sourceFps))

  const startSeconds = asNumber(op.sourceStartSeconds, 0)!
  const endSeconds = asNumber(op.sourceEndSeconds)
  // The length probed and the one a host knows can differ by a frame.
  const lastSecond = mediaSeconds + 1 / sourceFps
  if (startSeconds < 0 || (startSeconds > 0 && startSeconds >= mediaSeconds)) {
    throw new Error(`addClip: sourceStartSeconds ${startSeconds} is outside the media`)
  }
  if (endSeconds !== undefined && (endSeconds <= startSeconds || endSeconds > lastSecond)) {
    throw new Error(
      `addClip: sourceEndSeconds ${endSeconds} must be after sourceStartSeconds and inside the media`,
    )
  }

  const rangeFrames = Math.max(
    1,
    Math.round(((endSeconds ?? mediaSeconds) - startSeconds) * projectFps),
  )
  const durationInFrames = asNumber(op.durationInFrames) ?? rangeFrames
  if (endSeconds !== undefined && durationInFrames > rangeFrames) {
    throw new Error(
      `addClip: durationInFrames ${durationInFrames} is longer than the ${rangeFrames} frames from sourceStartSeconds to sourceEndSeconds`,
    )
  }

  const sourceStart = Math.min(sourceDuration - 1, Math.round(startSeconds * sourceFps))
  const sourceEnd = Math.min(
    sourceDuration,
    sourceStart + Math.max(1, Math.round((durationInFrames * sourceFps) / projectFps)),
  )
  return {
    durationInFrames,
    source: { sourceFps, sourceStart, sourceEnd, sourceDuration, speed: 1 },
  }
}

export function buildTextItem(op: EditOp): TextItem {
  return {
    id: asString(op.id) ?? newId(),
    type: 'text',
    trackId: resolveTrackId(op.trackId, 'video'),
    from: asNumber(op.from, 0)!,
    durationInFrames: asNumber(op.durationInFrames, 90)!,
    label: asString(op.label) ?? 'Text',
    text: asString(op.text) ?? 'Text',
    color: asString(op.color) ?? '#ffffff',
    fontSize: asNumber(op.fontSize, 80)!,
    ...(asString(op.fontFamily) && { fontFamily: asString(op.fontFamily) }),
    ...(op.fontWeight === 'bold' || op.fontWeight === 'semibold' || op.fontWeight === 'medium'
      ? { fontWeight: op.fontWeight }
      : {}),
    ...(op.textAlign === 'left' || op.textAlign === 'center' || op.textAlign === 'right'
      ? { textAlign: op.textAlign }
      : {}),
    ...(op.verticalAlign === 'top' || op.verticalAlign === 'middle' || op.verticalAlign === 'bottom'
      ? { verticalAlign: op.verticalAlign }
      : {}),
  }
}

/** Canvas of the project currently being edited (see editProject). */
export function getEditCanvas(): typeof editCanvas {
  return editCanvas
}

/** Point the op handlers at the canvas of the project now being edited. */
export function setEditCanvas(canvas: typeof editCanvas): void {
  editCanvas = canvas
}
