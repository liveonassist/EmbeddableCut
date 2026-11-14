// SPDX-License-Identifier: MIT

/**
 * Client-side render hook
 *
 * Video rendering using mediabunny: uses blob URLs directly, runs entirely in
 * the browser with WebCodecs.
 *
 * Settings resolution (codec fallback) and worker orchestration live in
 * `../utils/render-pipeline` so this hook and the render queue runner stay in
 * lockstep.
 */

import type { ExportSettings, ExtendedExportSettings } from '@/types/export'
import type {
  RenderProgress,
  ClientRenderResult,
  ClientCodec,
} from '@/features/export/deps/renderer'
import {
  mapToClientSettings,
  getSupportedCodecs,
  formatBytes,
  estimateFileSize,
  getVideoBitrateForQuality,
} from '@/features/export/deps/renderer'
import {
  isExtendedSettings,
  mapRequestedClientSettings,
  resolveClientSettings,
  runRender,
} from '@/features/export/deps/renderer'
import { trySmartCopyExport } from '@/features/export/utils/smart-copy'
import { convertTimelineToComposition } from '@/features/export/utils/timeline-to-composition'
import { buildTranscriptSubtitleCues } from '@/features/export/deps/renderer'
import { serializeSrt } from '@/shared/utils/subtitles'
import { releaseTemporaryExportOutput } from '@/features/export/deps/renderer'
import {
  useItemsStore,
  useKeyframesStore,
  useMarkersStore,
  useTimelineSettingsStore,
  useTransitionsStore,
} from '@/features/export/deps/timeline'
import { useProjectStore } from '@/features/export/deps/projects'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import { resolveMediaUrls } from '@/features/export/deps/media-library'
import { usePlaybackStore } from '@/shared/state/playback'
import { createLogger, createOperationId } from '@/shared/logging/logger'

const log = createLogger('Export')

export type ClientRenderStatus =
  | 'idle'
  | 'preparing'
  | 'rendering'
  | 'encoding'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface UseClientRenderReturn {
  // State
  readonly isExporting: boolean
  readonly progress: number
  readonly progressMessage?: string
  readonly renderedFrames?: number
  readonly totalFrames?: number
  readonly status: ClientRenderStatus
  readonly error: string | null
  readonly result: ClientRenderResult | null

  // Actions
  startExport: (settings: ExportSettings | ExtendedExportSettings) => Promise<void>
  cancelExport: () => void
  downloadVideo: () => void
  resetState: () => void

  // Utilities
  getSupportedCodecs: (options?: {
    resolution?: { width: number; height: number }
    quality?: ExportSettings['quality']
    bitrate?: number
  }) => Promise<ClientCodec[]>
  estimateFileSize: (settings: ExportSettings, durationSeconds: number) => string
}

