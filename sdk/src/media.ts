// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@embeddablecut/engine/types/storage'
import type { AssetRecord } from '@embeddablecut/engine/schema/index'
import { assetRecordFromMedia } from '@embeddablecut/engine/schema/index'
import { useMediaLibraryStore } from '@embeddablecut/engine/features/media-library/stores/media-library-store'
import { mediaLibraryService } from '@embeddablecut/engine/features/media-library/services/media-library-service'
import {
  adoptRemoteMedia,
  isRemoteUrlFresh,
  resolveRemoteMediaUrl,
  type RemoteMediaResolver,
} from '@embeddablecut/engine/features/media-library/services/remote-media'
import {
  MediaRefusedError,
  type MediaAcceptPolicy,
} from '@embeddablecut/engine/features/media-library/services/media-accept-policy'
import { relocateMediaToUrl } from '@embeddablecut/engine/features/media-library/services/media-relocation'
import { getObjectUrlSourceMetadata } from '@embeddablecut/engine/infrastructure/browser/object-url-registry'
import { EditorError } from './errors'

export type {
  MediaAcceptPolicy,
  MediaCandidate,
} from '@embeddablecut/engine/features/media-library/services/media-accept-policy'

import {
  cacheKeyForUrl,
  createRemoteFetch,
  seedRemoteMediaCache,
} from '@embeddablecut/engine/infrastructure/remote-media/remote-fetch'

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
  /**
   * The URL can be fetched as it is, so the resolver isn't asked for it until
   * it's about to expire or a server refuses it. A URL whose `expiresAt` is
   * comfortably ahead is taken as fetchable unless this says `false`, which a
   * host whose resolver adds headers or credentials sets.
   */
  fetchable?: boolean
}

export interface AddUrlsOptions {
  /** How many are probed at once; 6 by default, as many as a browser opens to one server. */
  concurrency?: number
  /** Called as each is added or fails, with how many are done. */
  onProgress?: (done: number, total: number) => void
}

/** One of `addUrls`: the asset it became, or why it couldn't be added. */
export type AddUrlResult =
  | { asset: AssetRecord; error?: undefined }
  | { asset?: undefined; error: Error }

const DEFAULT_ADD_CONCURRENCY = 6

/** Which kinds of media the host lets the editor use. Both are on by default. */
export interface MediaSourcePolicy {
  /**
   * Files from the user's disk: copied into or linked from the workspace, or,
   * without one, held in memory until the host uploads them.
   */
  local: boolean
  /** Remote URLs, streamed in place. */
  url: boolean
}

