// SPDX-License-Identifier: MIT
// oxlint-disable react/immutability, react/refs -- React Compiler rules: these $state writes and ref reads run in handlers and $effects, not a render

import { untrack } from 'svelte'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'

interface UseMediaBlobUrlResult {
  readonly blobUrl: string | null
  setBlobUrl: (nextUrl: string | null) => void
  hasStartedLoadingRef: { current: boolean }
  readonly blobUrlVersion: number
}

/**
 * Shared blob URL state used by timeline media components.
 *
 * Handles:
 * - initialization from BlobUrlManager
 * - mediaId change resets
 * - blob URL invalidation sync keyed on manager version
 */
export function useMediaBlobUrl(mediaId: () => string): UseMediaBlobUrlResult {
  const initialBlobUrl = blobUrlManager.get(untrack(mediaId))
  let blobUrlState = $state<string | null>(initialBlobUrl)
  const hasStartedLoadingRef = { current: false }
  const lastMediaIdRef = { current: null } as { current: string | null }
  const lastBlobUrlRef = { current: initialBlobUrl } as { current: string | null }
  const blobUrlVersion = useBlobUrlVersion()

  const setBlobUrl = (nextUrl: string | null) => {
    lastBlobUrlRef.current = nextUrl
    blobUrlState = nextUrl
  }

  // Reset loading state when mediaId changes (e.g., after relinking/orphan repair).
  $effect(() => {
    const id = mediaId()
    untrack(() => {
      if (lastMediaIdRef.current !== null && lastMediaIdRef.current !== id) {
        hasStartedLoadingRef.current = false
        const nextUrl = blobUrlManager.get(id)
        lastBlobUrlRef.current = nextUrl
        blobUrlState = nextUrl
      }
      lastMediaIdRef.current = id
    })
  })

  // Keep local state aligned with centralized blob URL invalidations.
  $effect(() => {
    const id = mediaId()
    void blobUrlVersion.current
    untrack(() => {
      const cached = blobUrlManager.get(id)
      if (cached !== lastBlobUrlRef.current) {
        lastBlobUrlRef.current = cached
        blobUrlState = cached
      }
      if (cached === null) {
        hasStartedLoadingRef.current = false
      }
    })
  })

  return {
    get blobUrl() {
      return blobUrlState
    },
    setBlobUrl,
    hasStartedLoadingRef,
    get blobUrlVersion() {
      return blobUrlVersion.current
    },
  }
}
