<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { ExportSettings } from '@/types/export'
  import { getDefaultVideoCodec } from '@/features/export/deps/renderer'

  function getDefaultCodecForFormat(format: 'mp4' | 'webm'): ExportSettings['codec'] {
    return getDefaultVideoCodec(format)
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { Dialog, DialogContent } from '@/components/ui/dialog'
  import type {
    ExportMode,
    ExtendedExportSettings,
    CompositionInputProps,
    SubtitleExportMode,
  } from '@/types/export'
  import { useClientRender } from '../hooks/use-client-render.svelte'
  import { useExportDialogView } from '../hooks/use-export-dialog-view.svelte'
  import {
    buildRenderJob,
    buildSegmentJobs,
    rangesFromFixedDuration,
    rangesFromMarkers,
  } from '@/features/export/utils/build-render-job'
  import { useRenderQueueStore, type RenderJob } from '@/features/export/stores/render-queue-store'
  import {
    getActiveExportSequenceId,
    getExportableSequence,
    listExportableSequences,
    type ExportableSequence,
  } from '@/features/export/deps/timeline-compositions'
  import { framesToSeconds } from '@/shared/utils/time-utils'
  import type { ExportPreflightResult } from '@/features/export/utils/export-preflight'
  import { assessExportPreflight } from '@/features/export/utils/export-preflight'
  import {
    estimateFileSize,
    mapToClientSettings,
    type ClientCodec,
    type ClientVideoContainer,
    type ClientAudioContainer,
  } from '@/features/export/deps/renderer'
  import { useBrokenMediaIds, useMediaMetadataById } from '@/features/export/deps/media-library-ui'
  import { assessSmartCopyEligibility } from '@/features/export/utils/smart-copy'
  import { resolveVideoBitrate } from '@/features/export/deps/renderer'
  import {
    detectTranscriptSubtitles,
    getSubtitleModeOptions,
  } from '@/features/export/utils/export-subtitles'
  import {
    findDominantVideoMediaId,
    getExportRange,
    getQueueRange,
    getSegmentWindow,
    getTimelineDurationFrames,
    hasInOutRange,
  } from '@/features/export/utils/export-range'
  import {
    areExportActionsDisabled,
    doesPreflightBlockExport,
    resolveFallbackCodec,
    resolveSupportedContainer,
  } from '@/features/export/utils/export-capabilities'
  import {
    EXPORT_PRESETS,
    findActivePresetId,
    getResolutionOptions,
    getVideoCodecOptions,
    getVideoContainerOptions,
    scaledResolution,
    type ExportPreset,
  } from '@/features/export/utils/export-options'
  import { t } from '$lib/i18n.svelte'
  import ExportDialogHeading from './export-dialog-heading.svelte'
  import ExportSettingsView from './export-settings-view.svelte'
  import ExportProgressView from './export-progress-view.svelte'
  import ExportCompleteView from './export-complete-view.svelte'
  import ExportNoticeView from './export-notice-view.svelte'
  import type { ExportDialogProps, SetState } from './types'

  let { open, onClose, onOpenRenderQueue }: ExportDialogProps = $props()

  // Which sequence to export (Main or a standalone tab). Snapshotted when the
  // dialog opens (reset to the active tab) and re-read when the picker changes.
  // Sourced read-only so the editor view is never disturbed; the timeline isn't
  // edited while the modal is up, so a snapshot on open is sufficient.
  let selectedSequenceId = $state<string | null>(null)
  let sequenceOptions = $state.raw<Array<{ id: string | null; name: string }>>([])
  let exportable = $state.raw<ExportableSequence>(getExportableSequence(null))
  $effect(() => {
    if (!open) return
    untrack(() => {
      const id = getActiveExportSequenceId()
      selectedSequenceId = id
      sequenceOptions = listExportableSequences()
      exportable = getExportableSequence(id)
    })
  })
  const handleSelectSequence = (id: string | null) => {
    selectedSequenceId = id
    exportable = getExportableSequence(id)
  }

  // Resolution + timeline data all follow the selected sequence.
  const projectWidth = $derived(exportable.width)
  const projectHeight = $derived(exportable.height)
  const fps = $derived(exportable.fps)
  const tracks = $derived(exportable.tracks)
  const items = $derived(exportable.items)
  const transitions = $derived(exportable.transitions)
  const keyframes = $derived(exportable.keyframes)
  const inPoint = $derived(exportable.inPoint)
  const outPoint = $derived(exportable.outPoint)
  const brokenMediaIds = useBrokenMediaIds()
  const { enqueueJobs } = useRenderQueueStore.getState()

  let settings = $state.raw<ExportSettings>(
    untrack(() => ({
      codec: getDefaultCodecForFormat('mp4'),
      quality: 'medium',
      resolution: { width: projectWidth, height: projectHeight },
      rateControl: 'auto',
      smartCopy: true,
    })),
  )
  const setSettings: SetState<ExportSettings> = (next) => {
    settings = typeof next === 'function' ? next(settings) : next
  }

  let exportMode = $state<ExportMode>('video')
  let videoContainer = $state<ClientVideoContainer>('mp4')
  let audioContainer = $state<ClientAudioContainer>('mp3')
  let subtitleMode = $state<SubtitleExportMode>('burn')
  let renderWholeProject = $state(false)
  let wasOpen = false

  const setVideoContainer: SetState<ClientVideoContainer> = (next) => {
    videoContainer = typeof next === 'function' ? next(videoContainer) : next
  }
  const setAudioContainer: SetState<ClientAudioContainer> = (next) => {
    audioContainer = typeof next === 'function' ? next(audioContainer) : next
  }

  const dominantVideoMediaId = $derived(findDominantVideoMediaId(items))
  const sourceMediaById = useMediaMetadataById(() => dominantVideoMediaId)
  const sourceMedia = $derived(sourceMediaById.current)
  const sourceVideo = $derived(
    sourceMedia && sourceMedia.bitrate > 0
      ? {
          bitrate: sourceMedia.bitrate,
          fps: sourceMedia.fps,
          codec: sourceMedia.codec,
        }
      : undefined,
  )

  // Check if in/out points are set
  const hasInOutPoints = $derived(hasInOutRange(inPoint, outPoint))
  const hasTranscriptSubtitles = $derived(detectTranscriptSubtitles(items))
  // Soft (toggleable) subtitle tracks only work for Matroska (WebM/MKV). MP4/MOV
  // can't — mediabunny's WebVTT-in-ISOBMFF muxing is broken and players barely
  // support it anyway — so the "Embedded track" option is hidden there.
  const subtitleModeOptions = $derived(getSubtitleModeOptions(videoContainer))
  // Coerce away a now-unavailable mode (e.g. "embedded" after switching to MP4).
  const effectiveSubtitleMode = $derived(
    subtitleModeOptions.includes(subtitleMode) ? subtitleMode : 'burn',
  )

  // Calculate export range
  const exportRange = $derived(
    getExportRange({
      renderWholeProject,
      inPoint,
      outPoint,
      timelineDurationFrames: getTimelineDurationFrames(items),
    }),
  )

  const resolvedVideoBitrate = $derived(
    resolveVideoBitrate({
      codec: settings.codec,
      quality: settings.quality,
      width: settings.resolution.width,
      height: settings.resolution.height,
      fps,
      rateControl: settings.rateControl,
      customBitrate: settings.videoBitrate,
      sourceVideo,
    }),
  )

  const previewClientSettings = $derived.by(() => {
    const mapped = mapToClientSettings({ ...settings, sourceVideo }, fps)
    mapped.container = videoContainer
    return mapped
  })

  const smartCopyAssessment = $derived(
    assessSmartCopyEligibility({
      settings: previewClientSettings,
      tracks,
      items,
      transitions,
      keyframes,
      fps,
      width: projectWidth,
      height: projectHeight,
      inPoint: renderWholeProject || !hasInOutPoints ? null : inPoint,
      outPoint: renderWholeProject || !hasInOutPoints ? null : outPoint,
      source: sourceMedia,
    }),
  )

  const smartCopyWillRun = $derived(settings.smartCopy !== false && smartCopyAssessment.eligible)
  const estimatedFileSizeBytes = $derived(
    smartCopyWillRun && sourceMedia
      ? sourceMedia.fileSize
      : estimateFileSize(previewClientSettings, framesToSeconds(exportRange.duration, fps)),
  )

  const preflightComposition = $derived<CompositionInputProps>({
    fps,
    durationInFrames: exportRange.duration,
    width: projectWidth,
    height: projectHeight,
    tracks,
    transitions,
    keyframes,
  })

  const resolutionOptions = $derived(getResolutionOptions(projectWidth, projectHeight, t))

  // Which preset (if any) the current settings exactly match. null = "Custom".
  const activePresetId = $derived(
    findActivePresetId(videoContainer, settings, projectWidth, projectHeight),
  )

  const applyPreset = (preset: ExportPreset) => {
    videoContainer = preset.container
    setSettings((prev) => ({
      ...prev,
      codec: preset.codec,
      quality: preset.quality,
      rateControl: 'auto',
      videoBitrate: undefined,
      smartCopy: true,
      resolution: scaledResolution(projectWidth, projectHeight, preset.scale),
    }))
  }

  // Sync resolution when project dimensions change
  $effect(() => {
    const width = projectWidth
    const height = projectHeight
    untrack(() => setSettings((prev) => ({ ...prev, resolution: { width, height } })))
  })

  // Render hook
  const clientRender = useClientRender()

  let supportedVideoCodecs = $state.raw<ClientCodec[] | null>(null)
  let isCheckingVideoSupport = $state(false)
  let videoSupportError = $state<string | null>(null)
  let preflight = $state.raw<ExportPreflightResult | null>(null)

  const dialogView = useExportDialogView(() => ({
    status: clientRender.status,
    result: clientRender.result,
    resetState: clientRender.resetState,
    onClose,
  }))
  const view = $derived(dialogView.view)

  // Assemble the extended settings the render pipeline expects from the dialog
  // state. Shared by "Export now" and the "Add to queue" actions.
  const buildExtendedSettings = (): ExtendedExportSettings => ({
    ...settings,
    sourceVideo,
    mode: exportMode,
    videoContainer: exportMode === 'video' ? videoContainer : undefined,
    audioContainer: exportMode === 'audio' ? audioContainer : undefined,
    subtitleMode: exportMode === 'video' ? effectiveSubtitleMode : undefined,
    renderWholeProject,
  })

  // Start export
  const handleStartExport = async () => {
    dialogView.setView('progress')
    await clientRender.startExport(buildExtendedSettings())
  }

  // Close the export dialog and open the queue panel. Called BEFORE building
  // jobs so picking an option gives instant feedback while the (single) codec
  // probe + job assembly run.
  const revealQueue = () => {
    onClose()
    onOpenRenderQueue?.()
  }

  // Capture settings synchronously (the dialog unmounts on reveal), reveal the
  // queue, then build + enqueue. One codec probe covers the whole batch.
  const enqueueAndReveal = async (
    build: (settings: ExtendedExportSettings) => Promise<RenderJob[]>,
  ) => {
    const settings = buildExtendedSettings()
    revealQueue()
    try {
      const jobs = await build(settings)
      if (jobs.length === 0) return
      enqueueJobs(jobs)
      toast.success(t('export.renderQueue.addedToast', { count: jobs.length }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('export.renderQueue.buildFailed'))
    }
  }

  // Re-read the selected sequence at click time so a queued export always
  // reflects the current timeline, not a snapshot that went stale while the
  // dialog stayed open.
  const captureSelection = () => getExportableSequence(selectedSequenceId)

  const handleAddCurrentRange = () => {
    const seq = captureSelection()
    void enqueueAndReveal(async (settings) => [
      await buildRenderJob({ settings, ...getQueueRange(seq, renderWholeProject), sequence: seq }),
    ])
  }

  const handleAddMarkerSegments = () => {
    const seq = captureSelection()
    const { start, end } = getSegmentWindow(seq, renderWholeProject)
    const ranges = rangesFromMarkers(seq.markers, start, end)
    if (ranges.length <= 1) {
      toast.info(t('export.renderQueue.noMarkers'))
      return
    }
    void enqueueAndReveal((settings) =>
      buildSegmentJobs(settings, ranges, (i) => t('export.renderQueue.partLabel', { n: i + 1 }), seq),
    )
  }

  const handleSplitChunks = (seconds: number) => {
    const seq = captureSelection()
    const { start, end } = getSegmentWindow(seq, renderWholeProject)
    const ranges = rangesFromFixedDuration(start, end, Math.max(1, Math.round(seconds * seq.fps)))
    if (ranges.length === 0) {
      toast.info(t('export.renderQueue.nothingToRender'))
      return
    }
    void enqueueAndReveal((settings) =>
      buildSegmentJobs(settings, ranges, (i) => t('export.renderQueue.partLabel', { n: i + 1 }), seq),
    )
  }

  // Reset when dialog closes
  $effect(() => {
    const isOpen = open
    untrack(() => {
      if (isOpen && !wasOpen) {
        dialogView.resetView()
        exportMode = 'video'
        videoContainer = 'mp4'
        audioContainer = 'mp3'
        subtitleMode = 'burn'
        renderWholeProject = false
        settings = {
          codec: getDefaultCodecForFormat('mp4'),
          quality: 'medium',
          resolution: { width: projectWidth, height: projectHeight },
          rateControl: 'auto',
          smartCopy: true,
        }
        clientRender.resetState()
        preflight = null
      }

      if (!isOpen && wasOpen) {
        dialogView.resetView()
        clientRender.resetState()
        preflight = null
      }

      wasOpen = isOpen
    })
  })

  // The probe follows the resolution object itself, as React's dependency on
  // `settings.resolution` did, not every settings change.
  const probeResolution = $derived(settings.resolution)

  $effect(() => {
    if (!open || view !== 'settings' || exportMode !== 'video') return
    const resolution = probeResolution
    const bitrate = resolvedVideoBitrate

    let cancelled = false
    isCheckingVideoSupport = true
    videoSupportError = null
    supportedVideoCodecs = null

    void untrack(() => clientRender.getSupportedCodecs({ resolution, bitrate }))
      .then((codecs) => {
        if (cancelled) return
        supportedVideoCodecs = codecs
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : t('export.errors.verifyCodec')
        videoSupportError = message
      })
      .finally(() => {
        if (!cancelled) {
          isCheckingVideoSupport = false
        }
      })

    return () => {
      cancelled = true
    }
  })

  const videoContainerOptions = $derived(getVideoContainerOptions(supportedVideoCodecs, t))

  const codecOptions = $derived(getVideoCodecOptions(supportedVideoCodecs, videoContainer))

  const hasCapabilityData = $derived(supportedVideoCodecs !== null && !videoSupportError)
  const hasSupportedVideoPath = $derived(videoContainerOptions.some((option) => option.supported))
  $effect(() => {
    if (exportMode !== 'video' || !hasCapabilityData) return

    const nextContainer = resolveSupportedContainer(videoContainerOptions, videoContainer)
    if (nextContainer === null) return

    videoContainer = nextContainer
  })

  // Codec the probe rules out: fall back to one it can encode, unless smart
  // copy keeps the source bytes (and their codec) untouched.
  const fallbackCodec = $derived(
    smartCopyWillRun ? null : resolveFallbackCodec(codecOptions, settings.codec),
  )
  $effect(() => {
    const codec = fallbackCodec
    if (codec === null) return

    untrack(() => setSettings((prev) => ({ ...prev, codec })))
  })

  $effect(() => {
    if (!open || view !== 'settings') {
      preflight = null
      return
    }

    if (exportMode === 'video' && supportedVideoCodecs === null && !videoSupportError) {
      preflight = null
      return
    }

    let cancelled = false
    const settingsForPreflight: ExtendedExportSettings = {
      ...settings,
      sourceVideo,
      mode: exportMode,
      videoContainer: exportMode === 'video' ? videoContainer : undefined,
      audioContainer: exportMode === 'audio' ? audioContainer : undefined,
      subtitleMode: exportMode === 'video' ? effectiveSubtitleMode : undefined,
      renderWholeProject,
    }

    void assessExportPreflight({
      settings: settingsForPreflight,
      fps,
      composition: preflightComposition,
      durationFrames: exportRange.duration,
      supportedVideoCodecs: supportedVideoCodecs ?? [],
      brokenMediaIds: brokenMediaIds.current,
      smartCopyAssessment,
    }).then((result) => {
      if (!cancelled) preflight = result
    })

    return () => {
      cancelled = true
    }
  })

  const preflightBlocksExport = $derived(doesPreflightBlockExport(preflight))
  const exportActionsDisabled = $derived(
    areExportActionsDisabled({
      exportMode,
      smartCopyWillRun,
      hasSupportedVideoPath,
      isCheckingVideoSupport,
      preflightBlocksExport,
    }),
  )

  const fileSize = $derived(clientRender.result?.fileSize)
</script>

<Dialog
  bind:open={
    () => open,
    () => {
      dialogView.handleClose()
    }
  }
>
  <DialogContent
    class="overflow-hidden {view === 'settings'
      ? 'sm:max-w-[900px]'
      : view === 'complete' && dialogView.isVideoResult
        ? 'sm:max-w-[640px]'
        : 'sm:max-w-[500px]'}"
    hideCloseButton={dialogView.preventClose}
    onInteractOutside={(e) => dialogView.preventClose && e.preventDefault()}
    onEscapeKeydown={(e) => dialogView.preventClose && e.preventDefault()}
  >
    <ExportDialogHeading {view} />

    <!-- Settings View -->
    {#if view === 'settings'}
      <ExportSettingsView
        sequencePicker={{
          options: sequenceOptions,
          selectedId: selectedSequenceId,
          onSelect: handleSelectSequence,
        }}
        modeToggle={{ mode: exportMode, onChange: (mode) => (exportMode = mode) }}
        rangeSummary={{
          range: exportRange,
          fps,
          hasInOutPoints,
          renderWholeProject,
          onRenderWholeProjectChange: (value) => (renderWholeProject = value),
        }}
        {preflight}
        video={{
          presets: {
            presets: EXPORT_PRESETS,
            activePresetId,
            onApplyPreset: applyPreset,
          },
          alerts: {
            isCheckingSupport: isCheckingVideoSupport,
            supportError: videoSupportError,
            hasSupportedPath: hasSupportedVideoPath,
            width: settings.resolution.width,
            height: settings.resolution.height,
          },
          format: {
            settings,
            setSettings,
            container: videoContainer,
            setContainer: setVideoContainer,
            containerOptions: videoContainerOptions,
            codecOptions,
            resolutionOptions,
            projectWidth,
            projectHeight,
          },
          rateControl: {
            settings,
            setSettings,
            resolvedVideoBitrate,
            sourceVideo,
          },
          smartCopy: {
            settings,
            setSettings,
            assessment: smartCopyAssessment,
            willRun: smartCopyWillRun,
            resolvedVideoBitrate,
            estimatedFileSizeBytes,
            sourceVideo,
          },
          subtitles: {
            mode: effectiveSubtitleMode,
            onModeChange: (mode) => (subtitleMode = mode),
            modeOptions: subtitleModeOptions,
            hasTranscriptSubtitles,
          },
        }}
        audio={{
          settings,
          setSettings,
          container: audioContainer,
          setContainer: setAudioContainer,
        }}
        footer={{
          mode: exportMode,
          actionsDisabled: exportActionsDisabled,
          onClose: dialogView.handleClose,
          onExport: handleStartExport,
          onAddCurrentRange: handleAddCurrentRange,
          onAddMarkerSegments: handleAddMarkerSegments,
          onSplitChunks: handleSplitChunks,
        }}
      />
    {/if}

    <!-- Progress View -->
    {#if view === 'progress'}
      <ExportProgressView
        progress={clientRender.progress}
        progressMessage={clientRender.progressMessage}
        renderedFrames={clientRender.renderedFrames}
        totalFrames={clientRender.totalFrames}
        status={clientRender.status}
        elapsedSeconds={dialogView.elapsedSeconds}
        onCancel={clientRender.cancelExport}
      />
    {/if}

    <!-- Complete View -->
    {#if view === 'complete'}
      <ExportCompleteView
        mode={exportMode}
        previewUrl={dialogView.previewUrl}
        isVideoResult={dialogView.isVideoResult}
        {fileSize}
        elapsedSeconds={dialogView.elapsedSeconds}
        onClose={dialogView.handleClose}
        onDownload={clientRender.downloadVideo}
      />
    {/if}

    <!-- Error View -->
    {#if view === 'error'}
      <ExportNoticeView variant="error" message={clientRender.error} onClose={dialogView.handleClose} />
    {/if}

    <!-- Cancelled View -->
    {#if view === 'cancelled'}
      <ExportNoticeView variant="cancelled" message={null} onClose={dialogView.handleClose} />
    {/if}
  </DialogContent>
</Dialog>
