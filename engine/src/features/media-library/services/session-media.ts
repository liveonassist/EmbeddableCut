// SPDX-License-Identifier: MIT

/**
 * Media held in memory, for an editor with no workspace to copy files into.
 * Its bytes and its metadata live here for the page's lifetime: nothing
 * survives a reload, and a host that wants to keep the media uploads it and
 * swaps the asset to its URL.
 */

import type { MediaMetadata } from '@/types/storage'

const held = new Map<string, { media: MediaMetadata; blob: Blob }>()

export function holdSessionMedia(media: MediaMetadata, blob: Blob): void {
  held.set(media.id, { media, blob })
}

export function getSessionMedia(id: string): MediaMetadata | null {
  return held.get(id)?.media ?? null
}

export function getSessionMediaBlob(id: string): Blob | null {
  return held.get(id)?.blob ?? null
}

/** A held file with this name and size, as the workspace's duplicate check finds one. */
export function findSessionMedia(fileName: string, fileSize: number): MediaMetadata | null {
  for (const { media } of held.values()) {
    if (media.fileName === fileName && media.fileSize === fileSize) return media
  }
  return null
}

export function releaseSessionMedia(id: string): void {
  held.delete(id)
}

export function clearSessionMedia(): void {
  held.clear()
}
