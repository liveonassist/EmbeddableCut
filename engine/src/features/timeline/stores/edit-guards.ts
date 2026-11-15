// SPDX-License-Identifier: MIT

/**
 * Edits a host forbids. Every timeline edit runs through the command store's
 * `execute`, which captures the timeline before and after it; an edit that
 * would take an item the host protects off the timeline is rolled back there,
 * whichever path made it: a shortcut, a menu, a drag, or an SDK operation.
 */

import type { TimelineItem } from '@/types/timeline'
import type { TimelineCommand, TimelineSnapshot } from './commands/types'

/** What a guard is told about the edit it judges. */
export interface GuardedEdit {
  /** The command's type, such as `REMOVE_ITEMS`, `RIPPLE_DELETE_ITEMS` or `DELETE_TRACKS`. */
  type: string
}

export interface EditGuards {
  /**
   * Asked when an edit would remove items from the timeline, with every item
   * it removes. Return false to refuse the whole edit. An item an edit
   * trims, splits (the left half keeps its id), cuts a range out of, or moves
   * into a compound clip is still on the timeline, so isn't removed.
   */
  remove?: (items: readonly TimelineItem[], edit: GuardedEdit) => boolean
}

/** A refused edit, as `onEditRefused` reports it. */
export interface RefusedEdit extends GuardedEdit {
  items: readonly TimelineItem[]
}

let guards: EditGuards | null = null
const refusalListeners = new Set<(refusal: RefusedEdit) => void>()

/** Installs the host's guards; `null` allows every edit. */
export function setEditGuards(next: EditGuards | null): void {
  guards = next
}

/** Calls `listener` for each edit a guard refuses; returns the unsubscribe. */
export function onEditRefused(listener: (refusal: RefusedEdit) => void): () => void {
  refusalListeners.add(listener)
  return () => refusalListeners.delete(listener)
}

/** Runs `run` and says whether a guard refused any edit it made. */
export function editRefusedDuring(run: () => void): boolean {
  let refused = false
  const stop = onEditRefused(() => {
    refused = true
  })
  try {
    run()
  } finally {
    stop()
  }
  return refused
}

function itemsById(snapshot: TimelineSnapshot): Map<string, TimelineItem> {
  const byId = new Map<string, TimelineItem>()
  for (const item of snapshot.items) byId.set(item.id, item)
  for (const composition of snapshot.compositions) {
    for (const item of composition.items) byId.set(item.id, item)
  }
  return byId
}

/** The edit that turned `before` into `after`, when the guards refuse it. */
export function findRefusedEdit(
  command: TimelineCommand,
  before: TimelineSnapshot,
  after: TimelineSnapshot,
): RefusedEdit | null {
  const remove = guards?.remove
  if (!remove) return null
  if (before.items === after.items && before.compositions === after.compositions) return null
  const remaining = itemsById(after)
  const removed = [...itemsById(before).values()].filter((item) => !remaining.has(item.id))
  if (removed.length === 0) return null
  const edit = { type: command.type }
  return remove(removed, edit) ? null : { ...edit, items: removed }
}

/**
 * Tells listeners about an edit that was refused and rolled back. A listener
 * may throw to abort whatever made the edit, as the SDK's `apply` does.
 */
export function reportEditRefused(refusal: RefusedEdit): void {
  for (const listener of [...refusalListeners]) listener(refusal)
}
