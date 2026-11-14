// SPDX-License-Identifier: MIT

import type { AssetRecord } from '@embeddablecut/engine/schema/index'
import { assetRecordFromMedia } from '@embeddablecut/engine/schema/index'
import { useMediaLibraryStore } from '@embeddablecut/engine/features/media-library/stores/media-library-store'
import { getWorkspaceRoot } from '@embeddablecut/engine/infrastructure/storage/workspace-fs/root'
import { EditorError } from './errors'

/** A fetchable form of a URL asset, from the host's resolver. */
export interface ResolvedMediaSource {
  url: string
  /** Epoch milliseconds after which `url` stops working; renewed shortly before. */
  expiresAt?: number
  /**
   * Sent with the engine's own requests (probing, decoding, export, server
   * renders). A preview's `<video>` can't send headers: give it a signed URL,
   * or rely on cookies with `credentials`.
   */
  headers?: Record<string, string>
  credentials?: RequestCredentials
}

/**
 * Resolves URL assets to fetchable sources: signs them, renews them before
 * they expire, adds the host's authentication. An asset belongs to the
 * provider whose `id` prefixes its source `key` (`acme:clip-42` → `acme`).
 */
export interface MediaProvider {
  id: string
  resolve(asset: AssetRecord, reason: 'open' | 'expiring'): Promise<ResolvedMediaSource>
}

/** Which kinds of media the host lets the editor use. Both are on by default. */
export interface MediaSourcePolicy {
  /** Files from the user's disk, copied into or linked from the workspace. */
  local: boolean
  /** Remote URLs, streamed in place. */
  url: boolean
}

export class MediaApi {
  constructor(
    private readonly policy: MediaSourcePolicy,
    private readonly requireProject: () => void,
  ) {}

  /** The current project's media, as portable asset records. */
  list(): AssetRecord[] {
    return useMediaLibraryStore.getState().mediaItems.map(assetRecordFromMedia)
  }

  get(id: string): AssetRecord | null {
    const media = useMediaLibraryStore.getState().mediaById[id]
    return media ? assetRecordFromMedia(media) : null
  }

  /**
   * Imports files from the user's disk, as dropping them on the media library
   * does. `copy` puts the bytes in the workspace; `link` references the
   * original file and asks for permission again in later sessions.
   *
   * @throws {EditorError} `MEDIA_SOURCE_DISABLED`, `WORKSPACE_REQUIRED` or `NO_PROJECT`.
   */
  async importFiles(
    handles: FileSystemFileHandle[],
    options: { storageMode?: 'copy' | 'link' } = {},
  ): Promise<AssetRecord[]> {
    if (!this.policy.local) {
      throw new EditorError('MEDIA_SOURCE_DISABLED', 'This editor does not accept local files')
    }
    if (!getWorkspaceRoot()) {
      throw new EditorError(
        'WORKSPACE_REQUIRED',
        'Importing local files needs a workspace (EditorOptions.workspace)',
      )
    }
    this.requireProject()
    const imported = await useMediaLibraryStore.getState().importHandles(handles, options)
    return imported.map(assetRecordFromMedia)
  }

  /** Removes media from the project, with every clip that uses it. */
  async remove(ids: string[]): Promise<void> {
    this.requireProject()
    await useMediaLibraryStore.getState().deleteMediaBatch(ids)
  }
}
