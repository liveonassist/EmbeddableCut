<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { formatTimecode } from '@/shared/utils/time-utils'


  interface PlaybackControlsProps {
    totalFrames: number
    fps: number
  }

  async function canvasToBlob(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    type: string,
  ): Promise<Blob> {
    if ('convertToBlob' in canvas) {
      return canvas.convertToBlob({ type })
    }

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('Failed to convert frame to blob'))
      }, type)
    })
  }

  async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl)
    return response.blob()
  }

  function scheduleBlobUrlRevoke(url: string): void {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => URL.revokeObjectURL(url))
      return
    }

    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    scheduleBlobUrlRevoke(url)
  }

  function buildFrameFileName(frame: number, fps: number, totalFrames: number): string {
    const safeFrame = Math.max(0, Math.round(frame))
    const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
    const frameDigits = Math.max(String(Math.max(0, totalFrames - 1)).length, 1)
    const paddedFrame = String(safeFrame).padStart(frameDigits, '0')
    const safeTimecode = formatTimecode(safeFrame, safeFps).replaceAll(':', '-')
    return `frame-${paddedFrame}-${safeTimecode}.png`
  }

  const btnSize = `width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`
</script>

<!--
  @component
  Transport controls with:
  - Play/Pause toggle
  - Frame navigation (previous/next)
  - Skip to start/end
  - Frame capture
  - Volume control
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { i18n } from '@/i18n'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  import Play from '@lucide/svelte/icons/play'
  import Pause from '@lucide/svelte/icons/pause'
  import SkipBack from '@lucide/svelte/icons/skip-back'
  import SkipForward from '@lucide/svelte/icons/skip-forward'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Zap from '@lucide/svelte/icons/zap'
  import Camera from '@lucide/svelte/icons/camera'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { importMediaLibraryService, useMediaLibraryStore } from '@/features/preview/deps/media-library-contract'
  import { toast } from 'svelte-sonner'
  import MonitorVolumeControl from './monitor-volume-control.svelte'
  let { totalFrames, fps }: PlaybackControlsProps = $props()

  let isSavingFrame = $state.raw(false)
  const setIsSavingFrame = (next: typeof isSavingFrame | ((prev: typeof isSavingFrame) => typeof isSavingFrame)) => {
    isSavingFrame = typeof next === 'function' ? (next as (prev: typeof isSavingFrame) => typeof isSavingFrame)(untrack(() => isSavingFrame)) : next
  }

  // Use granular selectors - Zustand v5 best practice
  // NOTE: Don't subscribe to currentFrame - only needed in click handlers
  // Read from store directly when needed to avoid re-renders every frame
  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)
  const useProxy = select(usePlaybackStore, (s) => s.useProxy)
  const togglePlayPause = usePlaybackStore.getState().togglePlayPause
  const setCurrentFrame = usePlaybackStore.getState().setCurrentFrame
  const setPreviewFrame = usePlaybackStore.getState().setPreviewFrame
  const toggleUseProxy = usePlaybackStore.getState().toggleUseProxy
  const setDisplayedFrame = usePreviewBridgeStore.getState().setDisplayedFrame

  // Note: Automatic playback loop is now handled by Composition Player
  // The Player controls frame advancement via frameupdate events

  // Note: totalFrames is the count, so valid frame indices are [0, totalFrames - 1]
  const lastValidFrame = $derived(Math.max(0, totalFrames - 1))

  const commitTimelineSeek = (frame: number) => {
    // Transport seeks should exit hover-scrub state so Player rendering
    // follows the actual playhead immediately.
    setPreviewFrame(null)
    setDisplayedFrame(null)
    setCurrentFrame(frame)
  }

  const handleGoToStart = () => commitTimelineSeek(0)
  const handleGoToEnd = () => commitTimelineSeek(lastValidFrame)
  const handlePreviousFrame = () => {
    const currentFrame = usePlaybackStore.getState().currentFrame
    commitTimelineSeek(Math.max(0, currentFrame - 1))
  }
  const handleNextFrame = () => {
    const currentFrame = usePlaybackStore.getState().currentFrame
    commitTimelineSeek(Math.min(lastValidFrame, currentFrame + 1))
  }

  const handleSaveFrame = async () => {
    if (isSavingFrame) return

    setIsSavingFrame(true)

    try {
      const playback = usePlaybackStore.getState()
      const previewBridge = usePreviewBridgeStore.getState()
      const currentFrame = playback.previewFrame ?? playback.currentFrame
      const fileName = buildFrameFileName(currentFrame, fps, totalFrames)

      let frameBlob: Blob | null = null
      let frameWidth: number | undefined
      let frameHeight: number | undefined

      if (previewBridge.captureCanvasSource) {
        const canvasSource = await previewBridge.captureCanvasSource()
        if (canvasSource) {
          frameBlob = await canvasToBlob(canvasSource, 'image/png')
          frameWidth = canvasSource.width
          frameHeight = canvasSource.height
        }
      }

      if (!frameBlob && previewBridge.captureFrame) {
        const dataUrl = await previewBridge.captureFrame({
          format: 'image/png',
          quality: 1,
          fullResolution: true,
        })

        if (dataUrl) {
          frameBlob = await dataUrlToBlob(dataUrl)
        }
      }

      if (!frameBlob) {
        toast.error(i18n.t('preview.controls.captureFailed'))
        return
      }

      downloadBlob(frameBlob, fileName)

      const currentProjectId = useMediaLibraryStore.getState().currentProjectId
      if (!currentProjectId) {
        toast.error(i18n.t('preview.controls.frameDownloadedNoProject'))
        return
      }

      const frameFile = new File([frameBlob], fileName, {
        type: 'image/png',
        lastModified: Date.now(),
      })

      const { mediaLibraryService } = await importMediaLibraryService()
      const savedMedia = await mediaLibraryService.importGeneratedImage(
        frameFile,
        currentProjectId,
        {
          width: frameWidth,
          height: frameHeight,
          tags: ['frame-capture'],
          codec: 'png',
        },
      )

      useMediaLibraryStore.getState().prependMediaItem(savedMedia)

      toast.success(i18n.t('preview.controls.frameSaved', { name: savedMedia.fileName }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('preview.controls.saveFrameFailed')
      toast.error(i18n.t('preview.controls.frameDownloadedNotSaved', { message }))
    } finally {
      setIsSavingFrame(false)
    }
  }
</script>

<!-- Transport Controls -->
<div class="flex items-center gap-0.5 flex-shrink-0">
  <Button
    variant="ghost"
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={handleGoToStart}
    data-tooltip={t('preview.controls.goToStartTooltip')}
    aria-label={t('preview.controls.goToStart')}
  >
    <SkipBack class="w-3.5 h-3.5" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={handlePreviousFrame}
    data-tooltip={t('preview.controls.prevFrameTooltip')}
    aria-label={t('preview.controls.prevFrame')}
  >
    <ChevronLeft class="w-3.5 h-3.5" />
  </Button>
  <Button
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={togglePlayPause}
    data-tooltip={isPlaying.current ? t('preview.controls.pauseTooltip') : t('preview.controls.playTooltip')}
    aria-label={isPlaying.current ? t('preview.player.pause') : t('preview.player.play')}
  >
    {#if isPlaying.current}
      <Pause class="w-3.5 h-3.5" />
    {:else}
      <Play class="w-3.5 h-3.5 ml-0.5" />
    {/if}
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={handleNextFrame}
    data-tooltip={t('preview.controls.nextFrameTooltip')}
    aria-label={t('preview.controls.nextFrame')}
  >
    <ChevronRight class="w-3.5 h-3.5" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={handleGoToEnd}
    data-tooltip={t('preview.controls.goToEndTooltip')}
    aria-label={t('preview.controls.goToEnd')}
  >
    <SkipForward class="w-3.5 h-3.5" />
  </Button>
  <MonitorVolumeControl buttonStyle={btnSize} />
</div>
<!-- Save frame — hidden at narrow widths -->
<div class="hidden @min-[440px]:flex items-center gap-0.5 flex-shrink-0">
  <Separator orientation="vertical" class="h-4 flex-shrink-0" />
  <Button
    variant="ghost"
    size="icon"
    class="flex-shrink-0"
    style={btnSize}
    onclick={() => {
      void handleSaveFrame()
    }}
    disabled={isSavingFrame}
    data-tooltip={isSavingFrame
      ? t('preview.controls.savingFrameTooltip')
      : t('preview.controls.saveFrameTooltip')}
    aria-label={isSavingFrame ? t('preview.controls.savingFrame') : t('preview.controls.saveFrame')}
  >
    {#if isSavingFrame}
      <Loader2 class="w-3.5 h-3.5 animate-spin" />
    {:else}
      <Camera class="w-3.5 h-3.5" />
    {/if}
  </Button>
</div>
<!-- Proxy toggle — hidden at narrow widths -->
<div class="hidden @min-[440px]:flex items-center gap-0.5 flex-shrink-0">
  <Separator orientation="vertical" class="h-4 flex-shrink-0" />
  <Button
    variant="ghost"
    size="icon"
    style={btnSize}
    class={`flex-shrink-0 ${
      useProxy.current
        ? 'text-green-500 hover:text-green-400 hover:bg-green-500/10'
        : 'text-muted-foreground hover:text-foreground'
    }`}
    onclick={toggleUseProxy}
    data-tooltip={useProxy.current
      ? t('preview.controls.proxyPlaybackOn')
      : t('preview.controls.proxyPlaybackOff')}
    aria-label={useProxy.current
      ? t('preview.controls.disableProxyPlayback')
      : t('preview.controls.enableProxyPlayback')}
  >
    <Zap class="w-3.5 h-3.5" />
  </Button>
</div>