/** How the host decides which files from disk become media. */
export interface MediaAcceptOptions {
  /**
   * Checked for every file added from disk, by the host or the user, once
   * it's probed and before anything is stored: `true` accepts it, a string
   * refuses it and is shown to the user as the reason.
   */
  accept?: MediaAcceptPolicy
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

interface ProbedUrl {
  media: MediaMetadata
  resolved: ResolvedMediaSource | null
}

/** Whether a URL asset's server still serves it: one byte, past every cache. */
async function isReadable(media: MediaMetadata): Promise<boolean> {
  try {
    const url = await resolveRemoteMediaUrl(media)
    const remote = getObjectUrlSourceMetadata(url)?.remote ?? { cacheKey: cacheKeyForUrl(url) }
    const response = await createRemoteFetch({ ...remote, noCache: true })(url, {
      headers: { Range: 'bytes=0-0' },
    })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}

export class MediaApi {
  constructor(
    private readonly policy: MediaSourcePolicy,
    private readonly requireProject: () => { id: string },
    private readonly resolver: RemoteMediaResolver,
    private readonly referencedIds: () => Set<string>,
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
   * original file and asks for permission again in later sessions. Without a
   * workspace, both hold the file in memory. Files the accept policy refuses
   * are left out, with a notification saying why.
   *
   * @throws {EditorError} `MEDIA_SOURCE_DISABLED` or `NO_PROJECT`.
   */
  async importFiles(
    handles: FileSystemFileHandle[],
    options: { storageMode?: 'copy' | 'link' } = {},
  ): Promise<AssetRecord[]> {
    this.requireLocal()
    this.requireProject()
    const imported = await useMediaLibraryStore.getState().importHandles(handles, options)
    return imported.map(assetRecordFromMedia)
  }

  /**
   * Adds files' bytes as media, probed and prepared as dropped files are:
   * copied into the workspace, or held in memory when the editor has none
   * (`source.type: 'memory'`). Either way they're pending until the host
   * uploads them and calls {@link replaceWithUrl}. A file already in the
   * library by name and size comes back as the existing asset.
   *
   * @throws {EditorError} `MEDIA_REFUSED` at the first file the accept policy
   *   refuses (the files before it stay added), `MEDIA_SOURCE_DISABLED` or `NO_PROJECT`.
   */
  async addFiles(files: File[]): Promise<AssetRecord[]> {
    this.requireLocal()
    const project = this.requireProject()
    const added: AssetRecord[] = []
    for (const file of files) {
      let media
      try {
        media = await mediaLibraryService.importMediaFile(file, project.id)
      } catch (error) {
        if (!(error instanceof MediaRefusedError)) throw error
        throw new EditorError('MEDIA_REFUSED', error.message, {
          fileName: error.fileName,
          reason: error.reason,
        })
      }
      const { isDuplicate: _duplicate, hasUnsupportedCodec: _unsupported, ...metadata } = media
      if (!useMediaLibraryStore.getState().mediaById[metadata.id]) {
        useMediaLibraryStore.getState().prependMediaItem(metadata)
      }
      added.push(assetRecordFromMedia(metadata))
    }
    return added
  }

  /**
   * The assets the timeline uses that aren't at a URL yet: what a host
   * uploads before it saves the project somewhere another session reads it.
   */
  pending(): AssetRecord[] {
    const referenced = this.referencedIds()
    return this.list().filter((asset) => asset.source.type !== 'url' && referenced.has(asset.id))
  }

  /**
   * An asset's bytes: a local one's file, for uploading it. A URL asset is
   * fetched whole.
   *
   * @throws {EditorError} `MEDIA_NOT_FOUND` when there's no such asset or its
   *   bytes can't be read.
   */
  async read(id: string): Promise<Blob> {
    this.requireProject()
    const media = useMediaLibraryStore.getState().mediaById[id]
    const blob = media ? await mediaLibraryService.getMediaFile(media) : null
    if (!blob) throw new EditorError('MEDIA_NOT_FOUND', `No readable media ${id} in the project`)
    return blob
  }

  /**
   * Points a local asset at the URL the host uploaded it to. It keeps its id,
   * so the clips using it are untouched, and everything already extracted
   * from it: nothing is probed again. Readers move to the URL, through the
   * host's resolver, as they do when a signed URL renews.
   *
   * @throws {EditorError} `MEDIA_NOT_FOUND` when there's no such local asset,
   *   `MEDIA_SOURCE_DISABLED` when URL media is off, or `NO_PROJECT`.
   */
  async replaceWithUrl(id: string, media: UrlMedia): Promise<AssetRecord> {
    if (!this.policy.url) {
      throw new EditorError('MEDIA_SOURCE_DISABLED', 'This editor does not accept URL media')
    }
    this.requireProject()
    const current = useMediaLibraryStore.getState().mediaById[id]
    if (!current || current.storageType === 'url') {
      throw new EditorError('MEDIA_NOT_FOUND', `No local media ${id} in the project`)
    }
    // The bytes are the ones just uploaded: reading the URL needn't fetch them again.
    const bytes = await this.read(id).catch(() => null)
    if (bytes) await seedRemoteMediaCache(media.key ?? cacheKeyForUrl(media.url), bytes)
    const moved = await relocateMediaToUrl(id, {
      url: media.url,
      ...(media.expiresAt === undefined ? {} : { expiresAt: media.expiresAt }),
      ...(media.key === undefined ? {} : { key: media.key }),
    })
    return assetRecordFromMedia(moved)
  }

  /**
   * Adds remote media by reference. It's probed with a few range requests,
   * never downloaded whole, and preview, export and server renders read it
   * from its URL. The server must allow CORS and should support `Range`.
   *
   * @throws {EditorError} `MEDIA_SOURCE_DISABLED` or `NO_PROJECT`.
   */
  async addUrl(media: UrlMedia): Promise<AssetRecord> {
    const probed = await this.probeUrl(media)
    this.register([probed])
    return assetRecordFromMedia(probed.media)
  }

  /**
   * Adds many URLs, several probed at once, in the order given: the first is
   * the first in the media library. One that can't be read doesn't stop the
   * others; its result carries the error.
   *
   * @throws {EditorError} `MEDIA_SOURCE_DISABLED` or `NO_PROJECT`.
   */
  async addUrls(media: UrlMedia[], options: AddUrlsOptions = {}): Promise<AddUrlResult[]> {
    const project = this.requireUrlProject()
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_ADD_CONCURRENCY)
    const probes: Array<ProbedUrl | Error> = []
    let next = 0
    let done = 0
    const probeRest = async () => {
      while (next < media.length) {
        const index = next++
        try {
          probes[index] = await this.probeUrl(media[index]!)
        } catch (error) {
          probes[index] = error instanceof Error ? error : new Error(String(error))
        }
        options.onProgress?.(++done, media.length)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, media.length) }, probeRest))
    if (this.requireProject().id !== project.id) {
      throw new EditorError('NO_PROJECT', 'The project was closed while its media was being added')
    }

    // The library lists the newest first.
    const addedAt = Date.now()
    this.register(
      probes
        .map((probe, index) =>
          probe instanceof Error
            ? null
            : { ...probe, media: { ...probe.media, createdAt: addedAt - index } },
        )
        .filter((probe) => probe !== null),
    )
    return probes.map((probe) =>
      probe instanceof Error ? { error: probe } : { asset: this.get(probe.media.id)! },
    )
  }

