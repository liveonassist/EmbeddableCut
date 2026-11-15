// SPDX-License-Identifier: MIT

/**
 * Moving a local asset to the URL its host uploaded it to, in place: the
 * same id, so every clip using it is untouched, and the same metadata,
 * thumbnail and caches, since the bytes are the same. Readers move over the
 * way they do when a signed URL is renewed.
 */

import type { MediaMetadata, RemoteMediaSource } from '@/types/storage'
import { updateMedia as updateMediaDB } from '@/infrastructure/storage'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import { getWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { useMediaLibraryStore } from '../stores/media-library-store'
import { releaseSessionMedia } from './session-media'

/** @throws when there is no such media, or it's at a URL already. */
export async function relocateMediaToUrl(
  mediaId: string,
  remote: RemoteMediaSource,
): Promise<MediaMetadata> {
  const media = useMediaLibraryStore.getState().mediaById[mediaId]
  if (!media) throw new Error(`No media ${mediaId} in the project`)
  if (media.storageType === 'url') throw new Error(`Media ${mediaId} is at a URL already`)

  const moved: MediaMetadata = {
    ...media,
    storageType: 'url',
    remote,
    fileHandle: undefined,
    opfsPath: undefined,
    updatedAt: Date.now(),
  }
  // A workspace keeps its copy of the bytes; its record now points at the URL.
  if (media.storageType !== 'memory' && getWorkspaceRoot()) {
    await updateMediaDB(mediaId, {
      storageType: 'url',
      remote,
      fileHandle: undefined,
      opfsPath: undefined,
      updatedAt: moved.updatedAt,
    })
  }

  useMediaLibraryStore.setState((state) => ({
    mediaById: { ...state.mediaById, [mediaId]: moved },
    mediaItems: state.mediaItems.map((item) => (item.id === mediaId ? moved : item)),
  }))
  // Readers holding the local URL re-resolve, now to the remote one.
  blobUrlManager.invalidate(mediaId)
  releaseSessionMedia(mediaId)
  return moved
}
