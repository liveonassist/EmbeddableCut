// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@/types/storage'

/**
 * Media the library store holds but the workspace may not: URL media, and
 * whatever a project document brought. The store installs the lookup, so the
 * service can consult it without importing the store.
 */
let lookup: ((id: string) => MediaMetadata | undefined) | null = null

export function setLibraryMediaLookup(next: typeof lookup): void {
  lookup = next
}

export function findLibraryMedia(id: string): MediaMetadata | null {
  return lookup?.(id) ?? null
}
