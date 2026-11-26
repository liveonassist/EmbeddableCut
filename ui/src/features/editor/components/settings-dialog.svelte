<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Rows3 from '@lucide/svelte/icons/rows-3'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import { toast } from 'svelte-sonner'
  import type { MediaMetadata } from '@/types/storage'
  import { t } from '$lib/i18n.svelte'
  import {
    resolveCaptioningIntervalSec,
    type CaptioningIntervalUnit,
  } from '@/features/editor/deps/settings'
  import {
    useMediaLibraryStore,
    getSharedProxyKey,
    importProxyService,
    importMediaLibraryService,
    importThumbnailGenerator,
  } from '@/features/editor/deps/media-library'
  import {
    importGifFrameCache,
    importFilmstripCache,
    importWaveformCache,
  } from '@/features/editor/deps/timeline-cache'
  import { clearPreviewAudioCache } from '@/features/editor/deps/composition-runtime'
  import { createLogger } from '@/shared/logging/logger'

  const log = createLogger('SettingsDialog')

  /** Minimum content height so short sections don't collapse the dialog. */
  const MIN_SECTION_HEIGHT = 360
  /** Fraction of the viewport a section may occupy before it scrolls instead. */
  const MAX_SECTION_HEIGHT_VH = 0.7

  const SETTINGS_SECTIONS = [
    { id: 'general', labelKey: 'settings.sections.general', icon: Settings2 },
    { id: 'timeline', labelKey: 'settings.sections.timeline', icon: Rows3 },
    { id: 'ai', labelKey: 'settings.sections.ai', icon: Sparkles },
    { id: 'storage', labelKey: 'settings.sections.storage', icon: HardDrive },
  ] as const

  const CAPTIONING_INTERVAL_UNITS = ['seconds', 'frames'] as const

  const ESTIMATE_REFERENCE_DURATION_SEC = 60
  const ESTIMATE_REFERENCE_FPS = 30

  function formatCaptionEstimate(unit: CaptioningIntervalUnit, value: number): string {
    const intervalSec = resolveCaptioningIntervalSec(unit, value, ESTIMATE_REFERENCE_FPS)
    if (intervalSec <= 0) {
      return t('settings.ai.enterIntervalAboveZero')
    }
    const sceneCount = Math.max(1, Math.round(ESTIMATE_REFERENCE_DURATION_SEC / intervalSec))
    return t('settings.ai.captionEstimate', {
      sceneCount,
      scenes: t('settings.ai.scene', { count: sceneCount }),
      fps: ESTIMATE_REFERENCE_FPS,
    })
  }

  type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

  interface BatchActionResult {
    total: number
    succeeded: number
    failed: number
    failedItems: string[]
  }

  interface ActionFeedback {
    tone: 'success' | 'error'
    message: string
  }

  type BatchActionId = 'clearCache' | 'regenerateThumbnails' | 'deleteProxies'

  const BATCH_ACTION_LABEL_KEYS = {
    clearCache: 'settings.feedback.actionClearCache',
    regenerateThumbnails: 'settings.feedback.actionRegenerateThumbnails',
    deleteProxies: 'settings.feedback.actionDeleteProxies',
  } as const satisfies Record<BatchActionId, string>

  function formatFailedItems(items: string[]): string {
    if (items.length === 0) return ''
    if (items.length <= 2) return items.join(', ')
    return t('settings.feedback.moreItems', {
      items: items.slice(0, 2).join(', '),
      count: items.length - 2,
    })
  }

  function createBatchResult(total: number, failedItems: string[]): BatchActionResult {
    return {
      total,
      succeeded: Math.max(0, total - failedItems.length),
      failed: failedItems.length,
      failedItems,
    }
  }

  function getBatchOutcomeFeedback(action: BatchActionId, result: BatchActionResult): ActionFeedback {
    const actionLabel = t(BATCH_ACTION_LABEL_KEYS[action])

    if (result.total === 0) {
      return { tone: 'success', message: t('settings.feedback.noMediaNeededUpdating') }
    }

    if (result.failed === 0) {
      return {
        tone: 'success',
        message: t('settings.feedback.completedForItems', {
          count: result.succeeded,
          action: actionLabel,
        }),
      }
    }

    const failedLabel = formatFailedItems(result.failedItems)

    if (result.succeeded === 0) {
      return {
        tone: 'error',
        message: t('settings.feedback.couldntProcessItems', {
          count: result.failed,
          action: actionLabel,
          detail: failedLabel ? `: ${failedLabel}` : '.',
        }),
      }
    }

    return {
      tone: 'error',
      message: t('settings.feedback.partialOutcome', {
        action: actionLabel,
        succeeded: result.succeeded,
        total: result.total,
        failed: failedLabel,
      }),
    }
  }

  function showBatchOutcomeToast(
    titles: { success: string; partial: string; failure: string },
    result: BatchActionResult,
  ): void {
    if (result.total === 0) {
      toast.success(titles.success, { description: t('settings.feedback.noMediaNeededUpdating') })
      return
    }

    if (result.failed === 0) {
      toast.success(titles.success, {
        description: t('settings.toasts.itemsUpdated', { count: result.succeeded }),
      })
      return
    }

    const description =
      result.succeeded === 0
        ? formatFailedItems(result.failedItems)
        : t('settings.toasts.itemsUpdatedFailed', {
            count: result.succeeded,
            failed: formatFailedItems(result.failedItems),
          })

    toast.error(result.succeeded === 0 ? titles.failure : titles.partial, { description })
  }

  /**
   * Clear regenerable cache data for the current project's media only.
   * Clears filmstrips, waveforms, GIF frames, and decoded audio
   * scoped to the given media IDs.
   *
   * Does NOT clear thumbnails (not auto-regenerated) or proxies (separate action).
   */
  async function clearProjectCaches(
    mediaItems: Array<Pick<MediaMetadata, 'id' | 'fileName'>>,
  ): Promise<BatchActionResult> {
    if (mediaItems.length === 0) return createBatchResult(0, [])

    const [
      { deleteWaveform, deleteGifFrames, deleteDecodedPreviewAudio },
      { deletePreviewAudioConform },
      { gifFrameCache },
      { filmstripCache },
      { waveformCache },
    ] = await Promise.all([
      import('@/infrastructure/storage'),
      import('@/features/editor/deps/composition-runtime'),
      importGifFrameCache(),
      importFilmstripCache(),
      importWaveformCache(),
    ])

    // Clear in-memory preview audio cache (not keyed per-media, so clear all)
    clearPreviewAudioCache()

    const failedItems: string[] = []

    await Promise.all(
      mediaItems.map(async ({ id, fileName }) => {
        const results = await Promise.allSettled([
          deleteWaveform(id),
          deleteGifFrames(id),
          deleteDecodedPreviewAudio(id),
          deletePreviewAudioConform(id, { clearMetadata: true }),
          gifFrameCache.clearMedia(id),
          filmstripCache.clearMedia(id),
          waveformCache.clearMedia(id),
        ])

        const failures = results.filter((result) => result.status === 'rejected')
        if (failures.length > 0) {
          log.warn('Failed to fully clear project cache for media item', {
            mediaId: id,
            fileName,
            failures: failures.map((result) => String(result.reason)),
          })
          failedItems.push(fileName)
        }
      }),
    )

    const result = createBatchResult(mediaItems.length, failedItems)
    log.info(`Cleared caches for ${result.succeeded}/${result.total} media items`)
    return result
  }

  /** Delete all proxy videos for the given media items and clear their store status. */
  async function clearProjectProxies(mediaItems: MediaMetadata[]): Promise<BatchActionResult> {
    if (mediaItems.length === 0) return createBatchResult(0, [])

    const { proxyService } = await importProxyService()
    const failedItems: string[] = []

    await Promise.all(
      mediaItems.map(async (media) => {
        try {
          await proxyService.deleteProxy(media.id, getSharedProxyKey(media))
          useMediaLibraryStore.getState().clearProxyStatus(media.id)
          proxyService.clearProxyKey(media.id)
        } catch (error) {
          log.warn('Failed to clear proxy for media item', {
            mediaId: media.id,
            fileName: media.fileName,
            error,
          })
          failedItems.push(media.fileName)
        }
      }),
    )

    const result = createBatchResult(mediaItems.length, failedItems)
    log.info(`Cleared proxies for ${result.succeeded}/${result.total} media items`)
    return result
  }

  /**
   * Regenerate thumbnails for all media in the current project.
   * Fetches each media file, generates a new thumbnail, and saves it to workspace storage.
   */
  async function regenerateProjectThumbnails(
    mediaItems: Array<{ id: string; fileName: string; mimeType: string }>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchActionResult> {
    if (mediaItems.length === 0) return createBatchResult(0, [])

    const [{ mediaLibraryService }, { generateThumbnail }, { saveThumbnail, updateMedia }] =
      await Promise.all([
        importMediaLibraryService(),
        importThumbnailGenerator(),
        import('@/infrastructure/storage'),
      ])

    let succeeded = 0
    const failedItems: string[] = []

    for (const media of mediaItems) {
      try {
        const blob = await mediaLibraryService.getMediaFile(media.id)
        if (!blob) continue

        // generateThumbnail expects a File (needs .name for extension-based mime detection)
        const file = new File([blob], media.fileName, { type: media.mimeType })
        const thumbnailBlob = await generateThumbnail(file)

        const thumbnailId = crypto.randomUUID()
        await saveThumbnail({
          id: thumbnailId,
          mediaId: media.id,
          blob: thumbnailBlob,
          timestamp: 1,
          width: 320,
          height: 180,
        })

        // Update the media record so the new thumbnailId propagates to the store
        await updateMedia(media.id, { thumbnailId })

        // Clear the in-memory blob URL cache so UI picks up the new thumbnail
        mediaLibraryService.clearThumbnailCache(media.id)
        succeeded++
      } catch (err) {
        log.warn(`Failed to regenerate thumbnail for ${media.fileName}:`, err)
        failedItems.push(media.fileName)
      }
      onProgress?.(succeeded + failedItems.length, mediaItems.length)
    }

    // Reload store so MediaCards see the updated thumbnailId and re-fetch
    await useMediaLibraryStore.getState().loadMediaItems()

    const result = createBatchResult(mediaItems.length, failedItems)
    log.info(`Regenerated ${result.succeeded}/${result.total} thumbnails`)
    return result
  }
</script>

<script lang="ts">
  import { fade } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import Check from '@lucide/svelte/icons/check'
  import ImagePlus from '@lucide/svelte/icons/image-plus'
  import Film from '@lucide/svelte/icons/film'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Play from '@lucide/svelte/icons/play'
  import { select } from '$lib/store.svelte'
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import { Separator } from '@/components/ui/separator'
  import { Switch } from '@/components/ui/switch'
  import { Slider } from '@/components/ui/slider'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { Input } from '@/components/ui/input'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import {
    LocalInferenceUnloadControl,
    LocalModelCacheControl,
    useSettingsStore,
    CAPTIONING_INTERVAL_BOUNDS,
    DEFAULT_CAPTIONING_INTERVAL_SECONDS,
  } from '@/features/editor/deps/settings'
  import { CAPTION_STYLE_PRESETS } from '@/shared/typography/caption-style-presets'
  import { useUiSoundStore } from '@/shared/state/ui-sound-store'
  import { emitUiSound, previewUiSound } from '@/shared/ui/ui-sound'
  import { VOICE_OPTIONS, type VoiceName } from '@/infrastructure/audio/ui-sound'
  import { SettingGate } from '@/features/editor/deps/settings'
  import { cn } from '@/shared/ui/cn'
  import { useNaturalHeight } from '@/shared/ui/use-natural-height.svelte'

  interface SettingsDialogProps {
    open: boolean
    onOpenChange?: (open: boolean) => void
  }

  let { open = $bindable(false), onOpenChange }: SettingsDialogProps = $props()

  const snapEnabled = select(useSettingsStore, (s) => s.snapEnabled)
  const showWaveforms = select(useSettingsStore, (s) => s.showWaveforms)
  const showFilmstrips = select(useSettingsStore, (s) => s.showFilmstrips)
  const enableFilmstripExtraction = select(useSettingsStore, (s) => s.enableFilmstripExtraction)
  const autoSaveInterval = select(useSettingsStore, (s) => s.autoSaveInterval)
  const maxUndoHistory = select(useSettingsStore, (s) => s.maxUndoHistory)
  const captioningIntervalUnit = select(useSettingsStore, (s) => s.captioningIntervalUnit)
  const captioningIntervalValue = select(useSettingsStore, (s) => s.captioningIntervalValue)
  const defaultCaptionStylePresetId = select(useSettingsStore, (s) => s.defaultCaptionStylePresetId)
  const uiSoundsEnabled = select(useUiSoundStore, (s) => s.enabled)
  const uiSoundVolume = select(useUiSoundStore, (s) => s.volume)
  const uiSoundVoice = select(useUiSoundStore, (s) => s.voice)

  const setSetting: ReturnType<typeof useSettingsStore.getState>['setSetting'] = (key, value) =>
    useSettingsStore.getState().setSetting(key, value)

  const intervalBounds = $derived(CAPTIONING_INTERVAL_BOUNDS[captioningIntervalUnit.current])
  const intervalInputStep = $derived(captioningIntervalUnit.current === 'seconds' ? 0.5 : 1)
  const intervalUnitLabel = $derived(
    captioningIntervalUnit.current === 'seconds'
      ? t('settings.ai.unitSec')
      : t('settings.ai.unitFrames'),
  )

  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)
  const proxyStatus = select(useMediaLibraryStore, (s) => s.proxyStatus)

  let activeSection = $state<SettingsSectionId>('general')

  // Animate the content area's height as sections change (width is fixed, so a
  // pure vertical morph). Measure the active section's natural height and ease
  // the wrapper to it, clamped to [min, 70vh]; taller sections cap and scroll.
  const reduceMotion = $derived(prefersReducedMotion.current)
  let content: HTMLDivElement | null = $state(null)
  const naturalHeight = useNaturalHeight(
    () => content,
    () => open,
  )
  let heightReady = $state(false)
  // First measured height applies instantly; later section switches animate.
  $effect(() => {
    if (naturalHeight.current > 0 && !heightReady) heightReady = true
  })
  // Reset the instant-apply gate on close so reopening doesn't animate from a
  // stale height.
  $effect(() => {
    if (!open) heightReady = false
  })
  const maxSectionHeight = $derived(
    Math.round((typeof window === 'undefined' ? 900 : window.innerHeight) * MAX_SECTION_HEIGHT_VH),
  )
  const targetSectionHeight = $derived(
    naturalHeight.current > 0
      ? Math.min(Math.max(naturalHeight.current, MIN_SECTION_HEIGHT), maxSectionHeight)
      : undefined,
  )

  let clearState = $state<'idle' | 'clearing' | 'done' | 'partial'>('idle')
  let showClearConfirm = $state(false)
  let regenState = $state<'idle' | 'working' | 'done' | 'partial'>('idle')
  let regenProgress = $state('')
  let proxyState = $state<'idle' | 'clearing' | 'done' | 'partial'>('idle')
  let proxyGenerateState = $state<'idle' | 'queueing' | 'done'>('idle')
  let clearFeedback = $state<ActionFeedback | null>(null)
  let regenFeedback = $state<ActionFeedback | null>(null)
  let proxyFeedback = $state<ActionFeedback | null>(null)

  async function handleClearCache() {
    clearState = 'clearing'
    try {
      const items = mediaItems.current.map((m) => ({ id: m.id, fileName: m.fileName }))
      const result = await clearProjectCaches(items)
      clearFeedback = getBatchOutcomeFeedback('clearCache', result)
      clearState = result.failed === 0 ? 'done' : 'partial'
      showBatchOutcomeToast(
        {
          success: t('settings.toasts.projectCacheCleared'),
          partial: t('settings.toasts.projectCachePartiallyCleared'),
          failure: t('settings.toasts.projectCacheNotCleared'),
        },
        result,
      )
      setTimeout(() => (clearState = 'idle'), 2000)
    } catch (err) {
      log.error('Failed to clear caches', err)
      clearFeedback = { tone: 'error', message: t('settings.feedback.couldntClearCache') }
      toast.error(t('settings.toasts.failedToClearCache'))
      clearState = 'idle'
    }
  }

  async function handleRegenThumbnails() {
    const items = mediaItems.current
    regenState = 'working'
    regenProgress = '0/' + items.length
    try {
      const result = await regenerateProjectThumbnails(
        items.map((m) => ({ id: m.id, fileName: m.fileName, mimeType: m.mimeType })),
        (done, total) => {
          regenProgress = `${done}/${total}`
        },
      )
      regenFeedback = getBatchOutcomeFeedback('regenerateThumbnails', result)
      regenState = result.failed === 0 ? 'done' : 'partial'
      showBatchOutcomeToast(
        {
          success: t('settings.toasts.thumbnailsRegenerated'),
          partial: t('settings.toasts.thumbnailsPartiallyRegenerated'),
          failure: t('settings.toasts.thumbnailsNotRegenerated'),
        },
        result,
      )
      setTimeout(() => {
        regenState = 'idle'
        regenProgress = ''
      }, 2000)
    } catch (err) {
      log.error('Failed to regenerate thumbnails', err)
      regenFeedback = { tone: 'error', message: t('settings.feedback.couldntRegenerateThumbnails') }
      toast.error(t('settings.toasts.failedToRegenerateThumbnails'))
      regenState = 'idle'
      regenProgress = ''
    }
  }

  async function handleClearProxies() {
    proxyState = 'clearing'
    try {
      const result = await clearProjectProxies(mediaItems.current)
      proxyFeedback = getBatchOutcomeFeedback('deleteProxies', result)
      proxyState = result.failed === 0 ? 'done' : 'partial'
      showBatchOutcomeToast(
        {
          success: t('settings.toasts.proxiesDeleted'),
          partial: t('settings.toasts.proxiesPartiallyDeleted'),
          failure: t('settings.toasts.proxiesNotDeleted'),
        },
        result,
      )
      setTimeout(() => (proxyState = 'idle'), 2000)
    } catch (err) {
      log.error('Failed to clear proxies', err)
      proxyFeedback = { tone: 'error', message: t('settings.feedback.couldntDeleteProxies') }
      toast.error(t('settings.toasts.failedToDeleteProxies'))
      proxyState = 'idle'
    }
  }

  async function handleGenerateMissingProxies() {
    proxyGenerateState = 'queueing'

    try {
      const [{ proxyService }, { mediaLibraryService }] = await Promise.all([
        importProxyService(),
        importMediaLibraryService(),
      ])

      const queuedItems = mediaItems.current.filter((media) => {
        if (!proxyService.canGenerateProxy(media.mimeType)) {
          return false
        }

        const sharedProxyKey = getSharedProxyKey(media)
        if (proxyService.hasProxy(media.id, sharedProxyKey)) {
          return false
        }

        const status = useMediaLibraryStore.getState().proxyStatus.get(media.id)
        return status !== 'ready' && status !== 'generating'
      })

      queuedItems.forEach((media) => {
        const sharedProxyKey = getSharedProxyKey(media)
        proxyService.setProxyKey(media.id, sharedProxyKey)
        proxyService.generateProxy(
          media.id,
          media.storageType === 'opfs' && media.opfsPath
            ? { kind: 'opfs', path: media.opfsPath, mimeType: media.mimeType }
            : () => mediaLibraryService.getMediaFile(media.id),
          media.width,
          media.height,
          sharedProxyKey,
          { priority: 'background' },
        )
      })

      proxyGenerateState = 'done'
      setTimeout(() => (proxyGenerateState = 'idle'), 2000)
    } catch (err) {
      log.error('Failed to queue missing proxies', err)
      proxyGenerateState = 'idle'
    }
  }

  const missingProjectProxyCount = $derived(
    mediaItems.current.filter(
      (media) =>
        media.mimeType.startsWith('video/') &&
        proxyStatus.current.get(media.id) !== 'ready' &&
        proxyStatus.current.get(media.id) !== 'generating',
    ).length,
  )
