// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@/types/storage'
import { bindStoreHook } from '@/shared/state/bound-store'
import {
  useFilteredMediaItems as computeFilteredMediaItems,
  useMediaLibraryStore,
} from '@/features/media-library/stores/media-library-store'
import { select, shallow } from '$lib/store.svelte'

/**
 * The Svelte twin of the engine's `useFilteredMediaItems` hook: the library's
 * items after search, type filter and sort. Re-derives only when one of those
 * inputs changes. The engine's hook is run as-is, through a one-shot store
 * binding that reads snapshots, so the filtering stays the engine's.
 */
export function useFilteredMediaItems(): { readonly current: MediaMetadata[] } {
  const inputs = select(
    useMediaLibraryStore,
    (s) => ({
      mediaItems: s.mediaItems,
      searchQuery: s.searchQuery,
      filterByType: s.filterByType,
      sortBy: s.sortBy,
    }),
    shallow,
  )
  const filtered = $derived.by(() => {
    void inputs.current
    bindStoreHook((api, selector) => selector(api.getState() as never))
    try {
      return computeFilteredMediaItems()
    } finally {
      bindStoreHook(null)
    }
  })
  return {
    get current() {
      return filtered
    },
  }
}
