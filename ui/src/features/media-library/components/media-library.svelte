<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { mergeProps } from 'bits-ui'
  import Search from 'lucide-svelte/icons/search'
  import Filter from 'lucide-svelte/icons/filter'
  import SortAsc from 'lucide-svelte/icons/arrow-up-narrow-wide'
  import Video from 'lucide-svelte/icons/video'
  import FileAudio from 'lucide-svelte/icons/file-audio'
  import ImageIcon from 'lucide-svelte/icons/image'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import Grid3x3 from 'lucide-svelte/icons/grid-3x3'
  import List from 'lucide-svelte/icons/list'
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert'
  import Info from 'lucide-svelte/icons/info'
  import X from 'lucide-svelte/icons/x'
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import Link from 'lucide-svelte/icons/link'
  import Link2Off from 'lucide-svelte/icons/link-2-off'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import Film from 'lucide-svelte/icons/film'
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import Zap from 'lucide-svelte/icons/zap'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Copy from 'lucide-svelte/icons/copy'
  import Check from 'lucide-svelte/icons/check'
  import Upload from 'lucide-svelte/icons/upload'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import FileText from 'lucide-svelte/icons/file-text'
  import ScanSearch from 'lucide-svelte/icons/scan-search'
  import FileJson from 'lucide-svelte/icons/file-json'
  import Globe from 'lucide-svelte/icons/globe'
  import Download from 'lucide-svelte/icons/download'
  import { importSceneBrowserPanel, useSceneBrowserStore } from '../deps/scene-browser'
  import { createLogger } from '@/shared/logging/logger'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Slider } from '@/components/ui/slider'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
  import MarqueeOverlay from '@/shared/marquee/marquee-overlay.svelte'
  import { cn } from '@/shared/ui/cn'
  import { GridMediaGrid, ListMediaGrid } from './media-grid'
  import { CompositionsSection } from './compositions-section'
  import BackgroundTaskProgress from './background-task-progress.svelte'
  import MissingMediaDialog from './missing-media-dialog.svelte'
  import OrphanedClipsDialog from './orphaned-clips-dialog.svelte'
  import UnsupportedAudioCodecDialog from './unsupported-audio-codec-dialog.svelte'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { useFilteredMediaItems } from '@/features/media-library/stores/use-filtered-media-items.svelte'
  import {
    useCompositionsStore,
    useCompositionNavigationStore,
  } from '@/features/media-library/deps/timeline-stores'
  import { useProjectStore } from '@/features/media-library/deps/projects'
  import { proxyService } from '@/features/media-library/services/proxy-service'
  import { frameInterpolationService } from '@/features/media-library/services/frame-interpolation-service'
  import { upscaleService } from '@/features/media-library/services/upscale-service'
  import { importMediaLibraryService } from '@/features/media-library/services/media-library-service-loader'
  import { cancelMediaTranscriptionJob } from '@/features/media-library/services/media-transcription-runner'
  import { importMediaAnalysisService } from '@/features/media-library/services/media-analysis-service-loader'
  import { getSupportedMediaFormatLabels } from '@/features/media-library/utils/media-file-picker'
  import { getSharedProxyKey } from '@/features/media-library/utils/proxy-key'
  import { getMediaType } from '@/features/media-library/utils/validation'
  import { getProjectBrokenMediaIds } from '@/features/media-library/utils/broken-media'
  import type { MediaMetadata } from '@/types/storage'
  import { isMarqueeJustFinished } from '@/shared/marquee/use-marquee-selection.svelte'
  import { getEditorUi } from '$lib/context'
  import { select } from '$lib/store.svelte'
  import { locale, t } from '$lib/i18n.svelte'
  import { useMediaLibraryMarquee } from './use-media-library-marquee.svelte'
  import { useMediaLibraryDragDrop } from './use-media-library-drag-drop.svelte'
  import { useMediaTaskProgress } from './use-media-task-progress.svelte'
  import { useMediaLibraryDeletion } from './use-media-library-deletion.svelte'
  import { getWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'

  interface MediaLibraryProps {
    onMediaSelect?: (mediaId: string) => void
  }

  type UrlImportMode = 'stream' | 'download'
  type TriggerProps = Record<string, unknown>

  const logger = createLogger('MediaLibrary')

  const GROUP_ICONS = {
    video: Video,
    audio: FileAudio,
    image: ImageIcon,
    gif: Film,
    lottie: FileJson,
  } as const

  const MEDIA_HEADER_MAX_COMPACT_LEVEL = 4
  const MEDIA_HEADER_OVERFLOW_TOLERANCE_PX = 1
  const MEDIA_HEADER_RELAX_WIDTH_DELTA_PX = 8

  let { onMediaSelect }: MediaLibraryProps = $props()

  const { editor } = getEditorUi()
  // The host's media source policy is fixed for the editor's lifetime. Local
  // files cover FreeCut's import, drop and download-from-URL (which writes the
  // file into the workspace); URL media is added in place through the SDK.
  const mediaSources = editor.mediaSources
  const canStreamUrl = mediaSources.url
  const canDownloadUrl = mediaSources.local
  // An editor without a workspace holds imported files in memory until its host uploads them.
  const hasWorkspace = getWorkspaceRoot() !== null

  let container = $state<HTMLDivElement | null>(null)
  let headerToolbar = $state<HTMLDivElement | null>(null)
  let headerToolbarWidth = 0
  let scrollContainer = $state<HTMLDivElement | null>(null)
  let urlInput = $state<HTMLInputElement | null>(null)
  let headerCompactLevel = $state(0)
  let openGroups = $state.raw<Set<string>>(new Set(['video', 'audio', 'image', 'gif', 'lottie']))
  let showImportUrlDialog = $state(false)
  let importUrlValue = $state('')
  let isImportUrlSubmitting = $state(false)
  let urlImportMode = $state<UrlImportMode>(canStreamUrl ? 'stream' : 'download')
  let urlAddError = $state<string | null>(null)
  let errorLinkCopied = $state(false)

  // Store selectors
  const currentProjectId = select(useMediaLibraryStore, (s) => s.currentProjectId)
  const searchQuery = select(useMediaLibraryStore, (s) => s.searchQuery)
  const filterByType = select(useMediaLibraryStore, (s) => s.filterByType)
  const sortBy = select(useMediaLibraryStore, (s) => s.sortBy)
  const viewMode = select(useMediaLibraryStore, (s) => s.viewMode)
  const sceneBrowserOpen = select(useSceneBrowserStore, (s) => s.open)
  const mediaItemSize = select(useMediaLibraryStore, (s) => s.mediaItemSize)
  const selectedMediaIds = select(useMediaLibraryStore, (s) => s.selectedMediaIds)
  const selectedCompositionIds = select(useMediaLibraryStore, (s) => s.selectedCompositionIds)
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)
  const error = select(useMediaLibraryStore, (s) => s.error)
  const errorLink = select(useMediaLibraryStore, (s) => s.errorLink)
  const notification = select(useMediaLibraryStore, (s) => s.notification)
  const brokenMediaIds = select(useMediaLibraryStore, (s) => s.brokenMediaIds)
  const isScanningMediaHealth = select(useMediaLibraryStore, (s) => s.isScanningMediaHealth)
  const projectStoreProjectId = select(useProjectStore, (s) => s.currentProject?.id ?? null)
  const proxyStatus = select(useMediaLibraryStore, (s) => s.proxyStatus)
  const filteredMediaItems = useFilteredMediaItems()
  const mediaGroups = $derived.by(() => {
    const groups: {
      key: string
      label: string
      icon: 'video' | 'audio' | 'image' | 'gif' | 'lottie'
      items: MediaMetadata[]
    }[] = []
    const videos: MediaMetadata[] = []
    const audio: MediaMetadata[] = []
    const gifs: MediaMetadata[] = []
    const images: MediaMetadata[] = []
    const lotties: MediaMetadata[] = []
    for (const item of filteredMediaItems.current) {
      if (item.mimeType === 'image/gif') {
        gifs.push(item)
      } else {
        const type = getMediaType(item.mimeType)
        if (type === 'video') videos.push(item)
        else if (type === 'audio') audio.push(item)
        else if (type === 'lottie') lotties.push(item)
        else images.push(item)
      }
    }
    if (videos.length > 0)
      groups.push({
        key: 'video',
        label: t('media.library.groupVideos'),
        icon: 'video',
        items: videos,
      })
    if (audio.length > 0)
      groups.push({
        key: 'audio',
        label: t('media.library.groupAudio'),
        icon: 'audio',
        items: audio,
      })
    if (images.length > 0)
      groups.push({
        key: 'image',
        label: t('media.library.groupImages'),
        icon: 'image',
        items: images,
      })
    if (gifs.length > 0)
      groups.push({ key: 'gif', label: t('media.library.groupGifs'), icon: 'gif', items: gifs })
    if (lotties.length > 0)
      groups.push({
        key: 'lottie',
        label: t('media.library.groupLottie'),
        icon: 'lottie',
        items: lotties,
      })
    return groups
  })
  const compositions = select(useCompositionsStore, (s) => s.compositions)
  const MediaGridView = $derived(viewMode.current === 'grid' ? GridMediaGrid : ListMediaGrid)

  // Composition navigation — show banner when inside a sub-comp
  const activeCompositionId = select(useCompositionNavigationStore, (s) => s.activeCompositionId)
  const breadcrumbs = select(useCompositionNavigationStore, (s) => s.breadcrumbs)
  const activeCompLabel = $derived(
    breadcrumbs.current.length > 1
      ? breadcrumbs.current[breadcrumbs.current.length - 1]?.label
      : null,
  )

  // Unsupported codec dialog state
  const unsupportedCodecFiles = select(useMediaLibraryStore, (s) => s.unsupportedCodecFiles)
  const showUnsupportedCodecDialog = select(
    useMediaLibraryStore,
    (s) => s.showUnsupportedCodecDialog,
  )

  // HMR recovery: if media store lost project context, rehydrate it from project store.
  $effect(() => {
    const projectId = projectStoreProjectId.current
    if (!currentProjectId.current && projectId) {
      const store = useMediaLibraryStore.getState()
      store.setCurrentProject(projectId)
      void store.loadMediaItems().catch((error) => {
        logger.error('Failed to load media library during store recovery:', error)
      })
    }
  })

  const selectedAssetCount = $derived(
    selectedMediaIds.current.length + selectedCompositionIds.current.length,
  )
  const { marquee } = useMediaLibraryMarquee(() => ({
    compositions: compositions.current,
    filteredMediaItems: filteredMediaItems.current,
    selectedMediaIds: selectedMediaIds.current,
    selectedCompositionIds: selectedCompositionIds.current,
    scrollContainer,
    setSelection: (selection) => useMediaLibraryStore.getState().setSelection(selection),
  }))

  const deletion = useMediaLibraryDeletion(() => ({
    container,
    selectedMediaIds: selectedMediaIds.current,
    selectedCompositionIds: selectedCompositionIds.current,
    selectedAssetCount,
    currentProjectId: currentProjectId.current,
    clearSelection: () => useMediaLibraryStore.getState().clearSelection(),
    deleteMediaBatch: (mediaIds) => useMediaLibraryStore.getState().deleteMediaBatch(mediaIds),
  }))

  // Import files by copying them into the workspace-backed media store.
  const handleImport = async () => {
    try {
      await useMediaLibraryStore.getState().importMedia({ storageMode: 'copy' })
    } catch (error) {
      logger.error('Import failed:', error)
    }
  }

  const handleLinkImport = async () => {
    try {
      await useMediaLibraryStore.getState().importMedia({ storageMode: 'link' })
    } catch (error) {
      logger.error('Link import failed:', error)
    }
  }

  const openImportUrlDialog = () => {
    urlImportMode = canStreamUrl ? 'stream' : 'download'
    urlAddError = null
    showImportUrlDialog = true
  }

  const closeImportUrlDialog = () => {
    showImportUrlDialog = false
    importUrlValue = ''
    urlAddError = null
  }

  // EmbeddableCut's URL media: probed with range requests and read in place,
  // never copied into the workspace.
  const addUrlInPlace = async (url: string) => {
    urlAddError = null
    try {
      await editor.media.addUrl({ url })
      closeImportUrlDialog()
    } catch (error) {
      logger.error('Add from URL failed:', error)
      urlAddError = error instanceof Error ? error.message : String(error)
    }
  }

  const handleImportUrl = async (event: SubmitEvent) => {
    event.preventDefault()
    if (isImportUrlSubmitting) {
      return
    }

    isImportUrlSubmitting = true
    try {
      if (urlImportMode === 'stream') {
        await addUrlInPlace(importUrlValue.trim())
        return
      }
      await useMediaLibraryStore.getState().importMediaFromUrl(importUrlValue)
      if (!useMediaLibraryStore.getState().error) {
        closeImportUrlDialog()
      }
    } catch (error) {
      logger.error('Import from URL failed:', error)
    } finally {
      isImportUrlSubmitting = false
    }
  }

  // Import files from drag-drop handles
  const handleImportHandles = async (handles: FileSystemFileHandle[]) => {
    try {
      await useMediaLibraryStore.getState().importHandles(handles)
    } catch (error) {
      logger.error('Import failed:', error)
    }
  }

  // Panel-level drag/drop handling so the drop zone covers the full panel height.
  const dragDrop = useMediaLibraryDragDrop(() => ({
    showNotification: (notification) =>
      useMediaLibraryStore.getState().showNotification(notification),
    importHandles: handleImportHandles,
    enabled: mediaSources.local,
  }))

  const currentProjectBrokenMediaIds = $derived(
    getProjectBrokenMediaIds(brokenMediaIds.current, mediaById.current),
  )

  const progress = useMediaTaskProgress()

  const handleGenerateSelectedProxies = async () => {
    const statuses = proxyStatus.current
    const byId = mediaById.current
    const selectedItems = selectedMediaIds.current
      .map((id) => byId[id])
      .filter(
        (m): m is MediaMetadata =>
          m !== undefined &&
          proxyService.canGenerateProxy(m.mimeType) &&
          statuses.get(m.id) !== 'ready' &&
          statuses.get(m.id) !== 'generating',
      )

    selectedItems.forEach((item) => {
      const proxyKey = getSharedProxyKey(item)
      proxyService.setProxyKey(item.id, proxyKey)
      proxyService.generateProxy(
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
    })
  }

  const handleCancelAllProxies = () => {
    const byId = mediaById.current
    for (const [mediaId, status] of proxyStatus.current.entries()) {
      if (status !== 'generating') {
        continue
      }

      const media = byId[mediaId]
      proxyService.cancelProxy(mediaId, media ? getSharedProxyKey(media) : undefined)
    }
  }

  const handleCancelAllInterpolation = () => {
    for (const [mediaId, status] of useMediaLibraryStore.getState().interpolationStatus.entries()) {
      if (status === 'generating') {
        frameInterpolationService.cancel(mediaId)
      }
    }
  }

  const handleCancelAllUpscales = () => {
    for (const [mediaId, status] of useMediaLibraryStore.getState().upscaleStatus.entries()) {
      if (status === 'generating') {
        upscaleService.cancel(mediaId)
      }
    }
  }

  const handleCancelAllTranscriptions = () => {
    for (const [mediaId, status] of useMediaLibraryStore.getState().transcriptStatus.entries()) {
      if (status !== 'queued' && status !== 'transcribing') {
        continue
      }

      cancelMediaTranscriptionJob(mediaId)
    }
  }

  // Count selected items that are eligible for proxy generation
  const selectedProxyEligibleCount = $derived.by(() => {
    const statuses = proxyStatus.current
    const byId = mediaById.current
    return selectedMediaIds.current.filter((id) => {
      const m = byId[id]
      return (
        m &&
        proxyService.canGenerateProxy(m.mimeType) &&
        statuses.get(id) !== 'ready' &&
        statuses.get(id) !== 'generating'
      )
    }).length
  })

  $effect.pre(() => {
    const toolbar = headerToolbar
    if (!toolbar) return
    // Re-measure whenever the toolbar's contents can change width.
    void [
      currentProjectBrokenMediaIds.length,
      currentProjectId.current,
      headerCompactLevel,
      selectedAssetCount,
      selectedProxyEligibleCount,
      locale.current,
    ]

    let frame: number | undefined
    const measure = () => {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame)
      }

      frame = window.requestAnimationFrame(() => {
        frame = undefined
        const nextWidth = toolbar.clientWidth
        const previousWidth = headerToolbarWidth
        headerToolbarWidth = nextWidth

        if (previousWidth > 0 && nextWidth > previousWidth + MEDIA_HEADER_RELAX_WIDTH_DELTA_PX) {
          headerCompactLevel = 0
          return
        }

        const overflowing =
          toolbar.scrollWidth - toolbar.clientWidth > MEDIA_HEADER_OVERFLOW_TOLERANCE_PX
        if (!overflowing) return

        headerCompactLevel = Math.min(MEDIA_HEADER_MAX_COMPACT_LEVEL, headerCompactLevel + 1)
      })
    }

    const ResizeObserverCtor = typeof ResizeObserver === 'undefined' ? null : ResizeObserver
    const observer = ResizeObserverCtor ? new ResizeObserverCtor(measure) : null
    observer?.observe(toolbar)
    window.addEventListener('resize', measure)
    measure()

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame)
      }
    }
  })

  const handleScrollContentClick = (event: MouseEvent) => {
    if (isMarqueeJustFinished()) return

    const target = event.target as HTMLElement
    if (!target.closest('[data-media-id], [data-composition-id]')) {
      useMediaLibraryStore.getState().clearSelection()
    }
  }

  const handleCopyErrorLink = (text: string) => {
    void navigator.clipboard.writeText(text)
    errorLinkCopied = true
    setTimeout(() => (errorLinkCopied = false), 2000)
  }

  const toggleGroup = (key: string, open: boolean) => {
    const next = new Set(openGroups)
    if (open) next.add(key)
    else next.delete(key)
    openGroups = next
  }

  // Loaded once, on the first switch to Scenes.
  let sceneBrowserPanel: ReturnType<typeof importSceneBrowserPanel> | null = null
  const loadSceneBrowserPanel = () => (sceneBrowserPanel ??= importSceneBrowserPanel())

  const notificationTone = (
    type: string,
    info: string,
    warning: string,
    success: string,
    other: string,
  ) => (type === 'info' ? info : type === 'warning' ? warning : type === 'success' ? success : other)

  const urlImportModes = $derived([
    {
      mode: 'stream' as const,
      Icon: Globe,
      label: t('media.urlMedia.modeStream'),
      hint: t('media.urlMedia.modeStreamHint'),
    },
    {
      mode: 'download' as const,
      Icon: Download,
      label: t('media.urlMedia.modeDownload'),
      hint: t('media.urlMedia.modeDownloadHint'),
    },
  ])