export function useClientRender(): UseClientRenderReturn {
  let isExporting = $state(false)
  let progress = $state(0)
  let progressMessage = $state<string>()
  let renderedFrames = $state<number>()
  let totalFrames = $state<number>()
  let status = $state<ClientRenderStatus>('idle')
  let error = $state<string | null>(null)
  let result = $state.raw<ClientRenderResult | null>(null)
  let resultRef: ClientRenderResult | null = null

  // AbortController for cancellation
  let abortController: AbortController | null = null

  /**
   * Handle progress updates from the render engine
   */
  const handleProgress = (progressData: RenderProgress) => {
    progress = progressData.progress
    progressMessage = progressData.message
    renderedFrames = progressData.currentFrame
    totalFrames = progressData.totalFrames

    // Map phase to status
    switch (progressData.phase) {
      case 'preparing':
        status = 'preparing'
        break
      case 'rendering':
        status = 'rendering'
        break
      case 'encoding':
        status = 'encoding'
        break
      case 'finalizing':
        status = 'finalizing'
        break
    }
  }

  /**
   * Start client-side export
   */
  const startExport = async (settings: ExportSettings | ExtendedExportSettings) => {
    const opId = createOperationId()
    const event = log.startEvent('render', opId)

    try {
      const previousResult = resultRef
      resultRef = null
      void releaseTemporaryExportOutput(previousResult)
      isExporting = true
      progress = 0
      progressMessage = undefined
      error = null
      result = null
      status = 'preparing'

      // Create abort controller for cancellation
      abortController = new AbortController()

      // Read current state from stores
      const { tracks, items } = useItemsStore.getState()
      const { transitions } = useTransitionsStore.getState()
      const { keyframes } = useKeyframesStore.getState()
      const { inPoint, outPoint } = useMarkersStore.getState()
      const { fps } = useTimelineSettingsStore.getState()

      // Get project metadata (background color and native resolution)
      const currentProject = useProjectStore.getState().currentProject
      const busAudioEq = usePlaybackStore.getState().busAudioEq
      const masterBusDb = usePlaybackStore.getState().masterBusDb
      const backgroundColor = currentProject?.metadata?.backgroundColor
      // Use PROJECT resolution for composition (transform calculations match preview)
      const projectWidth = currentProject?.metadata?.width ?? DEFAULT_PROJECT_WIDTH
      const projectHeight = currentProject?.metadata?.height ?? DEFAULT_PROJECT_HEIGHT

      const requested = mapRequestedClientSettings(settings, fps)
      // When renderWholeProject is true, ignore in/out points.
      const { exportMode, renderWholeProject } = requested
      const effectiveInPoint = renderWholeProject ? null : inPoint
      const effectiveOutPoint = renderWholeProject ? null : outPoint
      const signal = abortController.signal

      const smartCopy = await trySmartCopyExport(
        {
          settings: requested.clientSettings,
          tracks,
          items,
          transitions,
          keyframes,
          fps,
          width: projectWidth,
          height: projectHeight,
          inPoint: effectiveInPoint,
          outPoint: effectiveOutPoint,
          busAudioEq,
          masterBusDb,
        },
        signal,
        handleProgress,
      )

      if (smartCopy.result) {
        resultRef = smartCopy.result
        result = smartCopy.result
        status = 'completed'
        progress = 100
        event.set('renderPath', 'smart-copy')
        event.success({
          fileSize: smartCopy.result.fileSize,
          fileSizeFormatted: formatBytes(smartCopy.result.fileSize),
          duration: smartCopy.result.duration,
        })
        return
      }

      // Resolve settings + codec fallback only when an encoder is required.
      const { clientSettings, codecFallback } = await resolveClientSettings(settings, fps)
      if (codecFallback) event.set('codecFallback', codecFallback)

      const extended = isExtendedSettings(settings)
      event.merge({
        mode: exportMode,
        fps,
        tracks: tracks.length,
        items: items.length,
        inPoint: effectiveInPoint,
        outPoint: effectiveOutPoint,
        renderWholeProject,
        keyframes: keyframes?.length ?? 0,
        projectResolution: `${projectWidth}x${projectHeight}`,
        videoContainer: extended ? settings.videoContainer : undefined,
        audioContainer: extended ? settings.audioContainer : undefined,
        subtitleMode: clientSettings.subtitleMode,
        projectId: currentProject?.id,
        codec: clientSettings.codec,
        container: clientSettings.container,
        resolution: `${clientSettings.resolution.width}x${clientSettings.resolution.height}`,
      })

      // Convert timeline to Composition format (handles I/O point trimming)
      // Use PROJECT resolution so transforms match preview (will scale to export res later)
      const composition = convertTimelineToComposition(
        tracks,
        items,
        transitions,
        fps,
        projectWidth,
        projectHeight,
        effectiveInPoint,
        effectiveOutPoint,
        keyframes,
        backgroundColor,
        busAudioEq,
        masterBusDb,
      )

      const totalCompositionItems = composition.tracks.reduce(
        (sum, t) => sum + (t.items?.length ?? 0),
        0,
      )
      const compositionDuration = composition.durationInFrames ?? 0

      event.merge({
        compositionDuration: compositionDuration,
        compositionDurationSec: compositionDuration / fps,
        compositionTracks: composition.tracks.length,
        compositionItems: totalCompositionItems,
      })

      // Resolve media URLs (convert mediaIds to blob URLs)
      // Export always uses full-res source, never proxies
      const resolvedTracks = await resolveMediaUrls(composition.tracks, { useProxy: false })
      composition.tracks = resolvedTracks

      // Count resolved items for diagnostics
      let totalResolvedItems = 0
      let itemsWithSrc = 0
      let itemsMissingSrc = 0
      for (const track of resolvedTracks) {
        for (const item of track.items ?? []) {
          totalResolvedItems++
          if ('src' in item && item.src) {
            itemsWithSrc++
          } else if (
            item.type === 'video' ||
            item.type === 'audio' ||
            item.type === 'image' ||
            item.type === 'lottie'
          ) {
            itemsMissingSrc++
            log.warn('Media item missing src after resolve', {
              opId,
              itemId: item.id,
              type: item.type,
              mediaId: item.mediaId,
            })
          }
        }
      }

      event.merge({
        resolvedItems: totalResolvedItems,
        itemsWithSrc,
        itemsMissingSrc,
      })

      // Run the render (worker, with automatic main-thread fallback).
      const {
        result: renderResult,
        renderPath,
        fallbackReason,
      } = await runRender({
        clientSettings,
        exportMode,
        composition,
        signal,
        onProgress: handleProgress,
      })
      if (fallbackReason) event.set('workerFallbackReason', fallbackReason)

      // Sidecar mode: the video is muxed clean; build the .srt from the same
      // (export-trimmed) composition on the main thread and attach it so the
      // dialog can offer it as a second download.
      let finalResult = renderResult
      if (clientSettings.subtitleMode === 'sidecar') {
        const cues = buildTranscriptSubtitleCues(composition)
        if (cues.length > 0) {
          finalResult = {
            ...renderResult,
            subtitleSidecar: { filename: 'subtitles.srt', content: serializeSrt(cues) },
          }
          event.set('subtitleSidecarCues', cues.length)
        }
      }

      resultRef = finalResult
      result = finalResult
      status = 'completed'
      progress = 100

      event.set('renderPath', renderPath)
      event.success({
        fileSize: renderResult.fileSize,
        fileSizeFormatted: formatBytes(renderResult.fileSize),
        duration: renderResult.duration,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        event.set('outcome', 'cancelled')
        event.set('duration_ms', Date.now())
        log.event('render', { opId, outcome: 'cancelled' })
        status = 'cancelled'
      } else {
        event.failure(err)
        const message = err instanceof Error ? err.message : 'Failed to export'
        error = message
        status = 'failed'
      }
    } finally {
      isExporting = false
      abortController = null
    }
  }

  /**
   * Cancel the current export. Aborting the controller signals `runRender`,
   * which posts the cancel to its worker and terminates it.
   */
  const cancelExport = () => {
    if (abortController) {
      abortController.abort()
      status = 'cancelled'
      isExporting = false
    }
  }

  /**
   * Download the rendered video/audio
   */
  const downloadVideo = () => {
    if (!result) return

    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url

    // Determine file extension from MIME type
    let extension = 'mp4'
    const mime = result.mimeType.toLowerCase()
    if (mime.includes('webm')) extension = 'webm'
    else if (mime.includes('matroska')) extension = 'mkv'
    else if (mime.includes('quicktime') || mime.includes('mov')) extension = 'mov'
    else if (mime.includes('audio/mpeg') || mime.includes('mp3')) extension = 'mp3'
    else if (mime.includes('audio/wav') || mime.includes('wave')) extension = 'wav'
    else if (mime.includes('audio/aac') || mime.includes('adts')) extension = 'aac'

    const baseName = `export-${Date.now()}`
    a.download = `${baseName}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Revoke during idle — download has already started by then
    requestIdleCallback(() => URL.revokeObjectURL(url))

    // Sidecar mode: download the .srt alongside, sharing the video's base name.
    const sidecar = result.subtitleSidecar
    if (sidecar) {
      const sidecarExt = sidecar.filename.split('.').pop() ?? 'srt'
      const sidecarBlob = new Blob([sidecar.content], { type: 'text/plain;charset=utf-8' })
      const sidecarUrl = URL.createObjectURL(sidecarBlob)
      const sidecarLink = document.createElement('a')
      sidecarLink.href = sidecarUrl
      sidecarLink.download = `${baseName}.${sidecarExt}`
      document.body.appendChild(sidecarLink)
      sidecarLink.click()
      document.body.removeChild(sidecarLink)
      requestIdleCallback(() => URL.revokeObjectURL(sidecarUrl))
    }
  }

  /**
   * Reset state
   */
  const resetState = () => {
    abortController?.abort()
    abortController = null
    isExporting = false
    progress = 0
    progressMessage = undefined
    renderedFrames = undefined
    totalFrames = undefined
    status = 'idle'
    error = null
    const previousResult = resultRef
    resultRef = null
    void releaseTemporaryExportOutput(previousResult)
    result = null
  }

  $effect(() => () => {
    void releaseTemporaryExportOutput(resultRef)
    resultRef = null
  })

  /**
   * Get supported codecs for the current resolution
   */
  const getSupportedCodecsForResolution = async (options?: {
    resolution?: { width: number; height: number }
    quality?: ExportSettings['quality']
    bitrate?: number
  }) => {
    const currentProject = useProjectStore.getState().currentProject
    const width =
      options?.resolution?.width ?? currentProject?.metadata?.width ?? DEFAULT_PROJECT_WIDTH
    const height =
      options?.resolution?.height ?? currentProject?.metadata?.height ?? DEFAULT_PROJECT_HEIGHT
    const bitrate =
      options?.bitrate ??
      (options?.quality ? getVideoBitrateForQuality(options.quality) : undefined)

    const codecs = await getSupportedCodecs({ width, height, bitrate })
    return codecs
  }

  /**
   * Estimate file size for given settings
   */
  const estimateFileSizeForSettings = (settings: ExportSettings, durationSeconds: number) => {
    const fps = useTimelineSettingsStore.getState().fps
    const clientSettings = mapToClientSettings(settings, fps)
    const bytes = estimateFileSize(clientSettings, durationSeconds)
    return formatBytes(bytes)
  }

  return {
    get isExporting() {
      return isExporting
    },
    get progress() {
      return progress
    },
    get progressMessage() {
      return progressMessage
    },
    get renderedFrames() {
      return renderedFrames
    },
    get totalFrames() {
      return totalFrames
    },
    get status() {
      return status
    },
    get error() {
      return error
    },
    get result() {
      return result
    },
    startExport,
    cancelExport,
    downloadVideo,
    resetState,
    getSupportedCodecs: getSupportedCodecsForResolution,
    estimateFileSize: estimateFileSizeForSettings,
  }
}
