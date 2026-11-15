import type { MediaStorageType } from '@/types/storage'
import type { RemoteRequestMetadata } from '@/infrastructure/remote-media/remote-fetch'

export interface ObjectUrlSourceMetadata {
  mediaId?: string
  storageType?: MediaStorageType
  fileHandle?: FileSystemFileHandle
  opfsPath?: string
  fileSize?: number
  /** The media's length in seconds, where known. */
  duration?: number
  /** For a remote URL: how to request and cache it, in whichever context reads it. */
  remote?: RemoteRequestMetadata
}

/** What a worker needs to read a URL itself: an OPFS file, or a remote asset's request metadata. */
export type DirectObjectUrlSourceMetadata =
  | { storageType: 'opfs'; opfsPath: string; fileSize?: number }
  | { storageType: 'url'; remote: RemoteRequestMetadata; fileSize?: number }

interface ObjectUrlEntry {
  blob: Blob
  metadata?: ObjectUrlSourceMetadata
}

const entriesByUrl = new Map<string, ObjectUrlEntry>()
const remoteByUrl = new Map<string, ObjectUrlSourceMetadata>()

/** Records how to read a remote media URL, so sources built for it (and workers sent it) know. */
export function registerRemoteUrl(url: string, metadata: ObjectUrlSourceMetadata): void {
  remoteByUrl.set(url, metadata)
}

export function unregisterRemoteUrl(url: string): void {
  remoteByUrl.delete(url)
}

export function registerObjectUrl(
  url: string,
  blob: Blob,
  metadata?: ObjectUrlSourceMetadata,
): void {
  entriesByUrl.set(url, { blob, metadata })
}

export function getObjectUrlBlob(url: string): Blob | null {
  return entriesByUrl.get(url)?.blob ?? null
}

export function getObjectUrlSourceMetadata(url: string): ObjectUrlSourceMetadata | null {
  return entriesByUrl.get(url)?.metadata ?? remoteByUrl.get(url) ?? null
}

/**
 * True while `url` is a live object URL tracked by this context. A `blob:` URL
 * that was persisted into a project (or revoked after the media was deleted)
 * is NOT tracked, so this returns false — callers can use it to avoid handing a
 * dead blob URL to `fetch()` / dotlottie and spamming `net::ERR_FILE_NOT_FOUND`.
 */
export function isLiveObjectUrl(url: string): boolean {
  return entriesByUrl.has(url)
}

export function getObjectUrlDirectFileMetadata(url: string): DirectObjectUrlSourceMetadata | null {
  // Without its cache key and headers, a worker would read a remote asset
  // unauthenticated and miss every block another context cached.
  const remote = remoteByUrl.get(url)
  if (remote?.remote) {
    return { storageType: 'url', remote: remote.remote, fileSize: remote.fileSize }
  }
  const metadata = entriesByUrl.get(url)?.metadata
  if (!metadata?.opfsPath) {
    return null
  }

  return {
    storageType: 'opfs',
    opfsPath: metadata.opfsPath,
    fileSize: metadata.fileSize,
  }
}

export function unregisterObjectUrl(url: string): void {
  entriesByUrl.delete(url)
}

export function clearObjectUrlRegistry(): void {
  entriesByUrl.clear()
}
