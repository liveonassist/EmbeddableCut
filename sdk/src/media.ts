// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@embeddablecut/engine/types/storage'
import type { AssetRecord } from '@embeddablecut/engine/schema/index'
import { assetRecordFromMedia } from '@embeddablecut/engine/schema/index'
import { useMediaLibraryStore } from '@embeddablecut/engine/features/media-library/stores/media-library-store'
import { mediaLibraryService } from '@embeddablecut/engine/features/media-library/services/media-library-service'
import type { RemoteMediaResolver } from '@embeddablecut/engine/features/media-library/services/remote-media'
import { getWorkspaceRoot } from '@embeddablecut/engine/infrastructure/storage/workspace-fs/root'
import { EditorError } from './errors'

export {
  /** Empties the shared cache of URL media blocks, for every asset and tab. */
  clearRemoteMediaCache as clearUrlMediaCache,
  /** Caps that cache in bytes (2 GiB by default); whole assets are evicted, oldest first. */
  setRemoteMediaCacheBudget as setUrlMediaCacheBudget,
} from '@embeddablecut/engine/infrastructure/remote-media/remote-fetch'

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
  /**
   * `open` before first use, `expiring` shortly before `expiresAt`, `refused`
   * when the server answered 401 or 403.
   */
  resolve(asset: AssetRecord, reason: MediaResolveReason): Promise<ResolvedMediaSource>
}

export type MediaResolveReason = 'open' | 'expiring' | 'refused'

/** Resolves any URL asset; the editor's own, before media providers are asked. */
export type MediaResolver = (
  asset: AssetRecord,
  reason: MediaResolveReason,
) => Promise<ResolvedMediaSource | null>

/** A URL to add as media, read in place. */
export interface UrlMedia {
  url: string
  fileName?: string
  mimeType?: string
  /**
   * Stable identity a resolver renews the URL from, and the range cache's key.
   * Prefix it with a provider's id (`acme:clip-42`) to route it there.
   */
  key?: string
  /** Epoch milliseconds the URL stops working at, for signed URLs. */
  expiresAt?: number
}

/** Which kinds of media the host lets the editor use. Both are on by default. */
export interface MediaSourcePolicy {
  /** Files from the user's disk, copied into or linked from the workspace. */
  local: boolean
  /** Remote URLs, streamed in place. */
  url: boolean
}

/**
 * The engine's resolver for URL assets: the host's `resolve` first, then the
 * media provider whose id prefixes the asset's key.
 */
export function createRemoteResolver(
  resolve: MediaResolver | undefined,
  providers: () => MediaProvider[],
): RemoteMediaResolver {
  return async (media: MediaMetadata, reason) => {
    const asset = assetRecordFromMedia(media)
    const own = resolve ? await resolve(asset, reason) : null
    if (own) return own
    const key = media.remote?.key
    const provider = key ? providers().find((p) => key.startsWith(`${p.id}:`)) : undefined
    return provider ? provider.resolve(asset, reason) : null
  }
}

export class MediaApi {
  constructor(
    private readonly policy: MediaSourcePolicy,
    private readonly requireProject: () => { id: string },
    private readonly resolver: RemoteMediaResolver,
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

  /**
   * Adds remote media by reference. It's probed with a few range requests,
   * never downloaded whole, and preview, export and server renders read it
   * from its URL. The server must allow CORS and should support `Range`.
   *
   * @throws {EditorError} `MEDIA_SOURCE_DISABLED` or `NO_PROJECT`.
   */
  async addUrl(media: UrlMedia): Promise<AssetRecord> {
    if (!this.policy.url) {
      throw new EditorError('MEDIA_SOURCE_DISABLED', 'This editor does not accept URL media')
    }
    const project = this.requireProject()
    // Probe with what the host's resolver would hand a reader: its URL and headers.
    const draft = {
      id: 'probe',
      storageType: 'url',
      remote: { url: media.url, expiresAt: media.expiresAt, key: media.key },
      fileName: media.fileName ?? media.url,
      mimeType: media.mimeType ?? '',
    } as MediaMetadata
    const resolved = await this.resolver(draft, 'open')
    const imported = await mediaLibraryService.importMediaByReference(
      {
        ...media,
        url: resolved?.url ?? media.url,
        ...(resolved?.expiresAt === undefined ? {} : { expiresAt: resolved.expiresAt }),
        request: {
          ...(resolved?.headers ? { headers: resolved.headers } : {}),
          ...(resolved?.credentials ? { credentials: resolved.credentials } : {}),
        },
      },
      project.id,
    )
    useMediaLibraryStore.getState().prependMediaItem(imported)
    return assetRecordFromMedia(imported)
  }

  /** Removes media from the project, with every clip that uses it. */
  async remove(ids: string[]): Promise<void> {
    this.requireProject()
    await useMediaLibraryStore.getState().deleteMediaBatch(ids)
  }
}
