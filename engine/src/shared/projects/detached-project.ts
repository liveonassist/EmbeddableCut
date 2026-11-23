// SPDX-License-Identifier: MIT

/**
 * The open project that isn't a workspace's: one loaded from a document,
 * which its host keeps. It has no project.json, so a change to its settings
 * is made in the stores alone and reaches storage when the host saves.
 */

let detachedId: string | null = null

/** Names the open project as a document's; `null` when it's a workspace's, or none is open. */
export function setDetachedProject(id: string | null): void {
  detachedId = id
}

export function isDetachedProject(id: string): boolean {
  return detachedId === id
}
