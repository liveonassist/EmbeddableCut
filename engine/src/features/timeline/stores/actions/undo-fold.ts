// SPDX-License-Identifier: MIT

import { captureSnapshot } from '../commands/snapshot'
import { useTimelineCommandStore } from '../timeline-command-store'

/**
 * Runs `fn`, which may call any number of timeline actions, and folds the undo
 * steps they record into one. For workflows built from several actions that
 * the user sees as a single edit, such as placing generated captions.
 */
export function asOneUndoStep<T>(type: string, fn: () => T): T {
  const before = captureSnapshot()
  // Matched by identity rather than by stack depth: the history cap can drop
  // entries from the front while `fn` runs.
  const lastBefore = useTimelineCommandStore.getState().undoStack.at(-1)
  try {
    return fn()
  } finally {
    const { undoStack } = useTimelineCommandStore.getState()
    const keep = lastBefore ? undoStack.lastIndexOf(lastBefore) + 1 : 0
    if (undoStack.length > keep) {
      useTimelineCommandStore.setState({ undoStack: undoStack.slice(0, keep) })
      useTimelineCommandStore.getState().addUndoEntry({ type }, before)
    }
  }
}
