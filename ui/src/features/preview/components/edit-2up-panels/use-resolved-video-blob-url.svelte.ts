// SPDX-License-Identifier: MIT

import { resolveMediaUrl, resolveProxyUrl } from '@/features/preview/utils/media-resolver'
import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'

/** The proxy (or source) URL an edit-overlay frame reads `mediaId` from. */
export function useResolvedVideoBlobUrl(getMediaId: () => string | undefined): {
  readonly current: string | null
} {
  const mediaId = $derived(getMediaId())
  let blobUrl = $state.raw<string | null>(null)
  const blobUrlVersion = useBlobUrlVersion()
  let requestKey: string | null = null

  $effect(() => {
    void blobUrlVersion.current

    let cancelled = false
    const nextRequestKey = `${mediaId ?? 'none'}:proxy-first`
    if (requestKey !== nextRequestKey) {
      requestKey = nextRequestKey
      blobUrl = null
    }

    if (!mediaId) {
      return () => {
        cancelled = true
      }
    }

    const proxyUrl = resolveProxyUrl(mediaId)
    if (proxyUrl) {
      blobUrl = proxyUrl
      return () => {
        cancelled = true
      }
    }

    resolveMediaUrl(mediaId)
      .then((url) => {
        if (cancelled) return
        blobUrl = url || null
      })
      .catch(() => {
        if (cancelled) return
        blobUrl = null
      })

    return () => {
      cancelled = true
    }
  })

  return {
    get current() {
      return blobUrl
    },
  }
}