  /**
   * Checks that the project's URL assets can be read, asking the resolver for
   * those it hasn't been asked about, and returns the ones that can't. They
   * show as missing in the editor; the rest stop doing so. For a project
   * opened long after it was saved, whose media may be gone.
   */
  async findMissing(): Promise<AssetRecord[]> {
    this.requireProject()
    const library = useMediaLibraryStore.getState()
    const missing: AssetRecord[] = []
    const queue = library.mediaItems.filter((item) => item.storageType === 'url')
    const checkRest = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (await isReadable(item)) {
          library.markMediaHealthy(item.id)
          continue
        }
        library.markMediaBroken(item.id, {
          mediaId: item.id,
          fileName: item.fileName,
          errorType: 'file_missing',
        })
        missing.push(assetRecordFromMedia(item))
      }
    }
    await Promise.all(Array.from({ length: DEFAULT_ADD_CONCURRENCY }, checkRest))
    return missing
  }

  private requireUrlProject(): { id: string } {
    if (!this.policy.url) {
      throw new EditorError('MEDIA_SOURCE_DISABLED', 'This editor does not accept URL media')
    }
    return this.requireProject()
  }

  /** Probes a URL into media, without putting it in the library. */
  private async probeUrl(media: UrlMedia): Promise<ProbedUrl> {
    const project = this.requireUrlProject()
    const { fetchable, ...source } = media
    const fresh = fetchable ?? (media.expiresAt !== undefined && isRemoteUrlFresh(media.expiresAt))
    // Probe with what the host's resolver would hand a reader: its URL and headers.
    const draft = {
      id: 'probe',
      storageType: 'url',
      remote: { url: media.url, expiresAt: media.expiresAt, key: media.key },
      fileName: media.fileName ?? media.url,
      mimeType: media.mimeType ?? '',
    } as MediaMetadata
    const resolved = fresh ? null : await this.resolver(draft, 'open')
    const imported = await mediaLibraryService.importMediaByReference(
      {
        ...source,
        url: resolved?.url ?? media.url,
        ...(resolved?.expiresAt === undefined ? {} : { expiresAt: resolved.expiresAt }),
        request: {
          ...(resolved?.headers ? { headers: resolved.headers } : {}),
          ...(resolved?.credentials ? { credentials: resolved.credentials } : {}),
        },
      },
      project.id,
    )
    return { media: imported, resolved }
  }

  /** Puts probed media in the library, first first, on the sources it was probed with. */
  private register(probed: ProbedUrl[]): void {
    const added = probed.map((probe) => probe.media)
    useMediaLibraryStore.setState((state) => ({ mediaItems: [...added, ...state.mediaItems] }))
    for (const probe of probed) adoptRemoteMedia(probe.media, probe.resolved)
  }

  private requireLocal(): void {
    if (!this.policy.local) {
      throw new EditorError('MEDIA_SOURCE_DISABLED', 'This editor does not accept local files')
    }
  }

  /** Removes media from the project, with every clip that uses it. */
  async remove(ids: string[]): Promise<void> {
    this.requireProject()
    await useMediaLibraryStore.getState().deleteMediaBatch(ids)
  }
}
