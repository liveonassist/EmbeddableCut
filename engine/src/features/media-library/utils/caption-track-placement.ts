// SPDX-License-Identifier: MIT

import { DEFAULT_TRACK_HEIGHT } from '../deps/timeline-caption-utils-contract'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import { getCaptionTextItemTemplate, type CaptionTextItemTemplate } from './caption-items'

/**
 * Where transcript captions land on the timeline, and which look new ones take.
 * Captions live on their own tracks above the picture, as caption tracks do in
 * Premiere and Resolve, rather than in whatever video track has room.
 */

const CAPTIONS_TRACK_NAME = 'Captions'

/** A track that holds only subtitle segments, or a still-empty one we named. */
function isCaptionsTrack(track: TimelineTrack, items: readonly TimelineItem[]): boolean {
  if (track.isGroup) return false
  let hasCaption = false
  for (const item of items) {
    if (item.trackId !== track.id) continue
    if (item.type !== 'subtitle') return false
    hasCaption = true
  }
  return hasCaption || track.name.startsWith(CAPTIONS_TRACK_NAME)
}

/** The topmost usable captions track with nothing in `range`. */
export function findCaptionsTrackForRange(
  tracks: readonly TimelineTrack[],
  items: readonly TimelineItem[],
  range: { startFrame: number; endFrame: number },
): TimelineTrack | null {
  const candidates = tracks
    .filter((track) => !track.locked && track.visible !== false && isCaptionsTrack(track, items))
    .sort((a, b) => a.order - b.order)
  return (
    candidates.find(
      (track) =>
        !items.some(
          (item) =>
            item.trackId === track.id &&
            item.from < range.endFrame &&
            item.from + item.durationInFrames > range.startFrame,
        ),
    ) ?? null
  )
}

/** A new captions track above every other, so captions draw over the picture. */
export function buildCaptionsTrack(tracks: readonly TimelineTrack[]): TimelineTrack {
  const topOrder = tracks.reduce((lowest, track) => Math.min(lowest, track.order), 0)
  const taken = new Set(tracks.map((track) => track.name))
  let name = CAPTIONS_TRACK_NAME
  for (let n = 2; taken.has(name); n += 1) name = `${CAPTIONS_TRACK_NAME} ${n}`
  return {
    id: `track-captions-${crypto.randomUUID()}`,
    name,
    kind: 'video',
    height: DEFAULT_TRACK_HEIGHT,
    locked: false,
    syncLock: true,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order: topOrder - 1,
    items: [],
  }
}

/**
 * The look of the project's transcript captions: new captions match the last
 * ones placed, so restyling once carries over to every clip captioned after.
 */
export function resolveProjectCaptionStyle(
  items: readonly TimelineItem[],
): CaptionTextItemTemplate | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!
    if (item.type === 'subtitle' && item.source.type === 'transcript') {
      return getCaptionTextItemTemplate(item)
    }
  }
  return undefined
}
