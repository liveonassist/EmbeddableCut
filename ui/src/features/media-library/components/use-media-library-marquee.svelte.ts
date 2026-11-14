// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@/types/storage'
import {
  useMarqueeSelection,
  type MarqueeItem,
} from '@/shared/marquee/use-marquee-selection.svelte'

interface UseMediaLibraryMarqueeParams {
  compositions: ReadonlyArray<{ id: string }>
  filteredMediaItems: MediaMetadata[]
  selectedMediaIds: string[]
  selectedCompositionIds: string[]
  scrollContainer: HTMLDivElement | null
  setSelection: (selection: { mediaIds: string[]; compositionIds: string[] }) => void
}

function toRect(element: Element | null | undefined) {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * Marquee (drag-rectangle) selection for the media library grid, including the
 * live preview highlight applied directly to media/composition card DOM nodes
 * (bypassing the component tree for throttled per-frame updates). Commits the
 * final selection to the media-library store.
 */
export function useMediaLibraryMarquee(params: () => UseMediaLibraryMarqueeParams) {
  const previewAssetIds: { current: string[] } = { current: [] }

  const setPreviewAssetIds = (ids: string[]) => {
    const container = params().scrollContainer
    if (!container) {
      previewAssetIds.current = ids
      return
    }

    const nextIds = new Set(ids)
    for (const previousId of previewAssetIds.current) {
      if (nextIds.has(previousId)) {
        continue
      }

      if (previousId.startsWith('media:')) {
        container
          .querySelector(`[data-media-id="${previousId.slice('media:'.length)}"]`)
          ?.classList.remove('media-marquee-preview')
      } else if (previousId.startsWith('composition:')) {
        container
          .querySelector(`[data-composition-id="${previousId.slice('composition:'.length)}"]`)
          ?.classList.remove('composition-marquee-preview')
      }
    }

    const previousIds = new Set(previewAssetIds.current)
    for (const id of ids) {
      if (previousIds.has(id)) {
        continue
      }

      if (id.startsWith('media:')) {
        container
          .querySelector(`[data-media-id="${id.slice('media:'.length)}"]`)
          ?.classList.add('media-marquee-preview')
      } else if (id.startsWith('composition:')) {
        container
          .querySelector(`[data-composition-id="${id.slice('composition:'.length)}"]`)
          ?.classList.add('composition-marquee-preview')
      }
    }

    previewAssetIds.current = ids
  }

  $effect(() => {
    return () => {
      setPreviewAssetIds([])
    }
  })

  const marqueeItems: MarqueeItem[] = $derived.by(() => {
    const { compositions, filteredMediaItems } = params()
    const container = () => params().scrollContainer
    return [
      ...compositions.map((composition) => ({
        id: `composition:${composition.id}`,
        getBoundingRect: () =>
          toRect(container()?.querySelector(`[data-composition-id="${composition.id}"]`)),
      })),
      ...filteredMediaItems.map((media) => ({
        id: `media:${media.id}`,
        getBoundingRect: () => toRect(container()?.querySelector(`[data-media-id="${media.id}"]`)),
      })),
    ]
  })
  const committedSelectionIds = $derived.by(() => {
    const { selectedCompositionIds, selectedMediaIds } = params()
    return [
      ...selectedCompositionIds.map((id) => `composition:${id}`),
      ...selectedMediaIds.map((id) => `media:${id}`),
    ]
  })

  const selection = useMarqueeSelection(() => ({
    container: params().scrollContainer,
    items: marqueeItems,
    enabled: marqueeItems.length > 0,
    onPreviewSelectionChange: setPreviewAssetIds,
    committedSelectionIds,
    commitSelectionOnMouseUp: true,
    liveCommitThrottleMs: 66,
    onSelectionChange: (ids) => {
      const nextMediaIds: string[] = []
      const nextCompositionIds: string[] = []

      for (const id of ids) {
        if (id.startsWith('media:')) {
          nextMediaIds.push(id.slice('media:'.length))
        } else if (id.startsWith('composition:')) {
          nextCompositionIds.push(id.slice('composition:'.length))
        }
      }

      params().setSelection({ mediaIds: nextMediaIds, compositionIds: nextCompositionIds })
    },
  }))

  return { marquee: selection.marquee }
}
