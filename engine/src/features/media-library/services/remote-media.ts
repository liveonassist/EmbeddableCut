// SPDX-License-Identifier: MIT

/**
 * URL media on the main thread: which URL each remote asset is read from
 * right now, renewing it through the host's resolver before it expires or
 * when a server refuses it, and keeping every reader (sources, workers, the
 * preview's `<video>` elements) on the current one.
 */

import type { MediaMetadata } from '@/types/storage'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import {
  registerRemoteUrl,
  unregisterRemoteUrl,
} from '@/infrastructure/browser/object-url-registry'
import { getObjectUrlSourceMetadata } from '@/infrastructure/browser/object-url-registry'
import {
  cacheKeyForUrl,
  createRemoteFetch,
  setRemoteUrlHooks,
  type RemoteRequestMetadata,
} from '@/infrastructure/remote-media/remote-fetch'
import { registerKeyframeIndex } from '@/shared/utils/keyframe-index-registry'
import { createLogger } from '@/shared/logging/logger'
import { useMediaLibraryStore } from '../stores/media-library-store'

const logger = createLogger('RemoteMedia')

/** Renew this long before a URL expires, so a read started now finishes on it. */
const RENEW_MARGIN_MS = 5 * 60_000

/** What the host's resolver returns for a URL asset. */
export interface RemoteMediaResolution {
  url: string
  expiresAt?: number
  /** Sent with the engine's own requests; a `<video>` can't send them. */
  headers?: Record<string, string>
  credentials?: RequestCredentials
}

/**
 * Turns a URL asset into a fetchable source: signs it, renews it, or adds
 * authentication. `null` means "use the URL the asset already has".
 */
export type RemoteMediaResolver = (
  media: MediaMetadata,
  reason: 'open' | 'expiring' | 'refused',
) => Promise<RemoteMediaResolution | null>

interface ActiveRemote {
  url: string
  cacheKey: string
  expiresAt?: number
  timer?: ReturnType<typeof setTimeout>
}

let resolver: RemoteMediaResolver | null = null
const active = new Map<string, ActiveRemote>()
const pending = new Map<string, Promise<string>>()

/** Installs the host's resolver; `null` reads every URL asset from the URL it has. */
export function setRemoteMediaResolver(next: RemoteMediaResolver | null): void {
  resolver = next
}

function remoteCacheKeyOf(media: MediaMetadata): string {
  return media.remote?.key ?? cacheKeyForUrl(media.remote?.url ?? media.id)
}

function needsRenewal(entry: ActiveRemote | undefined): boolean {
  return Boolean(entry?.expiresAt && entry.expiresAt - Date.now() < RENEW_MARGIN_MS)
}

async function resolve(
  media: MediaMetadata,
  reason: 'open' | 'expiring' | 'refused',
): Promise<string> {
  if (!media.remote) throw new Error(`Media ${media.id} has no remote source`)
  const previous = active.get(media.id)
  const resolution = resolver ? await resolver(media, reason) : null
  const url = resolution?.url ?? media.remote.url
  const expiresAt = resolution ? resolution.expiresAt : media.remote.expiresAt
  const cacheKey = remoteCacheKeyOf(media)
  const request: RemoteRequestMetadata = {
    cacheKey,
    ...(resolution?.headers ? { headers: resolution.headers } : {}),
    ...(resolution?.credentials ? { credentials: resolution.credentials } : {}),
  }

  if (previous?.timer) clearTimeout(previous.timer)
  if (previous && previous.url !== url) unregisterRemoteUrl(previous.url)
  registerRemoteUrl(url, {
    mediaId: media.id,
    storageType: 'url',
    fileSize: media.fileSize,
    remote: request,
  })
  if (media.keyframeTimestamps?.length) registerKeyframeIndex(url, media.keyframeTimestamps)

  const entry: ActiveRemote = { url, cacheKey, ...(expiresAt === undefined ? {} : { expiresAt }) }
  if (resolver && expiresAt) {
    const delay = Math.max(0, expiresAt - Date.now() - RENEW_MARGIN_MS)
    entry.timer = setTimeout(() => {
      const current = useMediaLibraryStore.getState().mediaById[media.id]
      if (current) void renewRemoteMedia(current, 'expiring')
    }, delay)
  }
  active.set(media.id, entry)

  if (previous?.url !== url) {
    // Readers holding the old URL re-resolve on the version bump.
    if (previous) blobUrlManager.invalidate(media.id)
    blobUrlManager.registerUrl(media.id, url)
    if (url !== media.remote.url || expiresAt !== media.remote.expiresAt) {
      const remote = { ...media.remote, url, ...(expiresAt === undefined ? {} : { expiresAt }) }
      useMediaLibraryStore.setState((state) => {
        const current = state.mediaById[media.id]
        if (!current) return state
        const updated = { ...current, remote }
        return {
          mediaById: { ...state.mediaById, [media.id]: updated },
          mediaItems: state.mediaItems.map((item) => (item.id === media.id ? updated : item)),
        }
      })
    }
  }
  return url
}

function renewRemoteMedia(media: MediaMetadata, reason: 'expiring' | 'refused'): Promise<string> {
  const inFlight = pending.get(media.id)
  if (inFlight) return inFlight
  const request = resolve(media, reason)
    .catch((error) => {
      logger.warn(`Renewing ${media.fileName} failed`, error)
      throw error
    })
    .finally(() => pending.delete(media.id))
  pending.set(media.id, request)
  return request
}

/**
 * The URL to read a URL asset from now: the current one, or a fresh one
 * from the resolver when it's new or about to expire.
 */
export function resolveRemoteMediaUrl(media: MediaMetadata): Promise<string> {
  const entry = active.get(media.id)
  if (entry && !needsRenewal(entry)) return Promise.resolve(entry.url)
  const inFlight = pending.get(media.id)
  if (inFlight) return inFlight
  const request = resolve(media, entry ? 'expiring' : 'open').finally(() =>
    pending.delete(media.id),
  )
  pending.set(media.id, request)
  return request
}

/**
 * A URL asset's whole file, for jobs that need every byte (transcription,
 * analysis, bundles). Playback and rendering never need this: they read ranges.
 */
export async function fetchRemoteMediaFile(media: MediaMetadata): Promise<Blob> {
  const url = await resolveRemoteMediaUrl(media)
  const remote = getObjectUrlSourceMetadata(url)?.remote ?? { cacheKey: remoteCacheKeyOf(media) }
  // As a range, so blocks other readers already fetched come from the cache.
  const response = await createRemoteFetch(remote)(url, { headers: { Range: 'bytes=0-' } })
  if (!response.ok) throw new Error(`Fetching ${media.fileName} failed: HTTP ${response.status}`)
  const blob = await response.blob()
  return blob.type === media.mimeType ? blob : new Blob([blob], { type: media.mimeType })
}

/** Forgets every resolved URL asset, for a project switch or an SDK editor's dispose. */
export function resetRemoteMedia(): void {
  for (const entry of active.values()) {
    if (entry.timer) clearTimeout(entry.timer)
    unregisterRemoteUrl(entry.url)
  }
  active.clear()
  pending.clear()
}

setRemoteUrlHooks({
  currentUrl(cacheKey) {
    for (const entry of active.values()) if (entry.cacheKey === cacheKey) return entry.url
    return null
  },
  async renew(cacheKey) {
    for (const [mediaId, entry] of active) {
      if (entry.cacheKey !== cacheKey) continue
      const media = useMediaLibraryStore.getState().mediaById[mediaId]
      return media && resolver ? renewRemoteMedia(media, 'refused') : null
    }
    return null
  },
})
