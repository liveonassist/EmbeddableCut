<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { NewTrackZoneGhostPreview } from '@/features/timeline/stores/new-track-zone-preview-store'
  import type { getMediaDragData } from '@/features/timeline/deps/media-library-resolver'
  import type { ExternalDragPreviewEntry } from '@/features/timeline/utils/drag-drop-preview'

  const logger = createLogger('TimelineMediaDropZone')

  type GhostPreviewItem = NewTrackZoneGhostPreview
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
  type DragPreviewCache = {
    dropFrame: number | null
    dragData: unknown
    hasExternalFiles: boolean
    externalPreviewItems: unknown
    fileItemCount: number
  }

  const MULTI_DROP_METADATA_CONCURRENCY = 3
</script>

<script lang="ts">
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import type { MediaMetadata } from '@/types/storage'
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { useTimelineCommittedZoomContext } from '../../contexts/timeline-zoom-context.svelte'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { addItem, addItems, setTracks } from '@/features/timeline/stores/timeline-actions'
  import type { TimelineState } from '@/features/timeline/types'
  import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
  import { pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { useNewTrackZonePreviewStore } from '@/features/timeline/stores/new-track-zone-preview-store'
  import { useTrackDropPreviewStore } from '@/features/timeline/stores/track-drop-preview-store'
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
  import { useExternalDragPreview } from '../../hooks/use-external-drag-preview.svelte'
  import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store'
  import { wouldCreateCompositionCycle } from '@/features/timeline/utils/composition-graph'
  import {
    createTimelineTemplateItem,
    getDefaultGeneratedLayerDurationInFrames,
    isTimelineTemplateDragData,
  } from '@/features/timeline/utils/generated-layer-items'
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
    buildGhostPreviewsFromNewTrackZonePlan,
    planNewTrackZonePlacements,
  } from '@/features/timeline/utils/new-track-zone-media'
  import {
    applyResolvedTimelineDrop,
    resolveDroppedMediaEntriesFromExternalFiles,
    resolveDroppedMediaEntriesFromPayload,
    type DroppedMediaEntry,
  } from '@/features/timeline/utils/drop-execution'
  import { prewarmDroppedTimelineAudio } from '../../utils/drop-audio-prewarm'
  import { isDroppableMediaType, isValidDragMediaItem } from '@/features/timeline/utils/drag-drop-preview'
  import {
    claimTimelineDropPreviewOwner,
    isTimelineDropPreviewOwner,
    registerTimelineDropPreviewOwner,
    releaseTimelineDropPreviewOwner,
  } from '@/features/timeline/utils/drop-preview-owner'
  import { isDragPointInsideElement } from '@/features/timeline/utils/effect-drop'
  import { shouldIgnoreNewTrackZonePreviewForDrag } from '@/features/timeline/utils/timeline-external-drag'
  import NewTrackZoneGhostOverlay from './new-track-zone-ghost-overlay.svelte'

  interface Props {
    height: number
    zone: 'video' | 'audio'
    anchorTrackId: string
  }

  let { height, zone, anchorTrackId }: Props = $props()

  const previewOwnerId = $derived(`zone:${zone}`)
  let zoneElement = $state<HTMLDivElement | null>(null)
  let dragPreviewCache: DragPreviewCache = {
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
  const dragOverFlags = { current: { isDragOver: false, isExternalDragOver: false } }

  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const setZoneGhostPreviews = select(useNewTrackZonePreviewStore, (s) => s.setGhostPreviews)
  const clearZoneGhostPreviewsSelection = select(
    useNewTrackZonePreviewStore,
    (s) => s.clearGhostPreviews,
  )
  const getMedia = select(useMediaLibraryStore, (s) => s.mediaItems)
  const importHandlesForPlacement = select(
    useMediaLibraryStore,
    (s) => s.importHandlesForPlacement,
  )
  const zoom = useTimelineCommittedZoomContext()

  const clearZoneGhostPreviews = () => clearZoneGhostPreviewsSelection.current()

  function getDropFrame(event: DragEvent): number | null {
    if (!zoneElement) {
      return null
    }

    const timelineContainer = zoneElement.closest('.timeline-container') as HTMLElement | null
    if (!timelineContainer) {
      return null
    }

    const scrollLeft = timelineContainer.scrollLeft || 0
    const containerRect = timelineContainer.getBoundingClientRect()
    const offsetX = event.clientX - containerRect.left + scrollLeft
    return pixelsToFrameNow(offsetX)
  }

  function ensureVideoZoneTrack(tracks: TimelineState['tracks']) {
    const preferredTrackHeight = tracks.find((track) => track.id === anchorTrackId)?.height ?? 64
    const { plannedItems, tracks: nextTracks } = planNewTrackZonePlacements({
      entries: [
        {
          payload: null,
          label: '__zone__',
          mediaType: 'image',
          durationInFrames: 1,
        },
      ],
      dropFrame: 0,
      tracks,
      existingItems: [],
      anchorTrackId,
      zone: 'video',
      preferredTrackHeight,
    })

    const trackId = plannedItems[0]?.placements[0]?.trackId
    return trackId ? { trackId, tracks: nextTracks } : null
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
    dragOverFlags.current = {
      isDragOver: nextIsDragOver,
      isExternalDragOver: nextIsExternalDragOver,
    }
  }

  async function resolveTimelineItemsForEntries(
    entries: DroppedMediaEntry[],
    dropFrame: number,
  ): Promise<{
    items: TimelineItemType[]
    tracks: TimelineState['tracks']
  }> {
    const timelineFps = fps.current
    const currentTracks = useItemsStore.getState().tracks
    const preferredTrackHeight =
      currentTracks.find((track) => track.id === anchorTrackId)?.height ?? 64
    const { plannedItems, tracks: workingTracks } = planNewTrackZonePlacements({
      entries: entries.map((entry) => ({
        payload: entry,
        label: entry.label,
        mediaType: entry.mediaType,
        durationInFrames: getDroppedMediaDurationInFrames(
          entry.media,
          entry.mediaType,
          timelineFps,
        ),
        hasLinkedAudio: entry.mediaType === 'video' && !!entry.media.audioCodec,
      })),
      dropFrame,
      tracks: currentTracks,
      existingItems: useItemsStore.getState().items,
      existingTrackItemsById: getCollisionTrackItemsMap(),
      anchorTrackId,
      zone,
      preferredTrackHeight,
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
          timelineFps,
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
    const timelineFps = fps.current
    const currentTracks = useItemsStore.getState().tracks
    const preferredTrackHeight =
      currentTracks.find((track) => track.id === anchorTrackId)?.height ?? 64
    const { plannedItems } = planNewTrackZonePlacements({
      entries: entries.map((entry) => ({
        payload: entry,
        label: entry.label,
        mediaType: entry.mediaType,
        durationInFrames: getDroppedMediaDurationInFrames(
          { duration: entry.duration ?? 0 } as Pick<MediaMetadata, 'duration'>,
          entry.mediaType,
          timelineFps,
        ),
        hasLinkedAudio: entry.hasLinkedAudio,
      })),
      dropFrame,
      tracks: currentTracks,
      existingItems: useItemsStore.getState().items,
      existingTrackItemsById: getCollisionTrackItemsMap(),
      anchorTrackId,
      zone,
      preferredTrackHeight,
    })

    return buildGhostPreviewsFromNewTrackZonePlan({
      plannedItems,
      frameToPixels: zoom.frameToPixels,
    })
  }

  function buildGenericExternalGhostPreviews(
    dropFrame: number,
    itemCount: number,
  ): GhostPreviewItem[] {
    const previews = buildGhostPreviewsForEntries(
      [
        {
          label: itemCount > 1 ? `${itemCount} files` : 'Drop media',
          mediaType: zone === 'audio' ? 'audio' : 'image',
          duration: 3,
        },
      ],
      dropFrame,
    )

    return previews.length > 0 ? [{ ...previews[0]!, type: 'external-file', targetZone: zone }] : []
  }

  function buildGhostPreviewForTemplate(template: unknown, dropFrame: number): GhostPreviewItem[] {
    if (!isTimelineTemplateDragData(template) || zone !== 'video') {
      return []
    }

    const currentTracks = useItemsStore.getState().tracks
    const createdTrack = ensureVideoZoneTrack(currentTracks)
    if (!createdTrack) {
      return []
    }

    const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps.current)
    const finalPosition = findNearestAvailablePreviewSpace(
      dropFrame,
      durationInFrames,
      createdTrack.trackId,
    )
    if (finalPosition === null) {
      return []
    }

    return [
      {
        left: zoom.frameToPixels(finalPosition),
        width: zoom.frameToPixels(durationInFrames),
        label: template.label,
        type: template.itemType,
        targetZone: 'video',
      },
    ]
  }

  const externalDragPreview = useExternalDragPreview(() => ({
    onError: (error) => {
      logger.warn('Failed to build external drag preview:', error)
    },
  }))
  const {
    clearExternalPreviewSession,
    externalPreviewItemsRef,
    lastDragFrameRef,
    primeExternalPreviewEntries,
  } = externalDragPreview

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

  function shouldSkipDragPreviewUpdate(params: DragPreviewCache & { dropFrame: number }) {
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

  function buildTimelineTemplateItem(
    template: unknown,
    dropFrame: number,
  ): {
    item: TimelineItemType
    tracks: TimelineState['tracks']
  } | null {
    if (!isTimelineTemplateDragData(template) || zone !== 'video') {
      return null
    }

    const currentTracks = useItemsStore.getState().tracks
    const createdTrack = ensureVideoZoneTrack(currentTracks)
    if (!createdTrack) {
      return null
    }

    const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps.current)
    const finalPosition = findNearestAvailablePreviewSpace(
      dropFrame,
      durationInFrames,
      createdTrack.trackId,
    )
    if (finalPosition === null) {
      return null
    }

    const canvasSize = getCurrentCanvasSize()

    return {
      item: createTimelineTemplateItem({
        template,
        placement: {
          trackId: createdTrack.trackId,
          from: finalPosition,
          durationInFrames,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        },
      }),
      tracks: createdTrack.tracks,
    }
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
          clearZoneGhostPreviews()
          resetDragPreviewCache()
          return
        }
        setZoneGhostPreviews.current(previews)
      } else {
        setZoneGhostPreviews.current(
          buildGenericExternalGhostPreviews(pending.dropFrame, Math.max(1, pending.fileItemCount)),
        )
        if (pending.dataTransfer) {
          primeExternalPreviewEntries(pending.dataTransfer)
        }
      }
      return
    }

    const data = pending.dragData
    if (!data) {
      clearZoneGhostPreviews()
      resetDragPreviewCache()
      return
    }

    if (data.type === 'composition') {
      const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
      if (
        zone !== 'video' ||
        wouldCreateCompositionCycle({
          parentCompositionId: activeCompositionId,
          insertedCompositionId: data.compositionId,
          compositionById: useCompositionsStore.getState().compositionById,
        })
      ) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        clearZoneGhostPreviews()
        resetDragPreviewCache()
        return
      }

      const compositionById = useCompositionsStore.getState().compositionById
      const composition = compositionById[data.compositionId]
      if (!composition) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        clearZoneGhostPreviews()
        resetDragPreviewCache()
        return
      }

      const currentTracks = useItemsStore.getState().tracks
      const preferredTrackHeight =
        currentTracks.find((candidate) => candidate.id === anchorTrackId)?.height ?? 64
      const { plannedItems } = planNewTrackZonePlacements({
        entries: [
          {
            payload: data,
            label: data.name,
            mediaType: 'video',
            durationInFrames: data.durationInFrames,
            hasLinkedAudio: compositionHasOwnedAudio({ composition, compositionById }),
          },
        ],
        dropFrame: pending.dropFrame,
        tracks: currentTracks,
        existingItems: useItemsStore.getState().items,
        existingTrackItemsById: getCollisionTrackItemsMap(),
        anchorTrackId,
        zone,
        preferredTrackHeight,
      })
      const plannedItem = plannedItems[0]
      const previews = plannedItem
        ? buildGhostPreviewsFromNewTrackZonePlan({
            plannedItems: [plannedItem],
            frameToPixels: zoom.frameToPixels,
          }).map((preview) => ({
            ...preview,
            label: data.name,
            type: preview.type === 'video' ? ('composition' as const) : preview.type,
          }))
        : []
      if (previews.length === 0) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        resetDragPreviewCache()
      }
      setZoneGhostPreviews.current(previews)
      return
    }

    if (data.type === 'timeline-template') {
      if (zone !== 'video') {
        setDropEffectNone()
        clearZoneGhostPreviews()
        resetDragPreviewCache()
        return
      }

      const previews = buildGhostPreviewForTemplate(data, pending.dropFrame)
      if (previews.length === 0) {
        setDropEffectNone()
        updateDragOverFlags(false, false)
        resetDragPreviewCache()
      }
      setZoneGhostPreviews.current(previews)
      return
    }

    const previewEntries = getPreviewEntriesForDragData(data)
    if (!previewEntries || previewEntries.length === 0) {
      clearZoneGhostPreviews()
      resetDragPreviewCache()
      return
    }

    const previews = buildGhostPreviewsForEntries(previewEntries, pending.dropFrame)
    if (previews.length === 0) {
      setDropEffectNone()
      updateDragOverFlags(false, false)
      resetDragPreviewCache()
    }
    setZoneGhostPreviews.current(previews)
  }

  function clearOwnedPreview() {
    clearPendingDragPreview()
    updateDragOverFlags(false, false)
    clearZoneGhostPreviews()
    resetDragPreviewCache()
  }

  function claimPreviewOwnership(dataTransfer: DataTransfer | null) {
    const data = readMediaDragData()
    const hasExternalFiles = !!dataTransfer && !data && dataTransfer.types.includes('Files')
    if (!data && !hasExternalFiles) {
      return
    }

    if (shouldIgnoreNewTrackZonePreviewForDrag(data, zone)) {
      clearOwnedPreview()
      return
    }

    if (claimTimelineDropPreviewOwner(previewOwnerId)) {
      clearZoneGhostPreviews()
      useTrackDropPreviewStore.getState().clearGhostPreviews()
    }
    updateDragOverFlags(true, hasExternalFiles)
  }

  function handleDragEnterCapture(e: DragEvent) {
    claimPreviewOwnership(e.dataTransfer)
  }

  $effect(() => {
    const ownerId = previewOwnerId
    return untrack(() => registerTimelineDropPreviewOwner(ownerId, clearOwnedPreview))
  })

  function handleDragOver(e: DragEvent) {
    const dataTransfer = e.dataTransfer!
    const data = readMediaDragData()
    const hasExternalFiles = !data && dataTransfer.types.includes('Files')
    if (!data && !hasExternalFiles) {
      clearPendingDragPreview()
      updateDragOverFlags(false, false)
      clearZoneGhostPreviews()
      resetDragPreviewCache()
      return
    }

    if (shouldIgnoreNewTrackZonePreviewForDrag(data, zone)) {
      clearOwnedPreview()
      return
    }

    e.preventDefault()
    dataTransfer.dropEffect = 'copy'
    claimPreviewOwnership(dataTransfer)
    updateDragOverFlags(true, hasExternalFiles)

    const dropFrame = getDropFrame(e)
    if (dropFrame === null) {
      clearPendingDragPreview()
      clearZoneGhostPreviews()
      resetDragPreviewCache()
      return
    }
    lastDragFrameRef.current = dropFrame

    const externalPreviewItems = externalPreviewItemsRef.current
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
    clearZoneGhostPreviews()
    resetDragPreviewCache()
    clearExternalPreviewSession()
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
    const dataTransfer = e.dataTransfer!
    releaseTimelineDropPreviewOwner(previewOwnerId)
    clearPendingDragPreview()
    updateDragOverFlags(false, false)
    clearZoneGhostPreviews()
    resetDragPreviewCache()
    clearExternalPreviewSession()

    const dropFrame = getDropFrame(e)
    if (dropFrame === null) {
      return
    }

    const rawJson = dataTransfer.getData('application/json')
    if (rawJson) {
      try {
        const data = JSON.parse(rawJson)

        if (data.type === 'composition') {
          const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
          if (zone !== 'video') {
            toast.error(t('timeline.track.compositionDropWrongZone'))
            return
          }

          if (
            wouldCreateCompositionCycle({
              parentCompositionId: activeCompositionId,
              insertedCompositionId: data.compositionId,
              compositionById: useCompositionsStore.getState().compositionById,
            })
          ) {
            toast.error(t('timeline.track.compositionDropCycle'))
            return
          }

          const { compositionId, name, durationInFrames } = data as CompositionDragData
          const currentTracks = useItemsStore.getState().tracks
          const preferredTrackHeight =
            currentTracks.find((track) => track.id === anchorTrackId)?.height ?? 64
          const compositionById = useCompositionsStore.getState().compositionById
          const composition = compositionById[compositionId]
          if (!composition) {
            logger.warn(
              'Cannot drop composition into new track zone: compound clip definition not found',
            )
            return
          }

          const { plannedItems, tracks: nextTracks } = planNewTrackZonePlacements({
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
            tracks: currentTracks,
            existingItems: useItemsStore.getState().items,
            anchorTrackId,
            zone,
            preferredTrackHeight,
          })
          const plannedItem = plannedItems[0]
          if (!plannedItem) {
            logger.warn('Cannot drop composition into new track zone: no available space')
            return
          }

          if (nextTracks !== currentTracks) {
            setTracks(nextTracks)
          }

          const droppedItems = buildDroppedCompositionTimelineItems({
            compositionId,
            composition,
            label: name,
            placements: plannedItem.placements,
          })
          if (droppedItems.length === 0) {
            logger.warn(
              'Cannot drop composition into new track zone: failed to build compound clip wrappers',
            )
            return
          }

          addItems(droppedItems)
          return
        }

        if (isTimelineTemplateDragData(data)) {
          if (zone !== 'video') {
            toast.error(t('timeline.track.templateVideoOnly'))
            return
          }

          const templateDrop = buildTimelineTemplateItem(data, dropFrame)
          if (!templateDrop) {
            toast.error(t('timeline.track.unableToAddDroppedItem'))
            return
          }

          if (templateDrop.tracks !== useItemsStore.getState().tracks) {
            setTracks(templateDrop.tracks)
          }

          addItem(templateDrop.item)
          return
        }

        const entries = resolveDroppedMediaEntriesFromPayload(data, getMedia.current, logger)

        if (entries.length === 0) {
          toast.error(t('timeline.track.noSupportedMediaInDrop'))
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
      importHandlesForPlacement: importHandlesForPlacement.current,
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

{#if height > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={zoneElement}
    data-timeline-drop-target="true"
    class="relative"
    style:height="var(--timeline-{zone}-zone-height, {height}px)"
    ondragentercapture={handleDragEnterCapture}
    ondragover={handleDragOver}
    ondragleavecapture={handleDragLeave}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <NewTrackZoneGhostOverlay {zone} />
  </div>
{/if}
