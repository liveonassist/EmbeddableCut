// SPDX-License-Identifier: MIT

import { getCaptionThumbnailBlob } from '@/features/scene-browser/deps/storage'
import { requestLazyCaptionThumbnail } from '@/features/scene-browser/utils/lazy-thumb'

/**
 * Module-scoped blob URL cache keyed by `thumbRelPath`. Scene Browser rows
 * are virtualized / remount frequently, so loading the same JPEG for every
 * mount would thrash the workspace-fs read path. Entries are evicted by
 * {@link invalidateMediaCaptionThumbBlobs} when the source media is
 * re-analyzed — without that, a blob URL keeps pointing at the pre-reanalyze
 * JPEG content even after the on-disk file changes.
 */
const blobUrlCache = new Map<string, string>()
const pendingLoads = new Map<string, Promise<string | null>>()
// Monotonic version per relPath. Incremented on every invalidation so an
// in-flight loadBlobUrl that started before an invalidate cannot repopulate
// the cache with pre-invalidation bytes.
const versionByKey = new Map<string, number>()

function bumpVersion(key: string): number {
  const next = (versionByKey.get(key) ?? 0) + 1
  versionByKey.set(key, next)
  return next
}

/**
 * Revoke and drop every blob URL tied to a media's caption thumbnails.
 * Callers should invoke this before a re-analysis run so the next render
 * loads the freshly-written JPEG instead of the cached pre-overwrite blob.
 *
 * `thumbRelPaths` is needed for content-keyed thumbnails shared under
 * `content/{hash}/ai/...`, which do not live under a media-specific prefix.
 */
export function invalidateMediaCaptionThumbBlobs(
  mediaId: string,
  thumbRelPaths: readonly (string | undefined)[] = [],
): void {
  const prefix = `media/${mediaId}/cache/ai/captions-thumbs/`
  const explicitKeys = new Set(
    thumbRelPaths.filter((path): path is string => typeof path === 'string' && path.length > 0),
  )
  for (const [key, url] of blobUrlCache) {
    if (key.startsWith(prefix) || explicitKeys.has(key)) {
      URL.revokeObjectURL(url)
      blobUrlCache.delete(key)
      bumpVersion(key)
    }
  }
  for (const key of pendingLoads.keys()) {
    if (key.startsWith(prefix) || explicitKeys.has(key)) {
      pendingLoads.delete(key)
      bumpVersion(key)
    }
  }
}

async function loadBlobUrl(relPath: string): Promise<string | null> {
  const cached = blobUrlCache.get(relPath)
  if (cached) return cached
  const pending = pendingLoads.get(relPath)
  if (pending) return pending

  const startVersion = versionByKey.get(relPath) ?? 0
  const promise = (async () => {
    const blob = await getCaptionThumbnailBlob(relPath)
    if (!blob) return null
    // Invalidation may have run while this read was in flight. In that case
    // the freshly-loaded blob is stale; drop it instead of repopulating the
    // cache with pre-invalidation bytes.
    if ((versionByKey.get(relPath) ?? 0) !== startVersion) return null
    const url = URL.createObjectURL(blob)
    if ((versionByKey.get(relPath) ?? 0) !== startVersion) {
      URL.revokeObjectURL(url)
      return null
    }
    blobUrlCache.set(relPath, url)
    return url
  })()
  pendingLoads.set(relPath, promise)
  try {
    return await promise
  } finally {
    pendingLoads.delete(relPath)
  }
}

interface LazyRequest {
  mediaId: string
  captionIndex: number
  timeSec: number
}

/**
 * Resolve a caption thumbnail `thumbRelPath` to a blob URL. When the
 * persisted path is missing and a `lazy` descriptor is supplied, the
 * generator is queued to seek the source media, capture a JPEG, persist
 * it, and hand the resulting path back to this hook on a subsequent
 * render (via the store patch inside `lazy-thumb.ts`).
 */
export function useCaptionThumbnail(
  thumbRelPath: () => string | undefined,
  lazy: () => LazyRequest | undefined = () => undefined,
): { readonly current: string | null } {
  const initialPath = thumbRelPath()
  let url = $state<string | null>(initialPath ? (blobUrlCache.get(initialPath) ?? null) : null)
  let latestPath = initialPath

  $effect(() => {
    const path = thumbRelPath()
    const request = lazy()
    latestPath = path
    if (path) {
      const cached = blobUrlCache.get(path)
      if (cached) {
        url = cached
        return
      }
      url = null
      void loadBlobUrl(path).then((loaded) => {
        if (latestPath === path) {
          url = loaded
        }
      })
      return
    }

    // No persisted thumbnail — lazy-generate if we know how.
    url = null
    if (!request) return
    let cancelled = false
    void requestLazyCaptionThumbnail(request.mediaId, request.captionIndex, request.timeSec).then(
      (relPath) => {
        if (cancelled || !relPath) return
        void loadBlobUrl(relPath).then((loaded) => {
          if (!cancelled && latestPath === undefined) {
            url = loaded
          }
        })
      },
    )
    return () => {
      cancelled = true
    }
  })

  return {
    get current() {
      return url
    },
  }
}
