// SPDX-License-Identifier: MIT

/**
 * Opening a gap in the timeline for something to be inserted into, as an
 * insert edit does, but across every track, so what's linked to a clip or laid
 * over it moves with it.
 */

import { useSelectionStore } from '@/shared/state/selection'
import { isTrackSyncLockEnabled } from '../../utils/track-sync-lock'
import { useItemsStore } from '../items-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import { splitItem } from './edit/split-actions'
import { applyTransitionRepairs, execute } from './shared'

/**
 * Opens `length` frames at `frame`. Clips on `targetTrackIds` that run through
 * `frame` are split there, with what's linked to them; then everything that
 * starts at or after it moves later, on the targets and on every track that
 * ripples (not locked, sync lock on). What runs through `frame` on other
 * tracks, such as a music bed, stays whole. Records its own undo steps, which
 * a caller doing more folds into one.
 *
 * @returns false when a target is locked, or what runs through `frame` can't
 *   be split there (inside a transition).
 */
export function insertSpace(
  frame: number,
  length: number,
  targetTrackIds: readonly string[],
): boolean {
  const { tracks } = useItemsStore.getState()
  const targets = new Set(targetTrackIds)
  if (tracks.some((track) => targets.has(track.id) && track.locked)) return false

  const runsThrough = () =>
    useItemsStore
      .getState()
      .items.filter(
        (item) =>
          targets.has(item.trackId) &&
          item.from < frame &&
          item.from + item.durationInFrames > frame,
      )
  // Splitting selects what it split, which nobody asked for here.
  const { selectedItemIds } = useSelectionStore.getState()
  for (const item of runsThrough()) {
    // Split already, as the companion of one before it.
    if (!runsThrough().some((candidate) => candidate.id === item.id)) continue
    if (!splitItem(item.id, frame)) return false
    useSelectionStore.getState().selectItems(selectedItemIds)
  }

  const moving = new Set(
    tracks
      .filter((track) => targets.has(track.id) || isTrackSyncLockEnabled(track))
      .map((track) => track.id),
  )
  execute(
    'INSERT_SPACE',
    () => {
      const updates = useItemsStore
        .getState()
        .items.filter((item) => moving.has(item.trackId) && item.from >= frame)
        .map((item) => ({ id: item.id, from: item.from + length }))
      if (updates.length === 0) return
      useItemsStore.getState()._moveItems(updates)
      applyTransitionRepairs(updates.map((update) => update.id))
      useTimelineSettingsStore.getState().markDirty()
    },
    { frame, length },
  )
  return true
}
