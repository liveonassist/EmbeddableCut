// SPDX-License-Identifier: MIT

import { getSafeTrimBefore } from '@/runtime/composition-runtime/deps/timeline'
import type { VideoItem } from '@/types/timeline'

type TwinCandidate = Pick<
  VideoItem,
  | 'id'
  | 'mediaId'
  | 'src'
  | 'from'
  | 'durationInFrames'
  | 'speed'
  | 'isReversed'
  | 'sourceStart'
  | 'sourceDuration'
  | 'sourceFps'
>

/**
 * How far apart two clips' places in their source, in source frames, can be and be the same. Splits
 * and trims round to whole source frames, so a split clip is up to half a frame from its copy.
 */
const SOURCE_FRAME_TOLERANCE = 0.5

/**
 * Clips that show the same source frame as another at every moment they're on screen, as a blurred
 * copy behind a clip does, mapped to that other clip. Its `<video>` can stand for theirs.
 *
 * A clip's twin covers all of it, so it never has to find a video of its own part of the way.
 * Clips in `excludedIds` (those in a transition, whose timing it takes over) have none.
 */
export function resolveVideoTwins(
  items: readonly TwinCandidate[],
  timelineFps: number,
  excludedIds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const twins = new Map<string, string>()
  const leadersBySource = new Map<string, { item: TwinCandidate; origin: number }[]>()

  const candidates = items
    .filter((item) => item.src && item.sourceFps && !item.isReversed && !excludedIds.has(item.id))
    .toSorted((a, b) => b.durationInFrames - a.durationInFrames)
  for (const item of candidates) {
    const speed = item.speed ?? 1
    const sourceFps = item.sourceFps!
    const start = getSafeTrimBefore(
      item.sourceStart ?? 0,
      item.durationInFrames,
      speed,
      item.sourceDuration || undefined,
      timelineFps,
      sourceFps,
    )
    // Where in the source the clip would be at the timeline's first frame.
    const origin = start - (item.from * speed * sourceFps) / timelineFps
    const key = `${item.mediaId}\u0000${item.src}\u0000${sourceFps}\u0000${speed}`
    const leaders = leadersBySource.get(key) ?? []
    leadersBySource.set(key, leaders)

    const leader = leaders.find(
      (other) =>
        Math.abs(other.origin - origin) <= SOURCE_FRAME_TOLERANCE &&
        other.item.from <= item.from &&
        other.item.from + other.item.durationInFrames >= item.from + item.durationInFrames,
    )
    if (leader) twins.set(item.id, leader.item.id)
    else leaders.push({ item, origin })
  }
  return twins
}