</script>

{#snippet headerActionTooltip(label: string, trigger: Snippet<[TriggerProps]>)}
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}{@render trigger(props)}{/snippet}
    </TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
{/snippet}

{#snippet taskDetailRows(rows: ReadonlyArray<{ id: string; name: string; percent: number }>)}
  {#each rows as row (row.id)}
    <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span class="truncate">{row.name}</span>
      <span class="tabular-nums flex-shrink-0">{row.percent}%</span>
    </div>
  {/each}
{/snippet}

{#snippet cancelButton(onclick: () => void, label: string)}
  <button
    type="button"
    {onclick}
    class="text-muted-foreground hover:text-foreground transition-colors"
  >
    {label}
  </button>
{/snippet}

<div bind:this={container} class="h-full flex flex-col">
  <!-- Header toolbar -->
  <div class="@container px-3 py-2 border-b border-border flex-shrink-0">
    <TooltipProvider>
      <div
        bind:this={headerToolbar}
        class="flex flex-nowrap items-center gap-2 text-xs min-w-0 overflow-hidden"
      >
        <!-- Import action -->
        {#if mediaSources.local}
          <div class="flex shrink-0">
            {#snippet importTrigger(props: TriggerProps)}
              <button
                {...mergeProps(props, { onclick: handleImport })}
                disabled={!currentProjectId.current}
                class="flex items-center gap-1.5 h-7 px-2.5 {hasWorkspace ? 'rounded-l-md' : 'rounded-md'}
                  bg-primary text-primary-foreground
                  hover:bg-primary/90
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-150"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span class={headerCompactLevel >= 4 ? 'hidden' : 'hidden @[260px]:inline'}>
                  {t('media.library.import')}
                </span>
              </button>
            {/snippet}
            {@render headerActionTooltip(t('media.library.importMediaFiles'), importTrigger)}
            <!-- Without a workspace a file is only ever held, so there's nothing to choose. -->
            {#if hasWorkspace}
              <DropdownMenu>
                <DropdownMenuTrigger disabled={!currentProjectId.current}>
                  {#snippet child({ props })}
                    <button
                      {...props}
                      class="flex h-7 w-7 items-center justify-center rounded-r-md border-l border-primary-foreground/20
                        bg-primary text-primary-foreground
                        hover:bg-primary/90
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-colors duration-150"
                      aria-label={t('media.library.importMoreOptions')}
                      title={t('media.library.importMoreOptions')}
                    >
                      <ChevronDown class="w-3.5 h-3.5" />
                    </button>
                  {/snippet}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="w-56">
                  <DropdownMenuItem onSelect={handleImport}>
                    <FolderOpen class="w-4 h-4 mr-2" />
                    {t('media.library.importCopyToWorkspace')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleLinkImport}>
                    <Link class="w-4 h-4 mr-2" />
                    {t('media.library.importLinkOriginal')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            {/if}
          </div>
        {/if}

        {#if canStreamUrl || canDownloadUrl}
          {#snippet urlTrigger(props: TriggerProps)}
            <button
              {...mergeProps(props, { onclick: openImportUrlDialog })}
              disabled={!currentProjectId.current}
              class="flex items-center gap-1.5 h-7 px-2.5 rounded-md shrink-0 border
                bg-secondary border-border text-muted-foreground
                hover:text-primary hover:bg-primary/10 hover:border-primary/40
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors duration-150"
            >
              <Link class="w-3.5 h-3.5" />
              <span class={headerCompactLevel >= 2 ? 'hidden' : 'hidden @[360px]:inline'}>
                {t('media.library.url')}
              </span>
            </button>
          {/snippet}
          {@render headerActionTooltip(
            canStreamUrl ? t('media.urlMedia.streamTitle') : t('media.library.importMediaFromUrl'),
            urlTrigger,
          )}
        {/if}

        <!-- Workspace health scan indicator -->
        {#if isScanningMediaHealth.current}
          {#snippet healthTrigger(props: TriggerProps)}
            <div
              {...props}
              class="flex items-center gap-1.5 h-7 px-2.5 rounded-md shrink-0 border
                bg-secondary border-border text-muted-foreground"
              aria-live="polite"
            >
              <ScanSearch class="w-3.5 h-3.5 animate-pulse" />
              <span class={headerCompactLevel >= 3 ? 'hidden' : 'hidden @[380px]:inline'}>
                {t('media.library.checkingWorkspaceHealthShort')}
              </span>
            </div>
          {/snippet}
          {@render headerActionTooltip(t('media.library.checkingWorkspaceHealth'), healthTrigger)}
        {/if}

        <!-- Missing media indicator -->
        {#if currentProjectBrokenMediaIds.length > 0}
          {#snippet missingTrigger(props: TriggerProps)}
            <button
              {...mergeProps(props, {
                onclick: () => useMediaLibraryStore.getState().openMissingMediaDialog(),
              })}
              class="flex items-center gap-1.5 h-7 px-2.5 rounded-md shrink-0
                bg-destructive/10 border border-destructive/25 text-destructive
                hover:bg-destructive/20 hover:border-destructive/40
                transition-colors duration-150"
            >
              <Link2Off class="w-3.5 h-3.5" />
              <span class={headerCompactLevel >= 3 ? 'hidden' : 'hidden @[340px]:inline'}>
                {t('media.library.missingCount', {
                  count: currentProjectBrokenMediaIds.length,
                })}
              </span>
            </button>
          {/snippet}
          {@render headerActionTooltip(
            t('media.library.viewMissingMedia', {
              count: currentProjectBrokenMediaIds.length,
            }),
            missingTrigger,
          )}
        {/if}

        <!-- Selection indicator & actions -->
        {#if selectedAssetCount > 0}
          <div class="h-4 w-px bg-border hidden @[300px]:block"></div>

          <!-- Selection badge -->
          <div
            class="flex shrink-0 items-center gap-1 h-7 pl-2 pr-1 rounded-md bg-accent/50 border border-border min-w-0 max-w-full overflow-hidden"
          >
            <span
              class={cn('tabular-nums shrink-0 whitespace-nowrap', headerCompactLevel >= 4 && 'hidden')}
            >
              {t('media.library.selectedCount', { count: selectedAssetCount })}
            </span>
            <span
              class={cn(
                'hidden tabular-nums shrink-0 whitespace-nowrap',
                headerCompactLevel >= 4 && 'inline',
              )}
              aria-label={t('media.library.selectedCount', { count: selectedAssetCount })}
            >
              {selectedAssetCount}
            </span>
            {#snippet clearTrigger(props: TriggerProps)}
              <button
                {...mergeProps(props, {
                  onclick: () => useMediaLibraryStore.getState().clearSelection(),
                })}
                class="ml-0.5 p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X class="w-3 h-3" />
              </button>
            {/snippet}
            {@render headerActionTooltip(t('media.library.clearSelection'), clearTrigger)}
          </div>

          <!-- Generate proxies for selection -->
          {#if selectedProxyEligibleCount > 0}
            {#snippet proxyTrigger(props: TriggerProps)}
              <button
                {...mergeProps(props, { onclick: handleGenerateSelectedProxies })}
                class="flex items-center gap-1.5 h-7 px-2.5 rounded-md shrink-0 border
                  bg-secondary border-border text-muted-foreground
                  hover:text-primary hover:bg-primary/10 hover:border-primary/40
                  transition-colors duration-150"
              >
                <Zap class="w-3.5 h-3.5" />
                <span class={headerCompactLevel >= 2 ? 'hidden' : 'hidden @[440px]:inline'}>
                  {t('media.library.proxyCount', { count: selectedProxyEligibleCount })}
                </span>
              </button>
            {/snippet}
            {@render headerActionTooltip(
              t('media.library.generateProxiesForSelected', {
                count: selectedProxyEligibleCount,
              }),
              proxyTrigger,
            )}
          {/if}

          <!-- Delete action -->
          {#snippet deleteTrigger(props: TriggerProps)}
            <button
              {...mergeProps(props, { onclick: deletion.handleDeleteSelected })}
              class="flex items-center gap-1.5 h-7 px-2.5 rounded-md shrink-0
                bg-destructive/10 border border-destructive/25 text-destructive
                hover:bg-destructive/20 hover:border-destructive/40
                transition-colors duration-150"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span class={headerCompactLevel >= 1 ? 'hidden' : 'hidden @[400px]:inline'}>
                {t('common.delete')}
              </span>
            </button>
          {/snippet}
          {@render headerActionTooltip(t('media.library.deleteSelectedAssets'), deleteTrigger)}
        {/if}
      </div>
    </TooltipProvider>
  </div>

  <Dialog
    bind:open={
      () => showImportUrlDialog,
      (open) => {
        showImportUrlDialog = open
        if (!open && !isImportUrlSubmitting) {
          importUrlValue = ''
          urlAddError = null
        }
      }
    }
  >
    <DialogContent
      class="sm:max-w-[560px]"
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        urlInput?.focus()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {urlImportMode === 'stream'
            ? t('media.urlMedia.streamTitle')
            : t('media.library.importFromUrlTitle')}
        </DialogTitle>
        <DialogDescription>
          {urlImportMode === 'stream'
            ? t('media.urlMedia.streamDescription')
            : t('media.library.importFromUrlDescription')}
        </DialogDescription>
      </DialogHeader>

      <form onsubmit={handleImportUrl} class="space-y-4">
        {#if canStreamUrl && canDownloadUrl}
          <div
            role="group"
            aria-label={t('media.urlMedia.modeLabel')}
            class="grid grid-cols-2 gap-2"
          >
            {#each urlImportModes as option (option.mode)}
              <button
                type="button"
                aria-pressed={urlImportMode === option.mode}
                disabled={isImportUrlSubmitting}
                onclick={() => {
                  urlImportMode = option.mode
                  urlAddError = null
                }}
                class={cn(
                  'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50',
                  urlImportMode === option.mode
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-secondary/40',
                )}
              >
                <span class="flex items-center gap-1.5 text-sm font-medium">
                  <option.Icon class="w-3.5 h-3.5" />
                  {option.label}
                </span>
                <span class="text-xs text-muted-foreground">{option.hint}</span>
              </button>
            {/each}
          </div>
        {/if}

        <div class="space-y-2">
          <Input
            bind:ref={urlInput}
            type="url"
            inputmode="url"
            placeholder="https://example.com/video.mp4"
            bind:value={importUrlValue}
            oninput={() => (urlAddError = null)}
            disabled={isImportUrlSubmitting}
          />
          <p class="text-xs text-muted-foreground">
            {urlImportMode === 'stream'
              ? t('media.urlMedia.streamHint')
              : t('media.library.importFromUrlHint')}
          </p>
          {#if urlAddError}
            <div
              role="alert"
              class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <p class="font-medium">{t('media.urlMedia.addFailed')}</p>
              <p class="mt-0.5 break-words">{urlAddError}</p>
            </div>
          {/if}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onclick={() => {
              if (!isImportUrlSubmitting) {
                closeImportUrlDialog()
              }
            }}
            disabled={isImportUrlSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!currentProjectId.current ||
              importUrlValue.trim().length === 0 ||
              isImportUrlSubmitting}
          >
            {#if isImportUrlSubmitting}
              <Loader2 class="w-4 h-4 animate-spin" />
            {/if}
            {urlImportMode === 'stream' ? t('media.urlMedia.add') : t('media.library.import')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <!-- Error message -->
  {#if error.current}
    <div
      class="mx-4 mt-3 p-3 bg-destructive/10 border border-destructive/50 rounded text-xs animate-in slide-in-from-top-2 duration-200"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="text-destructive leading-relaxed flex-1">
          <p>{error.current}</p>
          {#if errorLink.current}
            {@const link = errorLink.current}
            <div class="mt-2 flex items-center gap-1.5">
              <code
                class="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground select-text"
              >
                {link}
              </code>
              <button
                onclick={() => handleCopyErrorLink(link)}
                class="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted transition-colors"
                title={t('media.library.copyToClipboard')}
              >
                {#if errorLinkCopied}
                  <Check class="h-3 w-3 text-green-500" />
                {:else}
                  <Copy class="h-3 w-3 text-muted-foreground" />
                {/if}
              </button>
            </div>
          {/if}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onclick={() => useMediaLibraryStore.getState().clearError()}
          class="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {t('media.library.dismiss')}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Notification message -->
  {#if notification.current}
    {@const note = notification.current}
    <div
      class="mx-4 mt-3 p-2.5 rounded text-xs animate-in slide-in-from-top-2 duration-200 {notificationTone(
        note.type,
        'bg-orange-500/10 border border-orange-500/30',
        'bg-yellow-500/10 border border-yellow-500/30',
        'bg-green-500/10 border border-green-500/30',
        'bg-destructive/10 border border-destructive/50',
      )}"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <Info
            class="w-3.5 h-3.5 flex-shrink-0 {notificationTone(
              note.type,
              'text-orange-500',
              'text-yellow-500',
              'text-green-500',
              'text-destructive',
            )}"
          />
          <p
            class="leading-relaxed line-clamp-2 {notificationTone(
              note.type,
              'text-orange-600 dark:text-orange-400',
              'text-yellow-600 dark:text-yellow-400',
              'text-green-600 dark:text-green-400',
              'text-destructive',
            )}"
          >
            {note.message}
          </p>
        </div>
        <button
          onclick={() => useMediaLibraryStore.getState().clearNotification()}
          class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  {/if}

  <!-- Search + view toggle always render so the toggle stays reachable
       in Scene mode. The search input and the filter row below only scope
       the media-library grid, so they're hidden when the Scene browser is
       mounted (it has its own search). -->
  <div class="px-4 pt-3 pb-2 space-y-2 flex-shrink-0">
    <!-- Search + Media/Scenes toggle group -->
    <div class="@container flex items-center gap-2">
      {#if !sceneBrowserOpen.current}
        <div class="relative group flex-1 min-w-0">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors"
          />
          <Input
            placeholder={t('media.searchMedia')}
            value={searchQuery.current}
            oninput={(e) => useMediaLibraryStore.getState().setSearchQuery(e.currentTarget.value)}
            class="pl-8 h-7 bg-secondary border border-border focus:border-primary text-foreground placeholder:text-muted-foreground text-xs"
          />
          {#if searchQuery.current}
            <button
              onclick={() => useMediaLibraryStore.getState().setSearchQuery('')}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
            >
              <X class="w-3 h-3" />
            </button>
          {/if}
        </div>
      {/if}
      {#if sceneBrowserOpen.current}
        <div class="flex-1 min-w-0" aria-hidden="true"></div>
      {/if}
      <div
        role="group"
        aria-label={t('media.library.libraryView')}
        class="inline-flex items-center h-7 rounded-md border border-border bg-secondary p-0.5 shrink-0"
      >
        {#snippet mediaTabTrigger(props: TriggerProps)}
          <button
            {...mergeProps(props, {
              onclick: () => {
                if (sceneBrowserOpen.current) useSceneBrowserStore.getState().closeBrowser()
              },
            })}
            aria-pressed={!sceneBrowserOpen.current}
            class={cn(
              'flex items-center gap-1 h-6 px-1.5 @[280px]:px-2 rounded-[3px] text-[11px] transition-colors duration-150',
              !sceneBrowserOpen.current
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Film class="w-3 h-3" />
            <span class="hidden @[280px]:inline">{t('media.library.mediaTab')}</span>
          </button>
        {/snippet}
        {@render headerActionTooltip(t('media.library.showMediaLibrary'), mediaTabTrigger)}
        {#snippet scenesTabTrigger(props: TriggerProps)}
          <button
            {...mergeProps(props, {
              onclick: () => {
                if (!sceneBrowserOpen.current) useSceneBrowserStore.getState().openBrowser()
              },
            })}
            aria-pressed={sceneBrowserOpen.current}
            class={cn(
              'flex items-center gap-1 h-6 px-1.5 @[280px]:px-2 rounded-[3px] text-[11px] transition-colors duration-150',
              sceneBrowserOpen.current
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ScanSearch class="w-3 h-3" />
            <span class="hidden @[280px]:inline">{t('media.library.scenesTab')}</span>
          </button>
        {/snippet}
        {@render headerActionTooltip(t('media.library.searchScenes'), scenesTabTrigger)}
      </div>
    </div>

    {#if !sceneBrowserOpen.current}
      <!-- Filters and sort -->
      <div class="@container flex items-center gap-1.5 min-w-0">
        <!-- Filter by type -->
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                class="h-6 bg-secondary border text-[10px] px-2 flex-shrink-0 {filterByType.current
                  ? 'border-primary text-primary hover:bg-primary/10'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'}"
              >
                <Filter class="w-2.5 h-2.5" />
                <span class="hidden @[280px]:inline ml-1">
                  {filterByType.current
                    ? t(`media.library.typeShort.${filterByType.current}`)
                    : t('media.library.allShort')}
                </span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="bg-popover border border-border">
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setFilterByType(null)}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {t('media.library.allTypes')}
            </DropdownMenuItem>
            <DropdownMenuSeparator class="bg-border" />
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setFilterByType('video')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <Video class="w-3 h-3 mr-2" />
              {t('media.type.video')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setFilterByType('audio')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <FileAudio class="w-3 h-3 mr-2" />
              {t('media.type.audio')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setFilterByType('image')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <ImageIcon class="w-3 h-3 mr-2" />
              {t('media.type.image')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setFilterByType('lottie')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <FileJson class="w-3 h-3 mr-2" />
              {t('media.type.lottie')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Sort by -->
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                class="h-6 bg-secondary border border-border text-muted-foreground hover:border-primary/50 hover:text-primary text-[10px] px-2 flex-shrink-0"
              >
                <SortAsc class="w-2.5 h-2.5" />
                <span class="hidden @[280px]:inline ml-1">
                  {t(`media.library.sortShort.${sortBy.current}`)}
                </span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="bg-popover border border-border">
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setSortBy('date')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {t('media.library.sortDate')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setSortBy('name')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {t('media.library.sortName')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => useMediaLibraryStore.getState().setSortBy('size')}
              class="text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {t('media.library.sortSize')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- View mode toggle + item size -->
        <div class="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {#if viewMode.current === 'grid'}
            <Slider
              min={1}
              max={5}
              step={1}
              value={[mediaItemSize.current]}
              onValueChange={([v]) => useMediaLibraryStore.getState().setMediaItemSize(v ?? 3)}
              class="flex-1 min-w-6 max-w-24"
              aria-label={t('media.library.gridItemSize')}
            />
          {/if}
          <div class="flex items-center border border-border rounded bg-secondary flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onclick={() => useMediaLibraryStore.getState().setViewMode('grid')}
              class="h-6 w-6 p-0 rounded-none rounded-l {viewMode.current === 'grid'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              <Grid3x3 class="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => useMediaLibraryStore.getState().setViewMode('list')}
              class="h-6 w-6 p-0 rounded-none rounded-r {viewMode.current === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              <List class="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Composition navigation banner — shown when inside a sub-composition -->
  {#if activeCompositionId.current !== null && activeCompLabel}
    <div
      class="px-3 py-1.5 border-b border-violet-500/30 bg-violet-500/10 flex items-center gap-2 flex-shrink-0"
    >
      <button
        onclick={() => useCompositionNavigationStore.getState().exitComposition()}
        class="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-100 transition-colors"
      >
        <ArrowLeft class="w-3.5 h-3.5" />
        <span>{t('media.library.back')}</span>
      </button>
      <span class="text-xs text-violet-400/60">/</span>
      <span class="text-xs text-violet-300 font-medium truncate">{activeCompLabel}</span>
    </div>
  {/if}

  <!-- Scrollable content: wrapper provides relative context for the drag overlay -->
  <div class="flex-1 relative min-h-0">
    {#if sceneBrowserOpen.current}
      {#await loadSceneBrowserPanel() then module}
        <module.default class="absolute inset-0 bg-background" />
      {/await}
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      bind:this={scrollContainer}
      class={cn(
        'relative h-full overflow-y-auto px-4 pb-4 [scrollbar-gutter:stable]',
        sceneBrowserOpen.current && 'hidden',
      )}
      onclick={handleScrollContentClick}
      ondragenter={dragDrop.handleDragEnter}
      ondragover={dragDrop.handleDragOver}
      ondragleave={dragDrop.handleDragLeave}
      ondrop={dragDrop.handleDrop}
    >
      <MarqueeOverlay {marquee} />

      <!-- Compositions section — collapsible, auto-hidden when empty -->
      <CompositionsSection />

      <!-- Media sections — grouped by type -->
      {#each mediaGroups as group (group.key)}
        {@const Icon = GROUP_ICONS[group.icon]}
        {@const isOpen = openGroups.has(group.key)}
        <Collapsible open={isOpen} onOpenChange={(open) => toggleGroup(group.key, open)}>
          <CollapsibleTrigger
            class="flex items-center gap-2 w-full py-2 hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors"
          >
            <ChevronRight
              class={cn('w-3 h-3 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
            />
            <Icon class="w-3 h-3 text-muted-foreground" />
            <span class="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              {group.label}
            </span>
            <span class="text-[10px] tabular-nums text-muted-foreground">{group.items.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent class="pt-1 pb-2">
            <MediaGridView items={group.items} {onMediaSelect} itemSize={mediaItemSize.current} />
          </CollapsibleContent>
        </Collapsible>
      {/each}

      <!-- Loading / empty state when no groups to show -->
      {#if mediaGroups.length === 0}
        <MediaGridView
          {onMediaSelect}
          itemSize={mediaItemSize.current}
          localImport={mediaSources.local}
          onAddFromUrl={canStreamUrl ? openImportUrlDialog : undefined}
        />
      {/if}
    </div>

    <!-- Drag overlay — absolute sibling, always covers the visible viewport -->
    {#if dragDrop.isDragging}
      <div
        class="absolute inset-0 bg-background/95 bg-gradient-to-br from-primary/15 via-transparent to-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center pointer-events-none"
      >
        <div class="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-primary"></div>
        <div class="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-primary"></div>
        <div class="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-primary"></div>
        <div class="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-primary"></div>
        <div class="flex flex-col items-center gap-4">
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center bg-primary/20 border-2 border-primary"
          >
            <Upload class="w-7 h-7 text-primary animate-bounce" />
          </div>
          <p class="text-base font-bold tracking-wide text-primary">
            {t('media.library.dropFilesHere')}
          </p>
          <div class="flex flex-wrap justify-center gap-2 mt-2">
            {#each getSupportedMediaFormatLabels() as label (label)}
              <span
                class="px-2 py-0.5 bg-secondary border border-border rounded text-xs font-mono text-muted-foreground"
              >
                {label}
              </span>
            {/each}
          </div>
        </div>
        <div class="absolute inset-0 overflow-hidden">
          <div
            class="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan"
          ></div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Background AI analysis status -->
  {#if progress.analysisProgress}
    {@const analysis = progress.analysisProgress}
    {#snippet analysisIcon()}
      <Loader2 class="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />
    {/snippet}
    {#snippet analysisMeta()}
      <span class="tabular-nums">{Math.round(progress.analysisPercent)}%</span>
      {#if !analysis.cancelRequested}
        {@render cancelButton(
          () => {
            void importMediaAnalysisService().then(({ mediaAnalysisService }) =>
              mediaAnalysisService.requestCancel(),
            )
          },
          analysis.total > 1 ? t('media.library.cancelAll') : t('common.cancel'),
        )}
      {:else}
        <span class="text-muted-foreground/80">{t('media.library.cancelling')}</span>
      {/if}
    {/snippet}
    {#snippet analysisTrailing()}
      <Sparkles class="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
    {/snippet}
    <BackgroundTaskProgress
      icon={analysisIcon}
      label={analysis.total > 1
        ? t('media.library.analyzingMultiple', {
            current: Math.min(analysis.completed + 1, analysis.total),
            total: analysis.total,
          })
        : t('media.library.analyzingSingle')}
      progressAriaLabel={t('media.library.aiAnalysisProgress')}
      progressPercent={progress.analysisPercent}
      meta={analysisMeta}
      trailing={analysisTrailing}
      fillClass="bg-purple-500"
    />
  {/if}

  <!-- Unified media readiness progress bar -->
  {#if progress.preparingCount > 0}
    {#snippet preparationIcon()}
      <Film class="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
    {/snippet}
    {#snippet preparationDetails()}
      {#each progress.preparationItemRows as row (row.id)}
        <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span class="truncate">{row.name}</span>
          <span class="flex flex-shrink-0 items-center gap-2">
            <span class="hidden sm:inline">{row.kind}</span>
            <span class="tabular-nums">
              {row.status === 'queued' ? t('media.library.preparationQueued') : `${row.percent}%`}
            </span>
          </span>
        </div>
      {/each}
    {/snippet}
    {#snippet preparationMeta()}
      <span class="tabular-nums">
        {progress.hasRunningPreparationTasks
          ? `${Math.round(progress.preparingAvgProgress * 100)}%`
          : t('media.library.preparationQueued')}
      </span>
    {/snippet}
    <BackgroundTaskProgress
      icon={preparationIcon}
      label={t('media.library.preparingMediaWithCount', { count: progress.preparingCount })}
      progressAriaLabel={t('media.library.mediaPreparationProgress')}
      progressPercent={progress.preparingAvgProgress * 100}
      detailsToggleAriaLabel={t('media.library.perItemProgress')}
      details={progress.preparationItemRows.length > 1 ? preparationDetails : undefined}
      meta={preparationMeta}
      fillClass="bg-cyan-500"
    />
  {/if}

  <!-- Transcript generation progress bar -->
  {#if progress.transcribingCount > 0}
    {#snippet transcriptionIcon()}
      <FileText class="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
    {/snippet}
    {#snippet transcriptionDetails()}
      {#each progress.transcriptionItemRows as row (row.id)}
        <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span class="truncate">{row.name}</span>
          <span class="flex flex-shrink-0 items-center gap-2">
            {#if row.stage}<span class="hidden sm:inline">{row.stage}</span>{/if}
            <span class="tabular-nums">{row.percent}%</span>
          </span>
        </div>
      {/each}
    {/snippet}
    {#snippet transcriptionMeta()}
      {#if progress.singleTranscriptionDetail}
        <span class="truncate tabular-nums">{progress.singleTranscriptionDetail}</span>
      {/if}
      <!-- The byte counter already says how far along the transfer is, and the fill bar
           shows it too; a percent as well only crowds out the counter in a narrow panel. -->
      {#if !progress.singleTranscriptionIndeterminate && !progress.singleTranscriptionDetail}
        <span class="tabular-nums">{Math.round(progress.transcribingAvgProgress * 100)}%</span>
      {/if}
      {@render cancelButton(handleCancelAllTranscriptions, t('media.library.cancelAll'))}
    {/snippet}
    <!-- With one job the stage ("Downloading model") is far more useful than the generic
         title, and the panel is too narrow to show both without truncating each to noise. -->
    <BackgroundTaskProgress
      icon={transcriptionIcon}
      label={progress.singleTranscriptionStageLabel ??
        t('media.library.generatingTranscripts', { count: progress.transcribingCount })}
      progressAriaLabel={t('media.library.transcriptGenerationProgress')}
      progressPercent={progress.transcribingAvgProgress * 100}
      indeterminate={progress.singleTranscriptionIndeterminate}
      detailsToggleAriaLabel={t('media.library.perItemProgress')}
      details={progress.transcriptionItemRows.length > 1 ? transcriptionDetails : undefined}
      meta={transcriptionMeta}
      fillClass="bg-blue-500"
    />
  {/if}

  <!-- Proxy generation progress bar -->
  {#if progress.generatingCount > 0}
    {#snippet proxyIcon()}
      <Loader2 class="w-3.5 h-3.5 text-green-500 animate-spin flex-shrink-0" />
    {/snippet}
    {#snippet proxyDetails()}
      {@render taskDetailRows(progress.proxyItemRows)}
    {/snippet}
    {#snippet proxyMeta()}
      <span class="tabular-nums">{Math.round(progress.generatingAvgProgress * 100)}%</span>
      {@render cancelButton(handleCancelAllProxies, t('media.library.cancelAll'))}
    {/snippet}
    <BackgroundTaskProgress
      icon={proxyIcon}
      label={t('media.library.generatingProxies', { count: progress.generatingCount })}
      progressAriaLabel={t('media.library.proxyGenerationProgress')}
      progressPercent={progress.generatingAvgProgress * 100}
      detailsToggleAriaLabel={t('media.library.perItemProgress')}
      details={progress.proxyItemRows.length > 1 ? proxyDetails : undefined}
      meta={proxyMeta}
      fillClass="bg-green-500"
    />
  {/if}

  {#if progress.interpolatingCount > 0}
    {#snippet interpolationIcon()}
      <Loader2 class="w-3.5 h-3.5 text-sky-500 animate-spin flex-shrink-0" />
    {/snippet}
    {#snippet interpolationDetails()}
      {@render taskDetailRows(progress.interpolationItemRows)}
    {/snippet}
    {#snippet interpolationMeta()}
      <span class="tabular-nums">{Math.round(progress.interpolatingAvgProgress * 100)}%</span>
      {#if progress.interpolationEtaLabel && !progress.isDownloadingInterpolationModel}
        <span class="text-muted-foreground tabular-nums">{progress.interpolationEtaLabel}</span>
      {/if}
      {@render cancelButton(handleCancelAllInterpolation, t('media.library.cancelAll'))}
    {/snippet}
    <BackgroundTaskProgress
      icon={interpolationIcon}
      label={progress.isDownloadingInterpolationModel
        ? t('media.library.downloadingInterpolationModel')
        : t('media.library.interpolatingFrames', { count: progress.interpolatingCount })}
      progressAriaLabel={t('media.library.interpolationProgress')}
      progressPercent={progress.interpolatingAvgProgress * 100}
      detailsToggleAriaLabel={t('media.library.perItemProgress')}
      details={progress.interpolationItemRows.length > 1 ? interpolationDetails : undefined}
      meta={interpolationMeta}
      fillClass="bg-sky-500"
    />
  {/if}

  {#if progress.upscalingCount > 0}
    {#snippet upscaleIcon()}
      <Loader2 class="w-3.5 h-3.5 text-violet-500 animate-spin flex-shrink-0" />
    {/snippet}
    {#snippet upscaleDetails()}
      {@render taskDetailRows(progress.upscaleItemRows)}
    {/snippet}
    {#snippet upscaleMeta()}
      <span class="tabular-nums">{Math.round(progress.upscalingAvgProgress * 100)}%</span>
      {#if progress.upscaleEtaLabel}
        <span class="text-muted-foreground tabular-nums">{progress.upscaleEtaLabel}</span>
      {/if}
      {@render cancelButton(handleCancelAllUpscales, t('media.library.cancelAll'))}
    {/snippet}
    <BackgroundTaskProgress
      icon={upscaleIcon}
      label={t('media.library.upscalingVideo', { count: progress.upscalingCount })}
      progressAriaLabel={t('media.library.upscaleProgress')}
      progressPercent={progress.upscalingAvgProgress * 100}
      detailsToggleAriaLabel={t('media.library.perItemProgress')}
      details={progress.upscaleItemRows.length > 1 ? upscaleDetails : undefined}
      meta={upscaleMeta}
      fillClass="bg-violet-500"
    />
  {/if}

  <!-- Delete confirmation dialog -->
  <AlertDialog
    bind:open={
      () => deletion.showDeleteDialog,
      (open) => {
        deletion.setShowDeleteDialog(open)
        if (!open) {
          deletion.setPendingDeletion({ mediaIds: [], compositionIds: [] })
        }
      }
    }
  >
    <AlertDialogContent>
      {@const pending = deletion.pendingDeletion}
      {@const isMediaOnlyDeletion = deletion.isMediaOnlyDeletion}
      {@const affectedCount = deletion.affectedAssetInstanceCount}
      {@const summary = deletion.deleteSummary}
      <AlertDialogHeader>
        <AlertDialogTitle>
          {isMediaOnlyDeletion
            ? pending.mediaIds.length > 1
              ? t('media.deleteDialog.titleMultiple', {
                  count: pending.mediaIds.length,
                })
              : t('media.deleteDialog.titleSingle')
            : t('media.library.deleteAssetsTitle')}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {#snippet child({ props })}
            <div {...props} class={cn(props.class as string, 'space-y-3')}>
              <p>
                {isMediaOnlyDeletion
                  ? pending.mediaIds.length > 1
                    ? t('media.deleteDialog.bodyMultiple', {
                        count: pending.mediaIds.length,
                      })
                    : t('media.deleteDialog.bodySingle', {
                        name: mediaById.current[pending.mediaIds[0] ?? '']?.fileName ?? '',
                      })
                  : t('media.library.deleteAssetsBody', {
                      summary:
                        summary ||
                        t('media.library.selectedAssetsCount', {
                          count: deletion.deleteAssetCount,
                        }),
                    })}
              </p>
              {#if affectedCount > 0}
                <div
                  class="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md"
                >
                  <AlertTriangle class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div class="text-sm text-yellow-600 dark:text-yellow-400">
                    <p class="font-medium">
                      {isMediaOnlyDeletion
                        ? t('media.deleteDialog.timelineClipsRemoved')
                        : t('media.library.linkedInstancesTitle')}
                    </p>
                    <p class="text-xs mt-1 text-yellow-600/80 dark:text-yellow-400/80">
                      {isMediaOnlyDeletion
                        ? t('media.deleteDialog.timelineClipsDetail', {
                            count: affectedCount,
                          })
                        : t('media.library.linkedInstancesDetail', {
                            count: affectedCount,
                          })}
                    </p>
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onclick={deletion.handleConfirmDelete}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isMediaOnlyDeletion
            ? affectedCount > 0
              ? t('media.deleteDialog.confirmWithClips', {
                  count: affectedCount,
                })
              : t('common.delete')
            : affectedCount > 0
              ? t('media.library.deleteWithClips', {
                  summary:
                    summary || t('media.library.assetsCount', { count: deletion.deleteAssetCount }),
                  count: affectedCount,
                })
              : t('media.library.deleteSummary', {
                  summary:
                    summary || t('media.library.assetsCount', { count: deletion.deleteAssetCount }),
                })}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- Missing Media Dialog -->
  <MissingMediaDialog />

  <!-- Orphaned Clips Dialog -->
  <OrphanedClipsDialog />

  <!-- Unsupported Audio Codec Dialog -->
  <UnsupportedAudioCodecDialog
    open={showUnsupportedCodecDialog.current}
    files={unsupportedCodecFiles.current.map((f) => ({
      fileName: f.fileName,
      audioCodec: f.audioCodec,
    }))}
    onConfirm={() => useMediaLibraryStore.getState().resolveUnsupportedCodecDialog(true)}
    onCancel={() => useMediaLibraryStore.getState().resolveUnsupportedCodecDialog(false)}
  />
</div>
