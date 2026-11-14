<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import type { TrackDropGhostPreview } from '@/features/timeline/stores/track-drop-preview-store'
  import type { getMediaDragData } from '@/features/timeline/deps/media-library-resolver'
  import type { ExternalDragPreviewEntry } from '@/features/timeline/utils/drag-drop-preview'

  const logger = createLogger('TimelineTrack')

  const EMPTY_TRACK_ITEMS: TimelineItemType[] = []

  type GhostPreviewItem = TrackDropGhostPreview
  type PreviewGhostEntry = Pick<
    ExternalDragPreviewEntry,
    'label' | 'mediaType' | 'duration' | 'hasLinkedAudio'
  >
  type PendingDragPreview = {
    dropFrame: number
    dragData: ReturnType<typeof getMediaDragData>
    hasExternalFiles: boolean
    externalPreviewItems: ExternalDragPreviewEntry[] | null
    fileItemCount: number
    dataTransfer: DataTransfer | null
  }

  const MULTI_DROP_METADATA_CONCURRENCY = 3
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import type { TimelineTrack as TimelineTrackType } from '@/types/timeline'
  import type { MediaMetadata } from '@/types/storage'
  import TransitionItem from './transition-item.svelte'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import {
    addItem,
    addItems,
    closeGapAtPosition,
    setTracks,
  } from '@/features/timeline/stores/timeline-actions'
  import { useTrackDropPreviewStore } from '@/features/timeline/stores/track-drop-preview-store'
  import { useNewTrackZonePreviewStore } from '@/features/timeline/stores/new-track-zone-preview-store'
  import { useVisibleItems } from '../hooks/use-visible-items.svelte'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import { useProjectStore } from '@/features/timeline/deps/projects'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import {
    resolveMediaUrl,
    getMediaDragData as readMediaDragData,
    type CompositionDragData,
  } from '@/features/timeline/deps/media-library-resolver'
  import {
    buildCollisionTrackItemsMap,
    findNearestAvailableSpaceInTrackItems,
    type CollisionRect,
  } from '@/features/timeline/utils/collision-utils'
  import { mapWithConcurrency } from '@/shared/utils/async-utils'
  import { useExternalDragPreview } from '../hooks/use-external-drag-preview.svelte'
  import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store'
  import { wouldCreateCompositionCycle } from '@/features/timeline/utils/composition-graph'
  import {
    createTimelineTemplateItem,
    getDefaultGeneratedLayerDurationInFrames,
    isTimelineTemplateDragData,
  } from '@/features/timeline/utils/generated-layer-items'
  import { findCompatibleTrackForItemType } from '@/features/timeline/utils/track-item-compatibility'
  import {
    buildDroppedMediaTimelineItems,
    getDroppedMediaDurationInFrames,
    type DroppableMediaType,
  } from '@/features/timeline/utils/dropped-media'
  import {
    buildDroppedCompositionTimelineItems,
    compositionHasOwnedAudio,
  } from '@/features/timeline/utils/dropped-composition'
  import {
    buildGhostPreviewsFromTrackMediaDropPlan,
    planTrackMediaDropPlacements,
  } from '@/features/timeline/utils/track-media-drop'
  import {
    applyResolvedTimelineDrop,
    resolveDroppedMediaEntriesFromExternalFiles,
    resolveDroppedMediaEntriesFromPayload,
    type DroppedMediaEntry,
  } from '@/features/timeline/utils/drop-execution'
  import { prewarmDroppedTimelineAudio } from '../utils/drop-audio-prewarm'
  import { toast } from 'svelte-sonner'
  import {
    isDroppableMediaType,
    isValidDragMediaItem,
  } from '@/features/timeline/utils/drag-drop-preview'
  import {
    claimTimelineDropPreviewOwner,
    isTimelineDropPreviewOwner,
    registerTimelineDropPreviewOwner,
    releaseTimelineDropPreviewOwner,
  } from '@/features/timeline/utils/drop-preview-owner'
  import { isDragPointInsideElement } from '@/features/timeline/utils/effect-drop'
  import { frameToPixelsNow, pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { captureContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'
  import {
    getTrackKind,
    isTrackDisabled as getIsTrackDisabled,
  } from '@/features/timeline/utils/classic-tracks'
  import { shouldIgnoreTrackDropPreviewForDrag } from '@/features/timeline/utils/timeline-external-drag'
  import TrackDropGhostOverlay from './timeline-track-drop-ghost-overlay.svelte'
  import TrackGapContextMenu from './timeline-track-gap-context-menu.svelte'
  import TimelineTrackItems from './timeline-track-items.svelte'
  import { createTimelineTrackContentLayerRef } from '@/features/timeline/utils/timeline-live-geometry'
  import { getTimelineTrackItemRangeIndex } from '@/features/timeline/utils/timeline-item-range-index'
  import type { TrackGapContextMenuRequest } from './timeline-track-types'

  interface TimelineTrackProps {
    track: TimelineTrackType
  }

  /**
   * Timeline Track Component
   *
   * Renders a single timeline track with:
   * - All items belonging to this track
   * - Appropriate height based on track settings
   * - Generic container that accepts any item types
   * - Drag-and-drop support for media from library
   */
  let { track }: TimelineTrackProps = $props()

  // Hooks and subscriptions key on the id alone (React's `[track.id]` deps):
  // a derived only notifies when the id itself changes, not on every new track object.
  const trackId = $derived(track.id)
  const previewOwnerId = $derived(`track:${trackId}`)
  let gapContextMenuRequest = $state<TrackGapContextMenuRequest | null>(null)
  let trackElement = $state<HTMLDivElement | null>(null)
  let trackContentLayer = $state<HTMLDivElement | null>(null)
  const trackContentLayerRef = createTimelineTrackContentLayerRef()
  let gapContextMenuToken = 0
  let dragPreviewCache: {
    dropFrame: number | null
    dragData: unknown
    hasExternalFiles: boolean
    externalPreviewItems: unknown
    fileItemCount: number
  } = {
    dropFrame: null,
    dragData: null,
    hasExternalFiles: false,
    externalPreviewItems: null,
    fileItemCount: 0,
  }
  const previewEntryCache: {
    dragData: ReturnType<typeof readMediaDragData>
    entries: PreviewGhostEntry[] | null
  } = {
    dragData: null,
    entries: null,
  }
  const collisionMapCache: {
    itemsRef: TimelineItemType[] | null
    map: Map<string, CollisionRect[]>
  } = {
    itemsRef: null,
    map: new Map<string, CollisionRect[]>(),
  }
  let dragPreviewRaf: number | null = null
  let pendingDragPreview: PendingDragPreview | null = null
  const dragOverFlags = { isDragOver: false, isExternalDragOver: false }

  // Resolve inherited parent-group state through the store, but derive this
  // row's own state directly from the current `track` prop.
  const parentInteractionState = $derived.by(() => {
    const parentTrackId = track.parentTrackId
    return select(useItemsStore, (s) => {
      const parentGroup = parentTrackId
        ? s.tracks.find((t) => t.id === parentTrackId && t.isGroup)
        : undefined
      if (!parentGroup) return 0
      return (
        (parentGroup.locked ? 1 : 0) |
        (parentGroup.muted ? 2 : 0) |
        (parentGroup.visible === false ? 4 : 0)
      )
    })
  })
  const isParentLocked = $derived((parentInteractionState.current & 1) !== 0)
  const isParentMuted = $derived((parentInteractionState.current & 2) !== 0)
  const isParentHidden = $derived((parentInteractionState.current & 4) !== 0)
  const isTrackLocked = $derived(track.locked || isParentLocked)
  const isTrackDisabled = $derived(
    getIsTrackDisabled({
      ...track,
      muted: track.muted || isParentMuted,
      visible: track.visible !== false && !isParentHidden,
    }),
  )
  const isDropDisabled = $derived(isTrackLocked)
  const trackKind = $derived(getTrackKind(track))
  // Virtualized items/transitions — only those overlapping the visible viewport + buffer
  const visible = useVisibleItems(() => trackId)
  // Full item count — context-menu and overview policy must not depend on virtualization.
  const trackItemRangeIndex = $derived.by(() => {
    const id = trackId
    return select(useItemsStore, (s) =>
      getTimelineTrackItemRangeIndex(s.itemsByTrackId[id] ?? EMPTY_TRACK_ITEMS),
    )
  })
  const totalTrackItemCount = $derived(trackItemRangeIndex.current.itemCount)
  const hasAnyItems = $derived(totalTrackItemCount > 0)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)

  const setTrackGhostPreviews = (previews: GhostPreviewItem[]) =>
    useTrackDropPreviewStore.getState().setGhostPreviews(previews)
  const clearTrackGhostPreviews = () => useTrackDropPreviewStore.getState().clearGhostPreviews()

  $effect(() => {
    const layer = trackContentLayer
    if (!layer) return
    trackContentLayerRef(layer)
    return () => trackContentLayerRef(null)
  })

  function getDropFrame(event: DragEvent): number | null {
    if (!trackElement) {
      return null
    }

    const timelineContainer = trackElement.closest('.timeline-container') as HTMLElement | null
    if (!timelineContainer) {
      return null
    }

    const scrollLeft = timelineContainer.scrollLeft || 0
    const containerRect = timelineContainer.getBoundingClientRect()
    const offsetX = event.clientX - containerRect.left + scrollLeft
    return pixelsToFrameNow(offsetX)
  }

  function getCurrentCanvasSize() {
    const liveProject = useProjectStore.getState().currentProject
    return {
      width: liveProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
      height: liveProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
    }
  }

  function getCollisionTrackItemsMap() {
    const items = useItemsStore.getState().items
    const cache = collisionMapCache
    if (cache.itemsRef !== items) {
      cache.itemsRef = items
      cache.map = buildCollisionTrackItemsMap(items)
    }
    return cache.map
  }

  function findNearestAvailablePreviewSpace(
    proposedFrom: number,
    durationInFrames: number,
    targetTrackId: string,
  ): number | null {
    const trackItems = getCollisionTrackItemsMap().get(targetTrackId) ?? []
    return findNearestAvailableSpaceInTrackItems(
      Math.max(0, proposedFrom),
      durationInFrames,
      trackItems,
    )
  }

  function updateDragOverFlags(nextIsDragOver: boolean, nextIsExternalDragOver: boolean) {
    dragOverFlags.isDragOver = nextIsDragOver
    dragOverFlags.isExternalDragOver = nextIsExternalDragOver
  }

  async function resolveTimelineItemsForEntries(
    entries: DroppedMediaEntry[],
    dropFrame: number,
  ): Promise<{ items: TimelineItemType[]; tracks: TimelineTrackType[] }> {
    const currentFps = fps.current
    const { plannedItems, tracks: workingTracks } = planTrackMediaDropPlacements({
      entries: entries.map((entry) => ({
        payload: entry,
        label: entry.label,
        mediaType: entry.mediaType,
        durationInFrames: getDroppedMediaDurationInFrames(entry.media, entry.mediaType, currentFps),
        hasLinkedAudio: entry.mediaType === 'video' && !!entry.media.audioCodec,
      })),
      dropFrame,
      tracks: useItemsStore.getState().tracks,
      existingItems: useItemsStore.getState().items,
      existingTrackItemsById: getCollisionTrackItemsMap(),
      dropTargetTrackId: track.id,
    })

    if (plannedItems.length === 0) {
      return { items: [], tracks: workingTracks }
    }

    const resolvedTimelineItems = await mapWithConcurrency(
      plannedItems,
      MULTI_DROP_METADATA_CONCURRENCY,
      async (planned): Promise<TimelineItemType[] | null> => {
        const { entry, placements } = planned
        const droppedEntry = entry.payload
        const blobUrl = await resolveMediaUrl(droppedEntry.mediaId)

        if (!blobUrl) {
          logger.error('Failed to get media blob URL for', entry.label)
          return null
        }

        const primaryPlacement =
          placements.find((placement) => placement.mediaType !== 'audio') ?? placements[0]!
        const linkedAudioPlacement = placements.find(
          (placement) => placement.mediaType === 'audio',
        )
        const canvasSize = getCurrentCanvasSize()

        return buildDroppedMediaTimelineItems({
          media: droppedEntry.media,
          mediaId: droppedEntry.mediaId,
          mediaType: entry.mediaType,
          label: entry.label,
          timelineFps: currentFps,
          blobUrl,
          thumbnailUrl: null,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
          placement: {
            primary: {
              trackId: primaryPlacement.trackId,
              from: primaryPlacement.from,
              durationInFrames: primaryPlacement.durationInFrames,
            },
            linkedAudio: linkedAudioPlacement
              ? {
                  trackId: linkedAudioPlacement.trackId,
                  from: linkedAudioPlacement.from,
                  durationInFrames: linkedAudioPlacement.durationInFrames,
                }
              : undefined,
          },
          linkVideoAudio: planned.linkVideoAudio,
        })
      },
    )

    return {
      items: resolvedTimelineItems.flatMap((timelineItems) => timelineItems ?? []),
      tracks: workingTracks,
    }
  }

  function buildGhostPreviewsForEntries(
    entries: Array<{
      label: string
      mediaType: DroppableMediaType
      duration?: number
      hasLinkedAudio?: boolean
    }>,
    dropFrame: number,
  ): GhostPreviewItem[] {
    const currentFps = fps.current
    const { plannedItems } = planTrackMediaDropPlacements({
      entries: entries.map((entry) => ({
        payload: entry,
        label: entry.label,
        mediaType: entry.mediaType,
        durationInFrames: getDroppedMediaDurationInFrames(
          { duration: entry.duration ?? 0 } as Pick<MediaMetadata, 'duration'>,
          entry.mediaType,
          currentFps,
        ),
        hasLinkedAudio: entry.hasLinkedAudio,
      })),
      dropFrame,
      tracks: useItemsStore.getState().tracks,
      existingItems: useItemsStore.getState().items,
      existingTrackItemsById: getCollisionTrackItemsMap(),
      dropTargetTrackId: track.id,
    })

    return buildGhostPreviewsFromTrackMediaDropPlan({
      plannedItems,
      frameToPixels: frameToPixelsNow,
    })
  }

  function buildGenericExternalGhostPreviews(
    dropFrame: number,
    itemCount: number,
  ): GhostPreviewItem[] {
    const placeholderDuration = fps.current * 3
    const finalPosition = findNearestAvailablePreviewSpace(
      dropFrame,
      placeholderDuration,
      track.id,
    )

    if (finalPosition === null) {
      return []
    }

    return [
      {
        left: frameToPixelsNow(finalPosition),
        width: frameToPixelsNow(placeholderDuration),
        label: itemCount > 1 ? `${itemCount} files` : 'Drop media',
        type: 'external-file',
        targetTrackId: track.id,
      },
    ]
  }

  function buildGhostPreviewForTemplate(template: unknown, dropFrame: number): GhostPreviewItem[] {
    if (!isTimelineTemplateDragData(template)) {
      return []
    }

    const store = useItemsStore.getState()
    const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps.current)
    const targetTrack = findCompatibleTrackForItemType({
      tracks: store.tracks,
      items: store.items,
      itemType: template.itemType,
      preferredTrackId: track.id,
      allowPreferredTrackFallback: false,
    })
    if (!targetTrack) {
      return []
    }

    const finalPosition = findNearestAvailablePreviewSpace(
      dropFrame,
      durationInFrames,
      targetTrack.id,
    )
    if (finalPosition === null) {
      return []
    }

    return [
      {
        left: frameToPixelsNow(finalPosition),
        width: frameToPixelsNow(durationInFrames),
        label: template.label,
        type: template.itemType,
        targetTrackId: targetTrack.id,
      },
    ]
  }

  const externalDragPreview = useExternalDragPreview(() => ({
    onError: (error) => {
      logger.warn('Failed to build external drag preview:', error)
    },
  }))

  function resetDragPreviewCache() {
    dragPreviewCache = {
      dropFrame: null,
      dragData: null,
      hasExternalFiles: false,
      externalPreviewItems: null,
      fileItemCount: 0,
    }
  }

  function getPreviewEntriesForDragData(
    dragData: ReturnType<typeof readMediaDragData>,
  ): PreviewGhostEntry[] | null {
    if (!dragData) {
      return null
    }

    const cache = previewEntryCache
    if (cache.dragData === dragData) {
      return cache.entries
    }

    let nextEntries: PreviewGhostEntry[] | null = null

    if (dragData.type === 'media-items' && Array.isArray(dragData.items)) {
      const mediaById = useMediaLibraryStore.getState().mediaById
      const validItems = dragData.items.filter(isValidDragMediaItem)
      nextEntries = validItems.map((item) => ({
        label: item.fileName,
        mediaType: item.mediaType,
        duration: item.duration,
        hasLinkedAudio: item.mediaType === 'video' && !!mediaById[item.mediaId]?.audioCodec,
      }))
    } else if (
      dragData.type === 'media-item' &&
      dragData.mediaId &&
      dragData.mediaType &&
      dragData.fileName
    ) {
      const media = useMediaLibraryStore.getState().mediaById[dragData.mediaId]
      nextEntries =
        media && isDroppableMediaType(dragData.mediaType)
          ? [
              {
                label: dragData.fileName,
                mediaType: dragData.mediaType,
                duration: dragData.duration,
                hasLinkedAudio: dragData.mediaType === 'video' && !!media.audioCodec,
              },
            ]
          : null
    }

    cache.dragData = dragData
    cache.entries = nextEntries
    return nextEntries
  }

  function clearPendingDragPreview() {
    pendingDragPreview = null
    if (dragPreviewRaf !== null) {
      cancelAnimationFrame(dragPreviewRaf)
      dragPreviewRaf = null
    }
  }

  function shouldSkipDragPreviewUpdate(params: {
    dropFrame: number
    dragData: unknown
    hasExternalFiles: boolean
    externalPreviewItems: unknown
    fileItemCount: number
  }) {
    const previous = dragPreviewCache
    const shouldSkip =
      previous.dropFrame === params.dropFrame &&
      previous.dragData === params.dragData &&
      previous.hasExternalFiles === params.hasExternalFiles &&
      previous.externalPreviewItems === params.externalPreviewItems &&
      previous.fileItemCount === params.fileItemCount

    if (!shouldSkip) {
      dragPreviewCache = params
    }

    return shouldSkip
  }

  function buildTimelineTemplateItem(template: unknown, dropFrame: number): TimelineItemType | null {
    if (!isTimelineTemplateDragData(template)) {
      return null
    }

    const store = useItemsStore.getState()
    const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps.current)
    const targetTrack = findCompatibleTrackForItemType({
      tracks: store.tracks,
      items: store.items,
      itemType: template.itemType,
      preferredTrackId: track.id,
      allowPreferredTrackFallback: false,
    })
    if (!targetTrack) {
      return null
    }

    const finalPosition = findNearestAvailablePreviewSpace(
      dropFrame,
      durationInFrames,
      targetTrack.id,
    )
    if (finalPosition === null) {
      return null
    }

    const canvasSize = getCurrentCanvasSize()

    return createTimelineTemplateItem({
      template,
      placement: {
        trackId: targetTrack.id,
        from: finalPosition,
        durationInFrames,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      },
    })
  }

  function processPendingDragPreview() {
    dragPreviewRaf = null
    const pending = pendingDragPreview
    pendingDragPreview = null

    if (!pending) {
      return
    }

    if (!isTimelineDropPreviewOwner(previewOwnerId)) {
      return
    }

    const setDropEffectNone = () => {
      if (pending.dataTransfer) {
        pending.dataTransfer.dropEffect = 'none'
      }
    }

    if (
      shouldSkipDragPreviewUpdate({
        dropFrame: pending.dropFrame,
        dragData: pending.dragData,
        hasExternalFiles: pending.hasExternalFiles,
        externalPreviewItems: pending.externalPreviewItems,
        fileItemCount: pending.fileItemCount,
      })
    ) {
      return
    }

    if (pending.hasExternalFiles) {
      if (pending.externalPreviewItems && pending.externalPreviewItems.length > 0) {
        const previews = buildGhostPreviewsForEntries(
          pending.externalPreviewItems,
          pending.dropFrame,
        )
        if (previews.length === 0) {
          setDropEffectNone()
          updateDragOverFlags(false, false)
          resetDragPreviewCache()
          return
        }
        setTrackGhostPreviews(previews)
      } else {
        setTrackGhostPreviews(
          buildGenericExternalGhostPreviews(pending.dropFrame, Math.max(1, pending.fileItemCount)),
        )
        if (pending.dataTransfer) {
          externalDragPreview.primeExternalPreviewEntries(pending.dataTransfer)
        }
      }
      return
    }

    const data = pending.dragData
    if (!data) {
      clearTrackGhostPreviews()
      resetDragPreviewCache()
      return
    }

    const previews: GhostPreviewItem[] = []

    if (data.type === 'composition') {
      const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
      if (
        wouldCreateCompositionCycle({
          parentCompositionId: activeCompositionId,
          insertedCompositionId: data.compositionId,
          compositionById: useCompositionsStore.getState().compositionById,
        })
      ) {
        setDropEffectNone()
        clearTrackGhostPreviews()
        resetDragPreviewCache()
        return
      }

      const store = useItemsStore.getState()
      const compositionById = useCompositionsStore.getState().compositionById
      const composition = compositionById[data.compositionId]
      if (!composition) {
        setDropEffectNone()
        clearTrackGhostPreviews()
        resetDragPreviewCache()
        return
      }

      const hasOwnedAudio = compositionHasOwnedAudio({ composition, compositionById })
      const { plannedItems } = planTrackMediaDropPlacements({
        entries: [
          {
            payload: data,
            label: data.name,
            mediaType: 'video',
            durationInFrames: data.durationInFrames,
            hasLinkedAudio: hasOwnedAudio,
          },
        ],
        dropFrame: pending.dropFrame,
        tracks: store.tracks,
        existingItems: store.items,
        existingTrackItemsById: getCollisionTrackItemsMap(),
        dropTargetTrackId: track.id,
      })
      const plannedItem = plannedItems[0]
      if (!plannedItem) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        clearTrackGhostPreviews()
        resetDragPreviewCache()
        return
      }

      previews.push(
        ...buildGhostPreviewsFromTrackMediaDropPlan({
          plannedItems: [plannedItem],
          frameToPixels: frameToPixelsNow,
        }).map((preview) => ({
          ...preview,
          label: data.name,
          type: preview.type === 'video' ? ('composition' as const) : preview.type,
        })),
      )
      setTrackGhostPreviews(previews)
      return
    }

    if (data.type === 'timeline-template') {
      const templatePreviews = buildGhostPreviewForTemplate(data, pending.dropFrame)
      if (templatePreviews.length === 0) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        resetDragPreviewCache()
      }
      setTrackGhostPreviews(templatePreviews)
      return
    }

    const previewEntries = getPreviewEntriesForDragData(data)
    if (!previewEntries || previewEntries.length === 0) {
      clearTrackGhostPreviews()
      resetDragPreviewCache()
      return
    }

    const nextPreviews = buildGhostPreviewsForEntries(previewEntries, pending.dropFrame)
    if (nextPreviews.length === 0) {
      setDropEffectNone()
      updateDragOverFlags(false, false)
      resetDragPreviewCache()
    }
    previews.push(...nextPreviews)
    setTrackGhostPreviews(previews)
  }

  // Check if any item on this track is being dragged.
  // Reads items from getState() inside the selector to avoid a separate items-store
  // subscription that would cause ALL tracks to re-render on every items-store change.
  const hasItemBeingDragged = $derived.by(() => {
    const id = trackId
    return select(useSelectionStore, (s) => {
      if (!s.dragState?.isDragging) return false
      const trackItems = useItemsStore.getState().itemsByTrackId[id]
      if (!trackItems) return false
      const draggedItemIdSet = s.dragState.draggedItemIdSet ?? new Set(s.dragState.draggedItemIds)
      return trackItems.some((item) => draggedItemIdSet.has(item.id))
    })
  })

  // Check if a frame position is inside a real gap (between clips, not after the last clip).
  // Reads full item list from store (not the virtualized subset) so gaps near viewport edges
  // are detected correctly even when the clip after the gap is outside the visible buffer.
  function isFrameInGap(frame: number) {
    const allTrackItems = useItemsStore.getState().itemsByTrackId[track.id]
    if (!allTrackItems || allTrackItems.length === 0) return false

    const sortedItems = allTrackItems.toSorted((a, b) => a.from - b.from)

    // Check if frame is inside any clip
    for (const item of sortedItems) {
      if (frame >= item.from && frame < item.from + item.durationInFrames) {
        return false // Inside a clip
      }
    }

    // Check if there's a clip AFTER this frame (otherwise it's just empty space, not a gap)
    const hasClipAfter = sortedItems.some((item) => item.from > frame)
    return hasClipAfter
  }

  // Handle context menu on track (for empty space)
  function handleContextMenu(e: MouseEvent) {
    // Check if clicking on a clip (has data-item-id ancestor)
    const target = e.target as HTMLElement
    if (target.closest('[data-item-id], [data-item-context-anchor]')) {
      // Let the clip's context menu handle it
      return
    }

    // Calculate clicked frame position
    if (!trackElement) return
    const timelineContainer = trackElement.closest('.timeline-container') as HTMLElement
    if (!timelineContainer) return

    const scrollLeft = timelineContainer.scrollLeft || 0
    const containerRect = timelineContainer.getBoundingClientRect()
    const offsetX = e.clientX - containerRect.left + scrollLeft
    const clickedFrame = pixelsToFrameNow(offsetX)

    // Check if this frame is in a gap - just track the frame, let the menu replay handle it
    if (isFrameInGap(clickedFrame)) {
      e.preventDefault()
      gapContextMenuToken += 1
      gapContextMenuRequest = {
        frame: clickedFrame,
        pointer: captureContextMenuEventInit(e),
        token: gapContextMenuToken,
      }
    } else {
      // Clicked on a clip area, prevent track menu so clip menu can show
      e.preventDefault()
      gapContextMenuRequest = null
    }
  }

  // Handle closing the gap
  function handleCloseGap() {
    if (gapContextMenuRequest) {
      closeGapAtPosition(track.id, gapContextMenuRequest.frame)
      gapContextMenuRequest = null
    }
  }

  function clearOwnedPreview() {
    clearPendingDragPreview()
    updateDragOverFlags(false, false)
    clearTrackGhostPreviews()
    resetDragPreviewCache()
  }

  function claimPreviewOwnership(event: DragEvent) {
    const dataTransfer = event.dataTransfer
    const data = readMediaDragData()
    const hasExternalFiles = !!dataTransfer && !data && dataTransfer.types.includes('Files')
    if (!data && !hasExternalFiles) {
      return
    }

    if (shouldIgnoreTrackDropPreviewForDrag(data, trackKind)) {
      clearOwnedPreview()
      return
    }

    if (claimTimelineDropPreviewOwner(previewOwnerId)) {
      clearTrackGhostPreviews()
      useNewTrackZonePreviewStore.getState().clearGhostPreviews()
    }
    updateDragOverFlags(true, hasExternalFiles)
  }

  function handleDragEnterCapture(e: DragEvent) {
    claimPreviewOwnership(e)
  }

  $effect(() => {
    return registerTimelineDropPreviewOwner(previewOwnerId, clearOwnedPreview)
  })

  function handleDragOver(e: DragEvent) {
    const dataTransfer = e.dataTransfer!
    if (isDropDisabled) {
      e.preventDefault()
      dataTransfer.dropEffect = 'none'
      clearPendingDragPreview()
      resetDragPreviewCache()
      return
    }

    const data = readMediaDragData()
    const hasExternalFiles = !data && dataTransfer.types.includes('Files')
    if (!data && !hasExternalFiles) {
      clearPendingDragPreview()
      updateDragOverFlags(false, false)
      clearTrackGhostPreviews()
      resetDragPreviewCache()
      return
    }

    if (shouldIgnoreTrackDropPreviewForDrag(data, trackKind)) {
      clearOwnedPreview()
      return
    }

    e.preventDefault()
    dataTransfer.dropEffect = 'copy'
    claimPreviewOwnership(e)
    updateDragOverFlags(true, hasExternalFiles)

    const dropFrame = getDropFrame(e)
    if (dropFrame === null) {
      clearPendingDragPreview()
      clearTrackGhostPreviews()
      resetDragPreviewCache()
      return
    }
    externalDragPreview.lastDragFrameRef.current = dropFrame

    const externalPreviewItems = externalDragPreview.externalPreviewItemsRef.current
    const fileItemCount =
      hasExternalFiles && !externalPreviewItems
        ? Array.from(dataTransfer.items).filter((item) => item.kind === 'file').length
        : 0
    pendingDragPreview = {
      dropFrame,
      dragData: data,
      hasExternalFiles,
      externalPreviewItems,
      fileItemCount,
      dataTransfer,
    }
    if (dragPreviewRaf === null) {
      dragPreviewRaf = requestAnimationFrame(processPendingDragPreview)
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    if (isDragPointInsideElement(e, e.currentTarget as HTMLElement)) {
      return
    }
    releaseTimelineDropPreviewOwner(previewOwnerId)
    clearPendingDragPreview()
    updateDragOverFlags(false, false)
    clearTrackGhostPreviews()
    resetDragPreviewCache()
    externalDragPreview.clearExternalPreviewSession()
  }

  $effect(() => {
    const ownerId = previewOwnerId
    return () => {
      releaseTimelineDropPreviewOwner(ownerId)
      clearPendingDragPreview()
    }
  })

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    releaseTimelineDropPreviewOwner(previewOwnerId)
    clearPendingDragPreview()
    updateDragOverFlags(false, false)
    clearTrackGhostPreviews()
    resetDragPreviewCache()
    externalDragPreview.clearExternalPreviewSession()

    if (isDropDisabled) {
      return
    }

    const dropFrame = getDropFrame(e)
    if (dropFrame === null) {
      return
    }

    const dataTransfer = e.dataTransfer!
    const rawJson = dataTransfer.getData('application/json')
    if (rawJson) {
      try {
        const data = JSON.parse(rawJson)

        if (data.type === 'composition') {
          const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
          if (
            wouldCreateCompositionCycle({
              parentCompositionId: activeCompositionId,
              insertedCompositionId: data.compositionId,
              compositionById: useCompositionsStore.getState().compositionById,
            })
          ) {
            return
          }

          const { compositionId, name, durationInFrames } = data as CompositionDragData
          const store = useItemsStore.getState()
          const compositionById = useCompositionsStore.getState().compositionById
          const composition = compositionById[compositionId]
          if (!composition) {
            logger.warn('Cannot drop composition: compound clip definition not found')
            return
          }
          const { plannedItems, tracks: nextTracks } = planTrackMediaDropPlacements({
            entries: [
              {
                payload: data,
                label: name,
                mediaType: 'video',
                durationInFrames,
                hasLinkedAudio: compositionHasOwnedAudio({ composition, compositionById }),
              },
            ],
            dropFrame,
            tracks: store.tracks,
            existingItems: store.items,
            dropTargetTrackId: track.id,
          })
          const plannedItem = plannedItems[0]
          if (!plannedItem) {
            logger.warn('Cannot drop composition: no available placement found')
            return
          }

          if (nextTracks !== store.tracks) {
            setTracks(nextTracks)
          }

          const droppedItems = buildDroppedCompositionTimelineItems({
            compositionId,
            composition,
            label: name,
            placements: plannedItem.placements,
          })
          if (droppedItems.length === 0) {
            logger.warn('Cannot drop composition: failed to build compound clip wrappers')
            return
          }

          addItems(droppedItems)
          return
        }

        if (isTimelineTemplateDragData(data)) {
          const templateItem = buildTimelineTemplateItem(data, dropFrame)
          if (!templateItem) {
            toast.error(t('timeline.track.unableToAddDroppedItem'))
            return
          }

          addItem(templateItem)
          return
        }

        const entries = resolveDroppedMediaEntriesFromPayload(
          data,
          useMediaLibraryStore.getState().mediaItems,
          logger,
        )

        if (entries.length === 0) {
          return
        }

        const dropResult = await resolveTimelineItemsForEntries(entries, dropFrame)
        prewarmDroppedTimelineAudio(entries, dropResult.items)
        applyResolvedTimelineDrop({
          addItem,
          addItems,
          currentTracks: useItemsStore.getState().tracks,
          dropResult,
          emptyMessage: t('timeline.track.unableToAddDroppedMediaItems'),
          notify: toast,
          partialFailureLabel: t('timeline.track.droppedMediaItems'),
          requestedCount: entries.length,
          setTracks,
        })
        return
      } catch (error) {
        logger.warn('Failed to parse drag payload, falling back to file-drop handling', error)
      }
    }

    if (!dataTransfer.types.includes('Files')) {
      return
    }

    const droppedEntries = await resolveDroppedMediaEntriesFromExternalFiles({
      dataTransfer,
      importHandlesForPlacement: useMediaLibraryStore.getState().importHandlesForPlacement,
      notify: toast,
    })
    if (!droppedEntries) {
      return
    }

    const dropResult = await resolveTimelineItemsForEntries(droppedEntries, dropFrame)
    prewarmDroppedTimelineAudio(droppedEntries, dropResult.items)
    applyResolvedTimelineDrop({
      addItem,
      addItems,
      currentTracks: useItemsStore.getState().tracks,
      dropResult,
      emptyMessage: t('timeline.track.unableToAddDroppedFiles'),
      notify: toast,
      partialFailureLabel: t('timeline.track.droppedFiles'),
      requestedCount: droppedEntries.length,
      setTracks,
    })
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={trackElement}
  data-track-id={track.id}
  data-timeline-drop-target="true"
  class="relative"
  style:height="{track.height}px"
  style:contain="layout style"
  style:z-index={hasItemBeingDragged.current ? 100 : undefined}
  ondragentercapture={handleDragEnterCapture}
  ondragover={handleDragOver}
  ondragleavecapture={handleDragLeave}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  oncontextmenu={handleContextMenu}
>
  <div class="relative" style:height="{track.height}px">
    <div
      bind:this={trackContentLayer}
      data-timeline-track-content-layer
      class="absolute inset-y-0 left-0"
      style:width="100%"
      style:contain="layout style"
    >
      {#if !isDropDisabled}
        <TrackDropGhostOverlay trackId={track.id} />
      {/if}

      <!-- Render all items for this track - dimmed when the track is disabled -->
      <TimelineTrackItems
        trackId={track.id}
        trackItems={visible.visibleItems}
        {totalTrackItemCount}
        trackItemDurationBounds={trackItemRangeIndex.current}
        trackLocked={isTrackLocked}
        trackHidden={isTrackDisabled}
      />

      <!-- Render transitions for this track -->
      {#if trackKind !== 'audio'}
        {#each visible.visibleTransitions as transition (transition.id)}
          <TransitionItem {transition} trackHidden={isTrackDisabled} />
        {/each}
      {/if}
    </div>

    <!-- Locked track overlay indicator -->
    {#if isTrackLocked}
      <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div class="text-xs text-muted-foreground font-mono">
          {t('timeline.track.locked')}
        </div>
      </div>
    {/if}
  </div>
</div>
<!-- Lazy ContextMenu: only mount the menu tree when the menu is triggered on a gap -->
{#if hasAnyItems && gapContextMenuRequest !== null}
  {#key gapContextMenuRequest.token}
    <TrackGapContextMenu
      request={gapContextMenuRequest}
      onCloseGap={handleCloseGap}
      onDismiss={() => (gapContextMenuRequest = null)}
    />
  {/key}
{/if}
