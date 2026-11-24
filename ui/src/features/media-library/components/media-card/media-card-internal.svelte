<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { i18n } from '@/i18n'
  import Video from 'lucide-svelte/icons/video'
  import FileAudio from 'lucide-svelte/icons/file-audio'
  import FileJson from 'lucide-svelte/icons/file-json'
  import ImageIcon from 'lucide-svelte/icons/image'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Link2Off from 'lucide-svelte/icons/link-2-off'
  import Zap from 'lucide-svelte/icons/zap'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Globe from 'lucide-svelte/icons/globe'
  import CloudUpload from 'lucide-svelte/icons/cloud-upload'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import type { MediaMetadata } from '@/types/storage'
  import { importMediaLibraryService } from '@/features/media-library/services/media-library-service-loader'
  import { importMediaAnalysisService } from '@/features/media-library/services/media-analysis-service-loader'
  import { getMediaType, formatDuration } from '@/features/media-library/utils/validation'
  import { getSharedProxyKey } from '@/features/media-library/utils/proxy-key'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { useMediaPreparationStore } from '@/features/media-library/stores/media-preparation-store'
  import { setMediaDragData, clearMediaDragData } from '@/features/media-library/utils/drag-data-cache'
  import { proxyService } from '@/features/media-library/services/proxy-service'
  import { frameInterpolationService } from '@/features/media-library/services/frame-interpolation-service'
  import type { InterpolationFactor } from '@/infrastructure/interpolation'
  import { upscaleService } from '@/features/media-library/services/upscale-service'
  import type { UpscaleVariant } from '@/infrastructure/upscale'
  import { mediaTranscriptionService } from '@/features/media-library/services/media-transcription-service'
  import {
    cancelMediaTranscriptionJob,
    runMediaTranscriptionJob,
  } from '@/features/media-library/services/media-transcription-runner'
  import { subtitleSidecarService } from '@/features/media-library/services/subtitle-sidecar-service'
  import { useEditorStore } from '@/shared/state/editor'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import {
    getTranscriptionOverallPercent,
    getTranscriptionProgressDetail,
    getTranscriptionProgressLabel,
    isIndeterminateTranscriptionProgress,
  } from '@/shared/utils/transcription-progress'
  import {
    isTranscriptionOutOfMemoryError,
    TRANSCRIPTION_OOM_HINT,
  } from '@/shared/utils/transcription-cancellation'
  import { useSubtitleScanProgressStore } from '@/features/media-library/stores/subtitle-scan-progress-store'
  import { audioScrubPreview, getAudioScrubTime } from '@/features/media-library/utils/audio-scrub-preview'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import MediaInfoPopover from '../media-info-popover.svelte'
  import TranscribeDialog from '../transcribe-dialog.svelte'
  import type { TranscribeDialogValues } from '../transcribe-dialog-types'
  import { CARD_GRID_BASE, CARD_LIST_BASE, CARD_PERF_STYLE } from '../card-styles'
  import MediaCardActionMenuItems from './media-card-action-menu-items.svelte'
  import {
    canExtractEmbeddedSubtitlesFromMedia,
    DEFAULT_CAPTION_SELECTION_DURATION_SEC,
    getSkimIndicatorStyle,
    getSubtitleExtractionErrorMessage,
    getSubtitleSourceBlob,
    markSubtitleSourceUnreadable,
    requestSubtitleSourcePermission,
    type MediaCardProps,
  } from './media-card-helpers'

  type MediaCardInternalProps = MediaCardProps & { layout: 'grid' | 'list' }

  let {
    media,
    selected = false,
    isBroken = false,
    onSelect,
    onDoubleClick,
    onDelete,
    onRelink,
    layout,
  }: MediaCardInternalProps = $props()

  let thumbnailUrl = $state<string | null>(null)
  let skimProgress = $state<number | null>(null)
  // The selectors close over `media.id`, so they are rebuilt when it changes.
  const isImportingSelection = $derived(
    select(useMediaLibraryStore, (s) => s.importingIds.includes(media.id)),
  )
  const hasActivePreparationTasksSelection = $derived(
    select(useMediaPreparationStore, (s) => {
      for (const task of s.tasks.values()) {
        if (task.mediaId === media.id && task.type !== 'import' && task.status !== 'error') {
          return true
        }
      }
      return false
    }),
  )
  const proxyStatusSelection = $derived(
    select(useMediaLibraryStore, (s) => s.proxyStatus.get(media.id)),
  )
  const isInterpolatingSelection = $derived(
    select(useMediaLibraryStore, (s) => s.interpolationStatus.get(media.id) === 'generating'),
  )
  const isUpscalingSelection = $derived(
    select(useMediaLibraryStore, (s) => s.upscaleStatus.get(media.id) === 'generating'),
  )
  const transcriptStatusSelection = $derived(
    select(useMediaLibraryStore, (s) => s.transcriptStatus.get(media.id) ?? 'idle'),
  )
  const transcriptProgressSelection = $derived(
    select(useMediaLibraryStore, (s) => s.transcriptProgress.get(media.id)),
  )
  const isTaggingSelection = $derived(
    select(useMediaLibraryStore, (s) => s.taggingMediaIds.has(media.id)),
  )
  const isTranscriptionDialogOpenSelection = select(
    useEditorStore,
    (s) => s.transcriptionDialogDepth > 0,
  )

  const isImporting = $derived(isImportingSelection.current)
  const isPreparingMedia = $derived(isImporting || hasActivePreparationTasksSelection.current)
  const preparingLabel = $derived(t('media.card.preparing'))
  const proxyStatus = $derived(proxyStatusSelection.current)
  const isInterpolating = $derived(isInterpolatingSelection.current)
  const isUpscaling = $derived(isUpscalingSelection.current)
  const transcriptStatus = $derived(transcriptStatusSelection.current)
  const transcriptProgress = $derived(transcriptProgressSelection.current)

  const mediaType = $derived(getMediaType(media.mimeType))
  const isTranscribable = $derived(mediaType === 'video' || mediaType === 'audio')
  const canGenerateProxy = $derived(
    mediaType === 'video' &&
      !isBroken &&
      !isPreparingMedia &&
      proxyService.canGenerateProxy(media.mimeType),
  )
  const hasProxy = $derived(proxyStatus === 'ready')
  const canInterpolate = $derived(
    mediaType === 'video' &&
      !isBroken &&
      !isPreparingMedia &&
      frameInterpolationService.canInterpolate(media.mimeType),
  )
  // Hidden rather than disabled when the 2x output would be too large for any encoder to take:
  // there is nothing the user could do about it from this menu.
  const canUpscaleMedia = $derived(
    mediaType === 'video' &&
      !isBroken &&
      !isPreparingMedia &&
      upscaleService.canUpscaleMedia(media.mimeType, media.width, media.height),
  )
  const hasTranscript = $derived(transcriptStatus === 'ready')
  const isTranscribing = $derived(
    transcriptStatus === 'transcribing' || transcriptStatus === 'queued',
  )
  const isTagging = $derived(isTaggingSelection.current)
  const isTaggable = $derived(mediaType === 'video' || mediaType === 'image')
  const hasCaptions = $derived((media.aiCaptions?.length ?? 0) > 0)
  // URL media streams from where it lives (docs/MEDIA.md); the card says so.
  const isUrlMedia = $derived(media.storageType === 'url')
  const isMemoryMedia = $derived(media.storageType === 'memory')
  let thumbnailEl = $state<HTMLImageElement | null>(null)
  let thumbnailContainerEl = $state<HTMLDivElement | null>(null)
  let dragImage: HTMLDivElement | null = null
  const isTranscriptionDialogOpen = $derived(isTranscriptionDialogOpenSelection.current)

  const isAudio = $derived(mediaType === 'audio' && !isBroken && !isPreparingMedia)
  let transcribeDialogOpen = $state(false)
  let transcribeErrorMessage = $state<string | null>(null)
  let isExtractingEmbeddedSubtitles = $state(false)

  // Load thumbnail on mount and when thumbnailId changes (e.g. after regeneration)
  $effect(() => {
    const mediaId = media.id
    const thumbnailId = media.thumbnailId
    let mounted = true

    const loadThumbnail = async () => {
      const { mediaLibraryService } = await importMediaLibraryService()
      const url = await mediaLibraryService.getThumbnailBlobUrl(mediaId, thumbnailId)
      if (mounted) {
        thumbnailUrl = url
      }
    }

    void loadThumbnail()

    return () => {
      mounted = false
    }
  })

  function getTargetMediaItems(): MediaMetadata[] {
    const store = useMediaLibraryStore.getState()
    const selectedIds = store.selectedMediaIds
    if (selectedIds.length > 1 && selectedIds.includes(media.id)) {
      return selectedIds
        .map((id) => store.mediaById[id])
        .filter((m): m is MediaMetadata => m !== undefined)
    }
    return [media]
  }

  function handleContextMenuOpenChange(open: boolean) {
    if (!open) return
    const store = useMediaLibraryStore.getState()
    if (!store.selectedMediaIds.includes(media.id)) {
      store.setSelection({ mediaIds: [media.id], compositionIds: [] })
    }
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    const targets = getTargetMediaItems()
    onDelete?.(targets.map((m) => m.id))
  }

  function handleGenerateProxy(e: MouseEvent) {
    e.stopPropagation()
    const store = useMediaLibraryStore.getState()
    const targets = getTargetMediaItems().filter(
      (m) =>
        proxyService.canGenerateProxy(m.mimeType) &&
        store.proxyStatus.get(m.id) !== 'ready' &&
        store.proxyStatus.get(m.id) !== 'generating',
    )
    for (const item of targets) {
      try {
        const proxyKey = getSharedProxyKey(item)
        proxyService.setProxyKey(item.id, proxyKey)
        void proxyService.generateProxy(
          item.id,
          item.storageType === 'opfs' && item.opfsPath
            ? { kind: 'opfs', path: item.opfsPath, mimeType: item.mimeType }
            : async () => {
                const { mediaLibraryService } = await importMediaLibraryService()
                return mediaLibraryService.getMediaFile(item.id)
              },
          item.width,
          item.height,
          proxyKey,
        )
      } catch {
        useMediaLibraryStore.getState().setProxyStatus(item.id, 'error')
      }
    }
  }

  function handleInterpolate(factor: InterpolationFactor) {
    const store = useMediaLibraryStore.getState()
    const projectId = store.currentProjectId
    if (!projectId) return

    const targets = getTargetMediaItems().filter(
      (m) =>
        frameInterpolationService.canInterpolate(m.mimeType) &&
        !frameInterpolationService.isGenerating(m.id),
    )
    for (const item of targets) {
      void frameInterpolationService.generate({
        mediaId: item.id,
        projectId,
        fileName: item.fileName,
        factor,
        source:
          item.storageType === 'opfs' && item.opfsPath
            ? { kind: 'opfs', path: item.opfsPath, mimeType: item.mimeType }
            : async () => {
                const { mediaLibraryService } = await importMediaLibraryService()
                return mediaLibraryService.getMediaFile(item.id)
              },
        // Only a hint for the progress bar; the worker measures the true rate itself, and takes
        // the frame size from the decoder rather than from this item's metadata.
        sourceFps: item.fps || 30,
      })
    }
  }

  function handleCancelInterpolation() {
    for (const item of getTargetMediaItems()) {
      frameInterpolationService.cancel(item.id)
    }
  }

  function handleUpscale(variant: UpscaleVariant) {
    const store = useMediaLibraryStore.getState()
    const projectId = store.currentProjectId
    if (!projectId) return

    const targets = getTargetMediaItems().filter(
      (m) =>
        upscaleService.canUpscaleMedia(m.mimeType, m.width, m.height) &&
        !upscaleService.isGenerating(m.id),
    )
    for (const item of targets) {
      void upscaleService.generate({
        mediaId: item.id,
        projectId,
        fileName: item.fileName,
        variant,
        source:
          item.storageType === 'opfs' && item.opfsPath
            ? { kind: 'opfs', path: item.opfsPath, mimeType: item.mimeType }
            : async () => {
                const { mediaLibraryService } = await importMediaLibraryService()
                return mediaLibraryService.getMediaFile(item.id)
              },
        // Only a hint for the progress bar; the worker measures the true rate itself, and takes
        // the frame size from the decoder rather than from this item's metadata.
        sourceFps: item.fps,
      })
    }
  }

  function handleCancelUpscale() {
    for (const item of getTargetMediaItems()) {
      upscaleService.cancel(item.id)
    }
  }

  async function handleDeleteProxy(e: MouseEvent) {
    e.stopPropagation()
    const targets = getTargetMediaItems().filter(
      (m) => useMediaLibraryStore.getState().proxyStatus.get(m.id) === 'ready',
    )
    const uniqueKeys = new Map<string, MediaMetadata>()
    for (const item of targets) {
      const key = getSharedProxyKey(item)
      if (!uniqueKeys.has(key)) uniqueKeys.set(key, item)
    }
    for (const [sharedProxyKey, representative] of uniqueKeys) {
      try {
        await proxyService.deleteProxy(representative.id, sharedProxyKey)

        const store = useMediaLibraryStore.getState()
        for (const other of store.mediaItems) {
          if (other.mimeType.startsWith('video/') && getSharedProxyKey(other) === sharedProxyKey) {
            store.clearProxyStatus(other.id)
            proxyService.clearProxyKey(other.id)
          }
        }
      } catch {
        const store = useMediaLibraryStore.getState()
        for (const other of store.mediaItems) {
          if (other.mimeType.startsWith('video/') && getSharedProxyKey(other) === sharedProxyKey) {
            store.setProxyStatus(other.id, 'error')
          }
        }
      }
    }
  }

  function handleOpenTranscribeDialog(e: MouseEvent) {
    e.stopPropagation()
    transcribeErrorMessage = null
    transcribeDialogOpen = true
  }

  function handleStartTranscription(values: TranscribeDialogValues) {
    const store = useMediaLibraryStore.getState()
    const targets = getTargetMediaItems()

    transcribeErrorMessage = null

    // Close the dialog and transcribe in the background — exactly like the transcript
    // panel, which just calls transcribeMedia and tracks status. Keeping the modal open
    // during the job (animated spinner + backdrop forcing continuous compositing) while
    // the WebGPU encoder runs in the media-library view deadlocked the renderer.
    transcribeDialogOpen = false

    void (async () => {
      let succeeded = 0
      let failed = 0
      let lastErrorMessage: string | null = null

      for (const target of targets) {
        try {
          const result = await runMediaTranscriptionJob(target.id, {
            model: values.model,
            quantization: values.quantization,
            language: values.language || undefined,
            onModelFallback: () => {
              store.showNotification({
                type: 'info',
                message: i18n.t('transcript.largeTurboFallback'),
              })
            },
          })
          if (result.status === 'cancelled') {
            continue
          }
          succeeded += 1
        } catch (error) {
          const baseMessage =
            error instanceof Error ? error.message : i18n.t('media.card.transcribeFailed')
          lastErrorMessage = isTranscriptionOutOfMemoryError(error)
            ? TRANSCRIPTION_OOM_HINT
            : baseMessage
          failed += 1
        }
      }

      if (failed === 0 && succeeded > 0) {
        if (targets.length === 1) {
          store.showNotification({
            type: 'success',
            message: i18n.t('media.card.transcriptReadyFor', { name: targets[0]!.fileName }),
          })
        } else {
          store.showNotification({
            type: 'success',
            message: i18n.t('media.card.transcriptsReady', { count: succeeded }),
          })
        }
        transcribeDialogOpen = false
      } else if (failed > 0) {
        const msg = lastErrorMessage ?? i18n.t('media.card.transcribeFailed')
        transcribeErrorMessage = msg
        store.showNotification({
          type: 'error',
          message:
            targets.length === 1
              ? msg
              : i18n.t('media.card.transcriptionFailedFor', {
                  failed,
                  total: targets.length,
                }),
        })
      } else {
        transcribeDialogOpen = false
      }
    })()
  }

  function handleCancelTranscript(e?: MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    const store = useMediaLibraryStore.getState()
    const targets = getTargetMediaItems().filter((m) => {
      const status = store.transcriptStatus.get(m.id)
      return status === 'queued' || status === 'transcribing'
    })
    for (const item of targets) {
      cancelMediaTranscriptionJob(item.id)
    }
  }

  async function handleDeleteTranscript(e: MouseEvent) {
    e.stopPropagation()

    const store = useMediaLibraryStore.getState()
    const targets = getTargetMediaItems().filter(
      (m) => store.transcriptStatus.get(m.id) === 'ready',
    )

    let failures = 0
    for (const item of targets) {
      try {
        await mediaTranscriptionService.deleteTranscript(item.id)
        store.setTranscriptStatus(item.id, 'idle')
        store.clearTranscriptProgress(item.id)
      } catch {
        failures += 1
      }
    }

    if (targets.length === 1 && failures === 0) {
      const [only] = targets
      store.showNotification({
        type: 'success',
        message: i18n.t('media.card.transcriptDeletedFor', { name: only!.fileName }),
      })
    } else if (targets.length > 1 && failures === 0) {
      store.showNotification({
        type: 'success',
        message: i18n.t('media.card.transcriptsDeleted', { count: targets.length }),
      })
    } else if (failures > 0) {
      store.showNotification({
        type: 'error',
        message:
          failures === targets.length
            ? i18n.t('media.card.transcriptDeleteFailed')
            : i18n.t('media.card.transcriptDeleteFailedFor', {
                failed: failures,
                total: targets.length,
              }),
      })
    }
  }

  async function handleExtractEmbeddedSubtitles(e: MouseEvent) {
    e.stopPropagation()
    const targets = getTargetMediaItems().filter(canExtractEmbeddedSubtitlesFromMedia)
    const store = useMediaLibraryStore.getState()
    if (targets.length === 0) {
      store.showNotification({
        type: 'error',
        message: i18n.t('media.card.chooseMkvOrWebm'),
      })
      return
    }

    // Media-library extraction is purely a cache operation — never inserts
    // onto the timeline. The user reaches the insert flow from the clip
    // context menu after the cache is warm. Show the scan progress dialog so
    // long parses (multi-GB MKVs) have visible feedback.
    isExtractingEmbeddedSubtitles = true
    const progress = useSubtitleScanProgressStore.getState()
    const abortController = new AbortController()
    progress.start({
      files: targets.map((target) => ({
        fileName: target.fileName,
        // Optimistic placeholder; replaced once the blob is opened and we
        // know the actual byte size.
        totalBytes: target.fileSize ?? 0,
      })),
      abort: () => abortController.abort(),
    })

    let succeeded = 0
    let totalTracksCached = 0
    let lastErrorMessage: string | null = null

    try {
      for (let i = 0; i < targets.length; i++) {
        if (abortController.signal.aborted) break
        const target = targets[i]!
        useSubtitleScanProgressStore.getState().setCurrentIndex(i)
        try {
          const hasPermission = await requestSubtitleSourcePermission(target)
          if (!hasPermission) {
            markSubtitleSourceUnreadable(target, 'permission_denied')
            lastErrorMessage = i18n.t('media.card.subtitlesNeedPermission', {
              name: target.fileName,
            })
            useSubtitleScanProgressStore.getState().markEntryStatus(i, 'error')
            continue
          }

          const sourceBlob = await getSubtitleSourceBlob(target)
          const result = await subtitleSidecarService.scanEmbeddedSubtitleTracks(
            target,
            sourceBlob,
            {
              onProgress: ({ bytesRead }) => {
                useSubtitleScanProgressStore.getState().updateProgress(bytesRead)
              },
              signal: abortController.signal,
            },
          )
          // Surface 100% even when no clusters fired the periodic tick.
          useSubtitleScanProgressStore.getState().updateProgress(sourceBlob.size)
          useSubtitleScanProgressStore.getState().markEntryStatus(i, 'done')
          totalTracksCached += result.tracks.length
          succeeded += 1
        } catch (error) {
          if (abortController.signal.aborted) break
          lastErrorMessage = getSubtitleExtractionErrorMessage(error, target)
          useSubtitleScanProgressStore.getState().markEntryStatus(i, 'error')
        }
      }
    } finally {
      isExtractingEmbeddedSubtitles = false
    }

    if (abortController.signal.aborted) {
      // User-cancelled mid-batch — dialog already cleared by close().
      return
    }

    if (succeeded > 0) {
      const summary =
        succeeded === targets.length
          ? i18n.t('media.card.subtitlesCachedAll', {
              tracks: totalTracksCached,
              files: succeeded,
            })
          : i18n.t('media.card.subtitlesCachedPartial', {
              succeeded,
              total: targets.length,
              tracks: totalTracksCached,
            })
      useSubtitleScanProgressStore.getState().finish(summary)
      return
    }

    // All failures — close progress dialog and surface a notification.
    useSubtitleScanProgressStore.getState().close()
    store.showNotification({
      type: 'error',
      message: lastErrorMessage ?? i18n.t('media.card.subtitlesScanFailed'),
    })
  }

  async function handleAnalyzeWithAI(e: MouseEvent) {
    e.stopPropagation()
    const store = useMediaLibraryStore.getState()
    const analyzable = getTargetMediaItems().filter((m) => {
      const type = getMediaType(m.mimeType)
      if (type !== 'video' && type !== 'image') return false
      if (store.brokenMediaIds?.includes(m.id)) return false
      if (store.importingIds?.includes(m.id)) return false
      return true
    })
    if (analyzable.length > 1) {
      const { mediaAnalysisService } = await importMediaAnalysisService()
      await mediaAnalysisService.analyzeBatch({ mediaIds: analyzable.map((m) => m.id) })
    } else if (analyzable.length === 1) {
      const { mediaAnalysisService } = await importMediaAnalysisService()
      await mediaAnalysisService.analyzeMedia(analyzable[0]!)
    } else {
      const type = getMediaType(media.mimeType)
      if (type === 'video' || type === 'image') {
        const { mediaAnalysisService } = await importMediaAnalysisService()
        await mediaAnalysisService.analyzeMedia(media)
      }
    }
  }

  let removeNativeDragCleanupListeners: (() => void) | null = null

  function cleanupDragArtifacts() {
    removeNativeDragCleanupListeners?.()
    removeNativeDragCleanupListeners = null
    clearMediaDragData()
    if (dragImage) {
      dragImage.remove()
      dragImage = null
    }
  }

  function installNativeDragCleanupListeners() {
    cleanupDragArtifacts()

    const handleNativeDragEnd = () => cleanupDragArtifacts()
    const handleNativeDrop = () => {
      window.setTimeout(cleanupDragArtifacts, 0)
    }
    const handleWindowBlur = () => cleanupDragArtifacts()

    window.addEventListener('dragend', handleNativeDragEnd, true)
    document.addEventListener('drop', handleNativeDrop, true)
    window.addEventListener('blur', handleWindowBlur)

    removeNativeDragCleanupListeners = () => {
      window.removeEventListener('dragend', handleNativeDragEnd, true)
      document.removeEventListener('drop', handleNativeDrop, true)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }

  function handleDragStart(e: DragEvent) {
    installNativeDragCleanupListeners()
    const dataTransfer = e.dataTransfer
    if (!dataTransfer) return
    // Set drag data for timeline drop
    dataTransfer.effectAllowed = 'copy'
    const mediaStore = useMediaLibraryStore.getState()
    const selectedMediaIds = mediaStore.selectedMediaIds
    const mediaById = mediaStore.mediaById

    // If this item is selected and there are multiple selected items, drag all of them
    const isPartOfSelection = selectedMediaIds.includes(media.id)
    const hasMultipleSelected = selectedMediaIds.length > 1

    if (isPartOfSelection && hasMultipleSelected) {
      // Build array of all selected media items in their current order
      const selectedItems = selectedMediaIds
        .map((id) => mediaById[id])
        .filter((m): m is MediaMetadata => m !== undefined)
        .map((m) => ({
          mediaId: m.id,
          mediaType: getMediaType(m.mimeType),
          fileName: m.fileName,
          duration: m.duration,
        }))

      const dragData = {
        type: 'media-items' as const,
        items: selectedItems,
      }

      dataTransfer.setData('application/json', JSON.stringify(dragData))
      // Cache for dragover access
      setMediaDragData(dragData)
    } else {
      // Single item drag
      const dragData = {
        type: 'media-item' as const,
        mediaId: media.id,
        mediaType: mediaType,
        fileName: media.fileName,
        duration: media.duration,
      }

      dataTransfer.setData('application/json', JSON.stringify(dragData))
      // Cache for dragover access
      setMediaDragData(dragData)
    }

    // Custom drag image: show just the thumbnail at natural aspect ratio.
    // thumbnailEl is the grid-view <img>; for list view, query the card element.
    const thumbEl =
      thumbnailEl ?? (e.currentTarget as HTMLElement).querySelector<HTMLImageElement>('img[alt]')
    if (thumbEl && thumbEl.naturalWidth > 0) {
      const maxDim = 120
      const ratio = thumbEl.naturalWidth / thumbEl.naturalHeight
      const w = ratio >= 1 ? maxDim : Math.round(maxDim * ratio)
      const h = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim

      const ghost = document.createElement('div')
      ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${w}px;height:${h}px;border-radius:4px;overflow:hidden;opacity:0.85;`
      const img = document.createElement('img')
      img.src = thumbEl.src
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
      ghost.appendChild(img)
      document.body.appendChild(ghost)
      dragImage = ghost

      dataTransfer.setDragImage(ghost, w / 2, h / 2)
    }
  }

  $effect(() => cleanupDragArtifacts)

  function handleClick(e: MouseEvent) {
    onSelect?.(e)
  }

  function handleDoubleClick(e: MouseEvent) {
    e.stopPropagation()
    onDoubleClick?.()
  }

  let audioScrubUrl: string | null = null
  let audioScrubRequestId = 0

  async function scrubAudioAtProgress(progress: number) {
    if (!isAudio || media.duration <= 0) return
    const requestId = ++audioScrubRequestId
    let mediaUrl = audioScrubUrl

    try {
      if (!mediaUrl) {
        const { mediaLibraryService } = await importMediaLibraryService()
        mediaUrl = await mediaLibraryService.getMediaBlobUrl(media.id)
        if (!mediaUrl || requestId !== audioScrubRequestId) return
        audioScrubUrl = mediaUrl
      }

      await audioScrubPreview.scrub({
        mediaId: media.id,
        mediaUrl,
        timeSeconds: getAudioScrubTime(media.duration, progress),
      })
    } catch {
      // Audio scrub preview is opportunistic; failed decode/autoplay should not
      // block normal media-library hover or selection behavior.
    }
  }

  function stopAudioScrubPreview() {
    audioScrubRequestId += 1
    audioScrubPreview.stop()
  }

  const canHoverPreview = $derived(
    (mediaType === 'video' || mediaType === 'audio' || mediaType === 'image') &&
      !isBroken &&
      !isPreparingMedia &&
      !isTranscriptionDialogOpen,
  )
  const canScrubPreview = $derived(
    (mediaType === 'video' || mediaType === 'audio') &&
      media.duration > 0 &&
      !isBroken &&
      !isPreparingMedia &&
      !isTranscriptionDialogOpen,
  )
  let skimRaf: number | null = null
  let pendingSkimClientX: number | null = null

  function updateSkimPreview(clientX: number) {
    const thumbnailContainer = thumbnailContainerEl
    if (!thumbnailContainer || !canHoverPreview) return

    const editor = useEditorStore.getState()
    if (!canScrubPreview) {
      skimProgress = null
      editor.setMediaSkimPreview(media.id, 0)
      return
    }

    const rect = thumbnailContainer.getBoundingClientRect()
    if (rect.width <= 0) return

    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    skimProgress = progress

    if (mediaType === 'audio') {
      editor.setMediaSkimPreview(media.id, 0)
      void scrubAudioAtProgress(progress)
      return
    }

    const durationInFrames = Math.max(1, Math.round(media.duration * (media.fps || 30)))
    const frame = Math.min(
      durationInFrames - 1,
      Math.max(0, Math.round(progress * (durationInFrames - 1))),
    )

    editor.setMediaSkimPreview(media.id, frame)
  }

  function flushScheduledSkimPreview() {
    skimRaf = null
    const clientX = pendingSkimClientX
    pendingSkimClientX = null
    if (clientX === null) return
    updateSkimPreview(clientX)
  }

  function scheduleSkimPreview(clientX: number) {
    pendingSkimClientX = clientX
    if (skimRaf !== null) {
      return
    }

    skimRaf = requestAnimationFrame(flushScheduledSkimPreview)
  }

  function cancelScheduledSkimPreview() {
    pendingSkimClientX = null
    if (skimRaf !== null) {
      cancelAnimationFrame(skimRaf)
      skimRaf = null
    }
  }

  function handleThumbnailPointerEnter(event: PointerEvent) {
    if (!canHoverPreview || event.pointerType === 'touch') return
    usePlaybackStore.getState().pause()
    updateSkimPreview(event.clientX)
  }

  function handleThumbnailPointerMove(event: PointerEvent) {
    if (!canScrubPreview || event.pointerType === 'touch') return
    scheduleSkimPreview(event.clientX)
  }

  function handleThumbnailPointerLeave() {
    if (!canHoverPreview) return
    cancelScheduledSkimPreview()
    stopAudioScrubPreview()
    skimProgress = null
    useEditorStore.getState().clearMediaSkimPreview()
  }

  $effect(() => {
    if (!canHoverPreview) return
    const mediaId = media.id
    return () => {
      cancelScheduledSkimPreview()
      stopAudioScrubPreview()
      const editor = useEditorStore.getState()
      if (editor.mediaSkimPreviewMediaId === mediaId) {
        editor.clearMediaSkimPreview()
      }
    }
  })

  function handleSeekToCaption(timeSec: number) {
    const fps = media.fps || 30
    const sourceDurationFrames = Math.max(1, Math.round(media.duration * fps))
    const frame = Math.max(0, Math.min(sourceDurationFrames - 1, Math.round(timeSec * fps)))
    const outFrame = Math.min(
      sourceDurationFrames,
      frame + Math.max(1, Math.round(DEFAULT_CAPTION_SELECTION_DURATION_SEC * fps)),
    )
    const sourceStore = useSourcePlayerStore.getState()

    sourceStore.setCurrentMediaId(media.id)
    sourceStore.clearInOutPoints()
    sourceStore.setInPoint(frame)
    sourceStore.setOutPoint(outFrame)
    sourceStore.setPendingSeekFrame(frame)
    useEditorStore.getState().setSourcePreviewMediaId(media.id)
  }

  // The card's inline bars have room for exactly one number, so they show job-wide progress.
  const transcriptProgressPercent = $derived(
    transcriptProgress ? Math.round(getTranscriptionOverallPercent(transcriptProgress)) : null,
  )
  // The dialog has room to name the stage, so its bar tracks the stage instead — a job-wide
  // percent would inch across the first tenth of the track for a multi-minute model download.
  const transcriptStagePercent = $derived(
    transcriptProgress ? Math.round(transcriptProgress.progress * 100) : null,
  )
  const transcriptProgressIndeterminate = $derived(
    transcriptProgress ? isIndeterminateTranscriptionProgress(transcriptProgress) : false,
  )
  const transcriptProgressLabel = $derived(
    transcriptProgress
      ? getTranscriptionProgressLabel(transcriptProgress)
      : t('media.card.transcribing'),
  )
  const transcriptProgressDetail = $derived(
    transcriptProgress ? getTranscriptionProgressDetail(transcriptProgress) : null,
  )

  const listClass = $derived(`
          ${CARD_LIST_BASE} cursor-pointer
          ${selected ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/50'}
          ${isPreparingMedia ? 'opacity-80 cursor-default' : ''}
        `)
  const gridClass = $derived(`
        ${CARD_GRID_BASE} cursor-pointer
        ${
          selected
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'
        }
        ${isPreparingMedia ? 'cursor-default' : ''}
      `)
</script>

{#snippet icon()}
  {#if mediaType === 'video'}
    <Video class="w-5 h-5 text-primary" />
  {:else if mediaType === 'audio'}
    <FileAudio class="w-5 h-5 text-green-500" />
  {:else if mediaType === 'image'}
    <ImageIcon class="w-5 h-5 text-blue-500" />
  {:else if mediaType === 'lottie'}
    <FileJson class="w-5 h-5 text-purple-500" />
  {:else}
    <Video class="w-5 h-5 text-muted-foreground" />
  {/if}
{/snippet}

{#snippet typeBadgeIcon()}
  {#if mediaType === 'video'}
    <Video class="w-2.5 h-2.5" />
  {/if}
  {#if mediaType === 'audio'}
    <FileAudio class="w-2.5 h-2.5" />
  {/if}
  {#if mediaType === 'image'}
    <ImageIcon class="w-2.5 h-2.5" />
  {/if}
  {#if mediaType === 'lottie'}
    <FileJson class="w-2.5 h-2.5" />
  {/if}
{/snippet}

{#snippet transcriptProgressBar()}
  {#if !isBroken && !isPreparingMedia && isTranscribing && transcriptProgressPercent !== null}
    <div
      role="progressbar"
      aria-label={t('media.card.transcriptProgressAria')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={transcriptProgressPercent}
      class="absolute inset-x-0 bottom-0 z-10 h-1 overflow-hidden bg-black/25 pointer-events-none"
    >
      <div
        class="h-full bg-blue-500 transition-all duration-300"
        style:width="{transcriptProgressPercent}%"
      ></div>
    </div>
  {/if}
{/snippet}

{#snippet actionMenuItems()}
  <MediaCardActionMenuItems
    {media}
    {isBroken}
    {onRelink}
    {canGenerateProxy}
    {hasProxy}
    {proxyStatus}
    {canInterpolate}
    {isInterpolating}
    onInterpolate={handleInterpolate}
    onCancelInterpolation={handleCancelInterpolation}
    canUpscale={canUpscaleMedia}
    {isUpscaling}
    onUpscale={handleUpscale}
    onCancelUpscale={handleCancelUpscale}
    {isTranscribable}
    {isTranscribing}
    {hasTranscript}
    canExtractEmbeddedSubtitles={getTargetMediaItems().some(canExtractEmbeddedSubtitlesFromMedia)}
    {isExtractingEmbeddedSubtitles}
    {isTaggable}
    {isTagging}
    onGenerateProxy={handleGenerateProxy}
    onDeleteProxy={handleDeleteProxy}
    onGenerateTranscript={handleOpenTranscribeDialog}
    onDeleteTranscript={handleDeleteTranscript}
    onExtractEmbeddedSubtitles={handleExtractEmbeddedSubtitles}
    onAnalyzeWithAI={handleAnalyzeWithAI}
    onDelete={handleDelete}
  />
{/snippet}

<TranscribeDialog
  open={transcribeDialogOpen}
  onOpenChange={(next) => {
    if (!next) transcribeErrorMessage = null
    transcribeDialogOpen = next
  }}
  fileName={media.fileName}
  {hasTranscript}
  isRunning={isTranscribing}
  progressPercent={transcriptStagePercent}
  progressIndeterminate={transcriptProgressIndeterminate}
  progressLabel={transcriptProgressLabel}
  progressDetail={transcriptProgressDetail}
  errorMessage={transcribeErrorMessage}
  onStart={handleStartTranscription}
  onCancel={handleCancelTranscript}
/>
{#if layout === 'list'}
  <!-- List view -->
  <ContextMenu onOpenChange={handleContextMenuOpenChange}>
    <ContextMenuTrigger
      disabled={isPreparingMedia}
      style={CARD_PERF_STYLE}
      class={listClass}
      draggable={!isPreparingMedia}
      ondragstart={isPreparingMedia ? undefined : handleDragStart}
      ondragend={isPreparingMedia ? undefined : cleanupDragArtifacts}
      onclick={isPreparingMedia ? undefined : handleClick}
      ondblclick={isPreparingMedia ? undefined : handleDoubleClick}
    >
      {#snippet child({ props })}
        <div {...props}>
          <!-- Thumbnail -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={thumbnailContainerEl}
            class="w-12 h-9 bg-secondary rounded overflow-hidden flex-shrink-0 relative"
            onpointerenter={handleThumbnailPointerEnter}
            onpointermove={handleThumbnailPointerMove}
            onpointerleave={handleThumbnailPointerLeave}
          >
            {#if thumbnailUrl}
              <img src={thumbnailUrl} alt={media.fileName} class="w-full h-full object-contain" />
            {:else}
              <div class="w-full h-full flex items-center justify-center">{@render icon()}</div>
            {/if}
            <!-- Preparing overlay for list view thumbnail -->
            {#if isPreparingMedia}
              <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 class="w-4 h-4 text-white animate-spin" />
              </div>
            {/if}
            <!-- Broken indicator for list view -->
            {#if isBroken && !isPreparingMedia}
              <div
                class="absolute top-0.5 right-0.5 p-0.5 rounded bg-destructive/90 text-destructive-foreground"
              >
                <Link2Off class="w-2.5 h-2.5" />
              </div>
            {/if}
            {#if !isBroken && !isPreparingMedia && isUrlMedia}
              <div
                class="absolute top-0.5 left-0.5 p-0.5 rounded bg-black/60 text-white pointer-events-none"
                role="img"
                title={t('media.urlMedia.streamsFromUrl')}
                aria-label={t('media.urlMedia.streamsFromUrl')}
              >
                <Globe class="w-2.5 h-2.5" />
              </div>
            {/if}
            {#if !isBroken && !isPreparingMedia && isMemoryMedia}
              <div
                class="absolute top-0.5 left-0.5 p-0.5 rounded bg-black/60 text-white pointer-events-none"
                role="img"
                title={t('media.memoryMedia.notUploaded')}
                aria-label={t('media.memoryMedia.notUploaded')}
              >
                <CloudUpload class="w-2.5 h-2.5" />
              </div>
            {/if}
            <!-- Proxy badge for list view -->
            {#if !isBroken && !isPreparingMedia && proxyStatus === 'generating'}
              <div class="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-green-500/90 text-black">
                <Loader2 class="w-2.5 h-2.5 animate-spin" />
              </div>
            {/if}
            {#if !isBroken && !isPreparingMedia && isTagging}
              <div
                class="absolute bottom-0.5 left-0.5 p-0.5 rounded bg-purple-500/90 text-white"
                title={t('media.card.analyzingWithAI')}
              >
                <Loader2 class="w-2.5 h-2.5 animate-spin" />
              </div>
            {/if}
            {#if !isBroken && !isPreparingMedia && hasProxy}
              <div class="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-green-500/90 text-black">
                <Zap class="w-2.5 h-2.5" />
              </div>
            {/if}
            {#if canScrubPreview && skimProgress !== null}
              <div
                class="absolute inset-y-0 w-px bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] pointer-events-none"
                style={getSkimIndicatorStyle(skimProgress)}
              ></div>
            {/if}
            {@render transcriptProgressBar()}
          </div>

          <!-- Info — single row: icon + name + duration -->
          <div class="flex-1 min-w-0 flex items-center gap-1.5">
            {#if isImporting}
              <span class="text-[10px] text-muted-foreground">{preparingLabel}</span>
            {:else}
              <div class="p-0.5 rounded bg-primary/90 text-primary-foreground flex-shrink-0">
                {@render typeBadgeIcon()}
              </div>
              <h3 class="text-xs font-medium text-foreground truncate">
                {media.fileName}
              </h3>
              {#if (mediaType === 'video' || mediaType === 'audio') && media.duration > 0}
                <span class="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatDuration(media.duration)}
                </span>
              {/if}
            {/if}
          </div>

          <!-- Actions - hidden during upload -->
          {#if !isPreparingMedia}
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <MediaInfoPopover
                {media}
                triggerClass="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                onSeekToCaption={handleSeekToCaption}
              />
            </div>
          {/if}
        </div>
      {/snippet}
    </ContextMenuTrigger>
    <ContextMenuContent onclick={(e) => e.stopPropagation()}>
      {@render actionMenuItems()}
    </ContextMenuContent>
  </ContextMenu>
{:else}
  <!-- Grid view -->
  <ContextMenu onOpenChange={handleContextMenuOpenChange}>
    <ContextMenuTrigger
      disabled={isPreparingMedia}
      style={CARD_PERF_STYLE}
      class={gridClass}
      draggable={!isPreparingMedia}
      ondragstart={isPreparingMedia ? undefined : handleDragStart}
      ondragend={isPreparingMedia ? undefined : cleanupDragArtifacts}
      onclick={isPreparingMedia ? undefined : handleClick}
      ondblclick={isPreparingMedia ? undefined : handleDoubleClick}
    >
      {#snippet child({ props })}
        <div {...props}>
          <!-- Film strip perforations effect -->
          <div
            class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-muted to-secondary"
          ></div>
          <div
            class="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-muted to-secondary"
          ></div>

          <!-- Thumbnail - takes most of square space -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={thumbnailContainerEl}
            class="flex-1 bg-secondary relative overflow-hidden min-h-0"
            onpointerenter={handleThumbnailPointerEnter}
            onpointermove={handleThumbnailPointerMove}
            onpointerleave={handleThumbnailPointerLeave}
          >
            {#if thumbnailUrl}
              <img
                bind:this={thumbnailEl}
                src={thumbnailUrl}
                alt={media.fileName}
                class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
            {:else}
              <div
                class="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-panel-bg"
              >
                {@render icon()}
              </div>
            {/if}

            <!-- Selection glow - subtle overlay only -->
            {#if selected && !isPreparingMedia}
              <div class="absolute inset-0 bg-primary/10 pointer-events-none"></div>
            {/if}

            <!-- Preparing overlay -->
            {#if isPreparingMedia}
              <div
                class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 pointer-events-none"
              >
                <Loader2 class="w-6 h-6 text-white animate-spin" />
                <div class="text-[9px] text-white/60 uppercase tracking-wider">
                  {preparingLabel}
                </div>
              </div>
            {/if}

            <!-- Top-right badges & info -->
            {#if !isPreparingMedia}
              <div class="absolute top-1 right-1 z-10 flex flex-col items-end gap-0.5">
                {#if isBroken}
                  <div class="p-1 rounded bg-destructive/90 text-destructive-foreground">
                    <Link2Off class="w-3 h-3" />
                  </div>
                {/if}
                {#if !isBroken && proxyStatus === 'generating'}
                  <div class="p-0.5 rounded bg-green-500/90 text-black pointer-events-none">
                    <Loader2 class="w-2.5 h-2.5 animate-spin" />
                  </div>
                {/if}
                {#if !isBroken && isTagging}
                  <div
                    class="p-0.5 rounded bg-purple-500/90 text-white pointer-events-none"
                    title={t('media.card.analyzingWithAI')}
                  >
                    <Loader2 class="w-2.5 h-2.5 animate-spin" />
                  </div>
                {/if}
                {#if !isBroken && hasProxy}
                  <div class="p-0.5 rounded bg-green-500/90 text-black pointer-events-none">
                    <Zap class="w-2.5 h-2.5" />
                  </div>
                {/if}
                {#if !isBroken && hasCaptions}
                  <div
                    class="p-0.5 rounded bg-purple-500/90 text-white pointer-events-none"
                    title={t('media.card.aiCaptionsCount', { count: media.aiCaptions!.length })}
                  >
                    <Sparkles class="w-2.5 h-2.5" />
                  </div>
                {/if}
                {#if !isBroken && isUrlMedia}
                  <div
                    class="p-0.5 rounded bg-black/60 text-white pointer-events-none"
                    role="img"
                    title={t('media.urlMedia.streamsFromUrl')}
                    aria-label={t('media.urlMedia.streamsFromUrl')}
                  >
                    <Globe class="w-2.5 h-2.5" />
                  </div>
                {/if}
                {#if !isBroken && isMemoryMedia}
                  <div
                    class="p-0.5 rounded bg-black/60 text-white pointer-events-none"
                    role="img"
                    title={t('media.memoryMedia.notUploaded')}
                    aria-label={t('media.memoryMedia.notUploaded')}
                  >
                    <CloudUpload class="w-2.5 h-2.5" />
                  </div>
                {/if}
                <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                  <MediaInfoPopover {media} onSeekToCaption={handleSeekToCaption} />
                </div>
              </div>
            {/if}

            <!-- Overlaid badges - hidden during preparation -->
            {#if !isPreparingMedia}
              <div
                class="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-between gap-1 pointer-events-none"
              >
                <!-- Type icon badge - icon only -->
                <div class="p-0.5 rounded bg-primary/90 text-primary-foreground">
                  {@render typeBadgeIcon()}
                </div>

                <!-- Duration badge -->
                {#if (mediaType === 'video' || mediaType === 'audio') && media.duration > 0}
                  <div
                    class="px-1 py-0.5 bg-black/70 border border-white/20 rounded text-[8px] font-mono text-white"
                  >
                    {formatDuration(media.duration)}
                  </div>
                {/if}
              </div>
            {/if}
            {#if canScrubPreview && skimProgress !== null}
              <div
                class="absolute inset-y-0 w-px bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none"
                style={getSkimIndicatorStyle(skimProgress)}
              ></div>
            {/if}
            {@render transcriptProgressBar()}
          </div>

          <!-- Content footer - minimal -->
          <div class="px-1.5 py-1 bg-panel-bg/50 flex-shrink-0">
            <div class="flex items-center justify-between gap-1">
              <div class="flex-1 min-w-0">
                <h3
                  class="text-[10px] font-medium text-foreground truncate group-hover:text-primary transition-colors"
                >
                  {media.fileName}
                </h3>
              </div>
            </div>
          </div>

          <!-- Film strip edge detail -->
          <div
            class="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50"
          ></div>
          <div
            class="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50"
          ></div>
        </div>
      {/snippet}
    </ContextMenuTrigger>
    <ContextMenuContent onclick={(e) => e.stopPropagation()}>
      {@render actionMenuItems()}
    </ContextMenuContent>
  </ContextMenu>
{/if}