</script>

{#snippet feedbackLine(feedback: ActionFeedback | null)}
  {#if feedback}
    <p class={cn('mt-1 text-xs', feedback.tone === 'error' ? 'text-amber-400' : 'text-muted-foreground')}>
      {feedback.message}
    </p>
  {/if}
{/snippet}

<Dialog
  bind:open={
    () => open,
    (next) => {
      open = next
      onOpenChange?.(next)
    }
  }
>
  <DialogContent
    class="max-w-2xl gap-0 overflow-hidden p-0 sm:top-16 sm:max-h-[calc(100vh-4rem)] sm:translate-y-0 sm:origin-top"
  >
    <DialogHeader class="flex flex-row items-center justify-between border-b px-6 py-4 pr-14">
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => useSettingsStore.getState().resetToDefaults()}
        class="h-8 shrink-0 gap-1.5"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        {t('common.reset')}
      </Button>
    </DialogHeader>
    <div class="flex min-h-0">
      <!-- Sidebar -->
      <nav class="flex w-44 shrink-0 flex-col gap-0.5 border-r border-white/6 p-2">
        {#each SETTINGS_SECTIONS as section (section.id)}
          {@const Icon = section.icon}
          <button
            type="button"
            onclick={() => (activeSection = section.id)}
            class={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ease-out motion-reduce:transition-none',
              activeSection === section.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80',
            )}
          >
            <Icon class="h-3.5 w-3.5 shrink-0" />
            {t(section.labelKey)}
          </button>
        {/each}
      </nav>

      <!-- Content — height animates between sections (fixed width, so a clean
           vertical morph); tall sections cap at 70vh and scroll. -->
      <div
        class="min-h-0 flex-1 overflow-hidden"
        style:height={targetSectionHeight !== undefined ? `${targetSectionHeight}px` : 'auto'}
        style:transition={reduceMotion || !heightReady
          ? 'none'
          : 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)'}
      >
        <ScrollArea class="h-full">
          <div bind:this={content} class="relative space-y-3 px-6 py-5 pr-7">
            {#key activeSection}
              <div in:fade={{ duration: reduceMotion ? 0 : 120 }}>
                {#if activeSection === 'general'}
                  <div class="space-y-3">
                    <SettingGate keys={['autoSaveInterval']}>
                    <div class="flex items-center justify-between">
                      <Label class="text-sm">{t('settings.general.autoSave')}</Label>
                      <Switch
                        checked={autoSaveInterval.current > 0}
                        onCheckedChange={(v) => setSetting('autoSaveInterval', v ? 5 : 0)}
                      />
                    </div>
                    {#if autoSaveInterval.current > 0}
                      <div class="flex items-center justify-between">
                        <Label class="text-sm text-muted-foreground">
                          {t('settings.general.interval')}
                        </Label>
                        <div class="w-32 flex items-center gap-2">
                          <Slider
                            value={[autoSaveInterval.current]}
                            onValueChange={([v]) => setSetting('autoSaveInterval', v || 5)}
                            min={5}
                            max={30}
                            step={5}
                          />
                          <span class="text-xs text-muted-foreground w-6">
                            {t('settings.general.intervalMinutes', { count: autoSaveInterval.current })}
                          </span>
                        </div>
                      </div>
                    {/if}
                    </SettingGate>
                    <SettingGate keys={['maxUndoHistory']}>
                    <div class="flex items-center justify-between">
                      <Label class="text-sm">
                        {t('settings.general.undoHistoryDepth')}
                      </Label>
                      <div class="w-32 flex items-center gap-2">
                        <Slider
                          value={[maxUndoHistory.current]}
                          onValueChange={([v]) => setSetting('maxUndoHistory', v || 10)}
                          min={10}
                          max={200}
                          step={10}
                        />
                        <span class="text-xs text-muted-foreground w-6">
                          {maxUndoHistory.current}
                        </span>
                      </div>
                    </div>
                    </SettingGate>
                    <div class="flex items-center justify-between">
                      <Label class="text-sm">{t('settings.general.uiSounds')}</Label>
                      <Switch
                        checked={uiSoundsEnabled.current}
                        onCheckedChange={(v) => {
                          useUiSoundStore.getState().setEnabled(v)
                          // Give immediate audible confirmation when turning sounds on.
                          if (v) emitUiSound('confirm')
                        }}
                      />
                    </div>
                    {#if uiSoundsEnabled.current}
                      <div class="flex items-center justify-between">
                        <Label class="text-sm text-muted-foreground">
                          {t('settings.general.uiSoundVolume')}
                        </Label>
                        <div class="w-32 flex items-center gap-2">
                          <Slider
                            value={[uiSoundVolume.current]}
                            onValueChange={([v]) => {
                              useUiSoundStore.getState().setVolume(v ?? 0.6)
                              // Preview the new level as the user drags.
                              emitUiSound('select')
                            }}
                            min={0}
                            max={1}
                            step={0.05}
                          />
                          <span class="text-xs text-muted-foreground w-8">
                            {Math.round(uiSoundVolume.current * 100)}%
                          </span>
                        </div>
                      </div>
                    {/if}
                    {#if uiSoundsEnabled.current}
                      <div class="flex items-center justify-between">
                        <Label class="text-sm text-muted-foreground">
                          {t('settings.general.uiSoundVoice')}
                        </Label>
                        <div class="flex items-center gap-1.5">
                          <Select
                            value={uiSoundVoice.current}
                            onValueChange={(value) => {
                              useUiSoundStore.getState().setVoice(value as VoiceName)
                              // Preview the newly selected voice.
                              emitUiSound('confirm')
                            }}
                          >
                            <SelectTrigger class="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {#each VOICE_OPTIONS as option (option.value)}
                                <!-- FreeCut's raw Radix item: no check indicator, the selected voice in the accent. -->
                                <SelectItem value={option.value} class="pr-2 [&>span:first-child]:hidden">
                                  <span
                                    class={option.value === uiSoundVoice.current
                                      ? 'font-medium text-primary'
                                      : undefined}
                                  >
                                    {option.label}
                                  </span>
                                </SelectItem>
                              {/each}
                            </SelectContent>
                          </Select>
                          <!-- Audition the selected voice — a real, keyboard-reachable
                               button beside the Select rather than a control nested
                               inside each (non-focusable) option row. -->
                          <button
                            type="button"
                            aria-label={t('settings.general.uiSoundPreview')}
                            onclick={() => previewUiSound(uiSoundVoice.current)}
                            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                          >
                            <Play class="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                {#if activeSection === 'ai'}
                  <div class="space-y-3">
                    <SettingGate keys={['captioningIntervalUnit', 'captioningIntervalValue']}>
                    <div class="space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="space-y-0.5">
                          <Label class="text-sm">
                            {t('settings.ai.captionSampleInterval')}
                          </Label>
                          <p class="text-xs text-muted-foreground">
                            {t('settings.ai.captionSampleIntervalDescription')}
                          </p>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="flex items-center rounded-md border border-border bg-secondary p-0.5">
                          {#each CAPTIONING_INTERVAL_UNITS as unit (unit)}
                            <button
                              type="button"
                              onclick={() => setSetting('captioningIntervalUnit', unit)}
                              class={cn(
                                'rounded px-2.5 py-1 text-xs transition-colors',
                                captioningIntervalUnit.current === unit
                                  ? 'bg-primary/15 text-primary'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {unit === 'seconds' ? t('settings.ai.seconds') : t('settings.ai.frames')}
                            </button>
                          {/each}
                        </div>
                        <Input
                          type="number"
                          inputmode="decimal"
                          class="h-8 w-24"
                          min={intervalBounds.min}
                          max={intervalBounds.max}
                          step={intervalInputStep}
                          value={captioningIntervalValue.current}
                          oninput={(event) => {
                            const parsed = Number(event.currentTarget.value)
                            if (Number.isFinite(parsed)) {
                              setSetting('captioningIntervalValue', parsed)
                            }
                          }}
                        />
                        <span class="text-xs text-muted-foreground">
                          {intervalUnitLabel}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-7 px-2 text-xs text-muted-foreground"
                          onclick={() => {
                            setSetting('captioningIntervalUnit', 'seconds')
                            setSetting('captioningIntervalValue', DEFAULT_CAPTIONING_INTERVAL_SECONDS)
                          }}
                          disabled={captioningIntervalUnit.current === 'seconds' &&
                            captioningIntervalValue.current === DEFAULT_CAPTIONING_INTERVAL_SECONDS}
                        >
                          {t('common.reset')}
                        </Button>
                      </div>
                      <p class="text-xs text-muted-foreground">
                        {t('settings.ai.captionIntervalHint', {
                          estimate: formatCaptionEstimate(
                            captioningIntervalUnit.current,
                            captioningIntervalValue.current,
                          ),
                        })}
                      </p>
                    </div>
                    </SettingGate>

                    <SettingGate keys={['defaultCaptionStylePresetId']}>
                    <div class="space-y-2">
                      <div class="space-y-0.5">
                        <Label class="text-sm">
                          {t('settings.ai.defaultCaptionStyle')}
                        </Label>
                        <p class="text-xs text-muted-foreground">
                          {t('settings.ai.defaultCaptionStyleDescription')}
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        {#each CAPTION_STYLE_PRESETS as preset (preset.id)}
                          <button
                            type="button"
                            title={t(preset.hintKey)}
                            onclick={() => setSetting('defaultCaptionStylePresetId', preset.id)}
                            class={cn(
                              'rounded-md border px-2.5 py-1 text-xs transition-colors',
                              defaultCaptionStylePresetId.current === preset.id
                                ? 'border-primary bg-primary/15 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {preset.label}
                          </button>
                        {/each}
                      </div>
                    </div>
                    </SettingGate>
                  </div>
                {/if}

                {#if activeSection === 'timeline'}
                  <div class="space-y-3">
                    <SettingGate keys={['snapEnabled']}>
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">
                          {t('settings.timeline.snapByDefault')}
                        </Label>
                        <p class="text-xs text-muted-foreground">
                          {t('settings.timeline.snapByDefaultDescription')}
                        </p>
                      </div>
                      <Switch
                        checked={snapEnabled.current}
                        onCheckedChange={(v) => setSetting('snapEnabled', v)}
                      />
                    </div>
                    </SettingGate>
                    <SettingGate keys={['showWaveforms']}>
                    <div class="flex items-center justify-between">
                      <Label class="text-sm">{t('settings.timeline.showWaveforms')}</Label>
                      <Switch
                        checked={showWaveforms.current}
                        onCheckedChange={(v) => setSetting('showWaveforms', v)}
                      />
                    </div>
                    </SettingGate>
                    <SettingGate keys={['showFilmstrips']}>
                    <div class="flex items-center justify-between">
                      <Label class="text-sm">{t('settings.timeline.showFilmstrips')}</Label>
                      <Switch
                        checked={showFilmstrips.current}
                        onCheckedChange={(v) => setSetting('showFilmstrips', v)}
                      />
                    </div>
                    </SettingGate>
                    <SettingGate keys={['enableFilmstripExtraction']}>
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">
                          {t('settings.timeline.enableFilmstripExtraction')}
                        </Label>
                        <p class="text-xs text-muted-foreground">
                          {t('settings.timeline.enableFilmstripExtractionDescription')}
                        </p>
                      </div>
                      <Switch
                        checked={enableFilmstripExtraction.current}
                        onCheckedChange={(v) => setSetting('enableFilmstripExtraction', v)}
                      />
                    </div>
                    </SettingGate>
                  </div>
                {/if}

                {#if activeSection === 'storage'}
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">
                          {t('settings.storage.generateMissingProxies')}
                        </Label>
                        <p class="text-xs text-muted-foreground mt-0.5">
                          {t('settings.storage.generateMissingProxiesDescription')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 w-28 gap-1.5"
                        onclick={handleGenerateMissingProxies}
                        disabled={proxyGenerateState !== 'idle' || missingProjectProxyCount === 0}
                      >
                        {#if proxyGenerateState === 'queueing'}
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        {:else if proxyGenerateState === 'done'}
                          <Check class="w-3.5 h-3.5" />
                        {:else}
                          <Film class="w-3.5 h-3.5" />
                        {/if}
                        {proxyGenerateState === 'queueing'
                          ? t('common.queueing')
                          : proxyGenerateState === 'done'
                            ? t('settings.storage.queued')
                            : missingProjectProxyCount > 0
                              ? t('settings.storage.generateWithCount', {
                                  count: missingProjectProxyCount,
                                })
                              : t('settings.storage.upToDate')}
                      </Button>
                    </div>
                    <Separator class="bg-white/8" />
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">
                          {t('settings.storage.clearProjectCache')}
                        </Label>
                        <p class="text-xs text-muted-foreground mt-0.5">
                          {t('settings.storage.clearProjectCacheDescription')}
                        </p>
                        {@render feedbackLine(clearFeedback)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 w-28 gap-1.5"
                        onclick={() => (showClearConfirm = true)}
                        disabled={clearState !== 'idle'}
                      >
                        {#if clearState === 'clearing'}
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        {:else if clearState === 'done'}
                          <Check class="w-3.5 h-3.5" />
                        {:else if clearState === 'partial'}
                          <TriangleAlert class="w-3.5 h-3.5" />
                        {:else}
                          <Trash2 class="w-3.5 h-3.5" />
                        {/if}
                        {clearState === 'clearing'
                          ? t('common.clearing')
                          : clearState === 'done'
                            ? t('settings.storage.cleared')
                            : clearState === 'partial'
                              ? t('common.partial')
                              : t('settings.storage.clear')}
                      </Button>
                    </div>
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">
                          {t('settings.storage.regenerateThumbnails')}
                        </Label>
                        <p class="text-xs text-muted-foreground mt-0.5">
                          {t('settings.storage.regenerateThumbnailsDescription')}
                        </p>
                        {@render feedbackLine(regenFeedback)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 w-28 gap-1.5"
                        onclick={handleRegenThumbnails}
                        disabled={regenState !== 'idle'}
                      >
                        {#if regenState === 'working'}
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        {:else if regenState === 'done'}
                          <Check class="w-3.5 h-3.5" />
                        {:else if regenState === 'partial'}
                          <TriangleAlert class="w-3.5 h-3.5" />
                        {:else}
                          <ImagePlus class="w-3.5 h-3.5" />
                        {/if}
                        {regenState === 'working'
                          ? regenProgress
                          : regenState === 'done'
                            ? t('common.done')
                            : regenState === 'partial'
                              ? t('common.partial')
                              : t('settings.storage.regenerate')}
                      </Button>
                    </div>
                    <div class="flex items-center justify-between">
                      <div>
                        <Label class="text-sm">{t('settings.storage.deleteProxies')}</Label>
                        <p class="text-xs text-muted-foreground mt-0.5">
                          {t('settings.storage.deleteProxiesDescription')}
                        </p>
                        {@render feedbackLine(proxyFeedback)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 w-28 gap-1.5"
                        onclick={handleClearProxies}
                        disabled={proxyState !== 'idle'}
                      >
                        {#if proxyState === 'clearing'}
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        {:else if proxyState === 'done'}
                          <Check class="w-3.5 h-3.5" />
                        {:else if proxyState === 'partial'}
                          <TriangleAlert class="w-3.5 h-3.5" />
                        {:else}
                          <Film class="w-3.5 h-3.5" />
                        {/if}
                        {proxyState === 'clearing'
                          ? t('common.deleting')
                          : proxyState === 'done'
                            ? t('settings.storage.deleted')
                            : proxyState === 'partial'
                              ? t('common.partial')
                              : t('common.delete')}
                      </Button>
                    </div>
                    <Separator class="bg-white/8" />
                    <div class="space-y-3">
                      <div class="space-y-1">
                        <Label class="text-sm">{t('settings.storage.localAi')}</Label>
                        <p class="text-xs text-muted-foreground">
                          {t('settings.storage.localAiDescription')}
                        </p>
                      </div>
                      <LocalInferenceUnloadControl />
                      <LocalModelCacheControl />
                    </div>
                  </div>
                {/if}
              </div>
            {/key}
          </div>
        </ScrollArea>
      </div>
    </div>
  </DialogContent>

  <AlertDialog bind:open={showClearConfirm}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('settings.storage.clearCacheConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('settings.storage.clearCacheConfirmDescription', { count: mediaItems.current.length })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onclick={() => {
            void handleClearCache()
          }}
        >
          {t('settings.storage.clearCache')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</Dialog>
