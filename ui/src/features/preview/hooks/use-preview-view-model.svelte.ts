// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select } from '$lib/store.svelte'
import {
  useItemsStore,
  useKeyframesStore,
  useMediaDependencyStore,
  useTimelineSettingsStore,
  useTransitionsStore,
} from '@/features/preview/deps/timeline-store'
import type { TimelineItem } from '@/types/timeline'
import {
  useRollingEditPreviewStore,
  useRippleEditPreviewStore,
  useSlipEditPreviewStore,
  useSlideEditPreviewStore,
} from '@/features/preview/deps/timeline-edit-preview'
import { useSelectionStore } from '@/shared/state/selection'
import {
  getProjectBrokenMediaIds,
  useMediaLibraryStore,
} from '@/features/preview/deps/media-library'
import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'
import { usePlaybackStore } from '@/shared/state/playback'
import { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
import { isMarqueeJustFinished } from '@/shared/marquee/use-marquee-selection.svelte'
import {
  getPreviewNeedsOverflow,
  getPreviewPlayerSize,
} from '@/features/preview/utils/preview-pixel-snap'

interface PreviewProjectDimensions {
  width: number
  height: number
}

interface PreviewContainerDimensions {
  width: number
  height: number
}

interface UsePreviewViewModelParams {
  project: PreviewProjectDimensions
  containerSize: PreviewContainerDimensions
  suspendOverlay: boolean
  itemsSnapshot: {
    items: TimelineItem[]
    itemsByTrackId: Record<string, TimelineItem[]>
  }
}

export function usePreviewViewModel(params: () => UsePreviewViewModelParams) {
  const { project, containerSize, suspendOverlay, itemsSnapshot } = $derived(params())
  const playerContainerRef: { current: HTMLDivElement | null } = { current: null }
  const backgroundRef: { current: HTMLDivElement | null } = { current: null }
  let playerContainerRect = $state.raw<DOMRect | null>(null)
  const setPlayerContainerRect = (
    next: DOMRect | null | ((prev: DOMRect | null) => DOMRect | null),
  ) => {
    playerContainerRect =
      typeof next === 'function'
        ? (next as (prev: DOMRect | null) => DOMRect | null)(untrack(() => playerContainerRect))
        : next
  }

  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const tracks = select(useItemsStore, (s) => s.tracks)
  const keyframes = select(useKeyframesStore, (s) => s.keyframes)
  const { items, itemsByTrackId } = $derived(itemsSnapshot)
  const mediaDependencyVersion = select(useMediaDependencyStore, (s) => s.mediaDependencyVersion)
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)
  const brokenMediaCount = select(
    useMediaLibraryStore,
    (s) => getProjectBrokenMediaIds(s.brokenMediaIds, s.mediaById).length,
  )
  const hasRolling2Up = select(useRollingEditPreviewStore, (s) =>
    Boolean(s.trimmedItemId && s.neighborItemId && s.handle),
  )
  const hasRipple2Up = select(useRippleEditPreviewStore, (s) =>
    Boolean(s.trimmedItemId && s.handle),
  )
  const hasSlip4Up = select(useSlipEditPreviewStore, (s) => Boolean(s.itemId))
  const hasSlide4Up = select(useSlideEditPreviewStore, (s) => Boolean(s.itemId))
  const isMaskEditingActive = select(useMaskEditorStore, (s) => s.isEditing)
  const zoom = select(usePlaybackStore, (s) => s.zoom)
  const useProxy = select(usePlaybackStore, (s) => s.useProxy)
  const busAudioEq = select(usePlaybackStore, (s) => s.busAudioEq)
  const blobUrlVersion = useBlobUrlVersion()
  const proxyStatus = select(useMediaLibraryStore, (s) => s.proxyStatus)
  const proxyReadyCount = $derived.by(() => {
    let count = 0
    for (const status of proxyStatus.current.values()) {
      if (status === 'ready') count++
    }
    return count
  })

  const containerWidth = $derived(containerSize.width)
  const containerHeight = $derived(containerSize.height)
  const projectWidth = $derived(project.width)
  const projectHeight = $derived(project.height)
  const playerSize = $derived.by(() =>
    getPreviewPlayerSize({
      sourceSize: { width: projectWidth, height: projectHeight },
      containerSize: { width: containerWidth, height: containerHeight },
      zoom: zoom.current,
    }),
  )

  const needsOverflow = $derived.by(() =>
    getPreviewNeedsOverflow({ playerSize, containerSize, zoom: zoom.current }),
  )

  const setPlayerContainerRefCallback = (el: HTMLDivElement | null) => {
    playerContainerRef.current = el
    if (el) {
      setPlayerContainerRect(el.getBoundingClientRect())
    }
  }

  $effect(() => {
    void [isMaskEditingActive.current]

    if (suspendOverlay) return
    const container = playerContainerRef.current
    if (!container) return

    const updateRect = () => {
      const nextRect = container.getBoundingClientRect()
      setPlayerContainerRect((prev) => {
        if (
          prev &&
          prev.left === nextRect.left &&
          prev.top === nextRect.top &&
          prev.width === nextRect.width &&
          prev.height === nextRect.height
        ) {
          return prev
        }
        return nextRect
      })
    }

    updateRect()

    const resizeObserver = new ResizeObserver(updateRect)
    resizeObserver.observe(container)

    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
    // isMaskEditingActive: entering/leaving mask edit mounts a toolbar below
    // the preview, moving the player without resizing it — ResizeObserver
    // can't see that, so re-measure when the mode toggles.
  })

  const handleBackgroundClick = (event: MouseEvent) => {
    if (isMaskEditingActive.current) {
      event.stopPropagation()
      return
    }
    if (isMarqueeJustFinished()) return

    const target = event.target as HTMLElement
    if (target.closest('[data-gizmo]')) return

    useSelectionStore.getState().clearItemSelection()
  }

  return {
    get fps() {
      return fps.current
    },
    get tracks() {
      return tracks.current
    },
    get keyframes() {
      return keyframes.current
    },
    get items() {
      return items
    },
    get itemsByTrackId() {
      return itemsByTrackId
    },
    get mediaDependencyVersion() {
      return mediaDependencyVersion.current
    },
    get transitions() {
      return transitions.current
    },
    get mediaById() {
      return mediaById.current
    },
    get brokenMediaCount() {
      return brokenMediaCount.current
    },
    get hasRolling2Up() {
      return hasRolling2Up.current
    },
    get hasRipple2Up() {
      return hasRipple2Up.current
    },
    get hasSlip4Up() {
      return hasSlip4Up.current
    },
    get hasSlide4Up() {
      return hasSlide4Up.current
    },
    get isMaskEditingActive() {
      return isMaskEditingActive.current
    },
    get zoom() {
      return zoom.current
    },
    get useProxy() {
      return useProxy.current
    },
    get busAudioEq() {
      return busAudioEq.current
    },
    get blobUrlVersion() {
      return blobUrlVersion.current
    },
    get proxyReadyCount() {
      return proxyReadyCount
    },
    get playerSize() {
      return playerSize
    },
    get needsOverflow() {
      return needsOverflow
    },
    playerContainerRef,
    get playerContainerRect() {
      return playerContainerRect
    },
    backgroundRef,
    setPlayerContainerRefCallback,
    handleBackgroundClick,
  }
}
