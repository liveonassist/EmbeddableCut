// SPDX-License-Identifier: MIT

/**
 * UI half of `media-library-contract`: the engine's contract exposes these two
 * as React-style store hooks, so the Svelte reads live here, over `select`.
 */

import { select } from '$lib/store.svelte'
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import type { MediaMetadata } from '@/types/storage'

/** The metadata of `mediaId`, read as `current`. */
export function useMediaMetadataById(mediaId: () => string | undefined): {
  readonly current: MediaMetadata | undefined
} {
  const mediaById = select(useMediaLibraryStore, (state) => state.mediaById)
  return {
    get current() {
      const id = mediaId()
      return id ? mediaById.current[id] : undefined
    },
  }
}

export function useBrokenMediaIds(): { readonly current: string[] } {
  return select(useMediaLibraryStore, (state) => state.brokenMediaIds)
}
