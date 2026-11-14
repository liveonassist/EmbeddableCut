<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('SilenceRemovalDialog')
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { FloatingPanel } from '@/components/ui/floating-panel'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Switch } from '@/components/ui/switch'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { removeSilenceFromItems } from '@/features/timeline/stores/timeline-actions'
  import { useSilenceRemovalDialogStore } from '@/features/timeline/stores/silence-removal-dialog-store'
  import {
    analyzeSilenceForItems,
    applySilencePreviewOverlays,
    clearSilencePreviewOverlays,
    type SilenceRemovalSettings,
  } from '@/features/timeline/utils/silence-removal-preview'
  import type { RemoveSilenceResult } from '@/features/timeline/stores/actions/item-edit-actions'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { sourceSecondsToTimelineFrame } from '@/features/timeline/utils/media-item-frames'
  import {
    getItemSourceSpanSeconds,
    getMediaSourceFps,
  } from '@/features/timeline/utils/media-item-frames'
  import { ClipWaveform } from '../clip-waveform'
  import type { TimelineItem } from '@/types/timeline'
  import SettingControl from './setting-control.svelte'
  import {
    SILENCE_REMOVAL_PANEL_DEFAULT_BOUNDS,
    SILENCE_REMOVAL_PANEL_STORAGE_KEY,
    areSettingsEqual,
    formatSeconds,
    type AuditionPlan,
    type ReviewRange,
    type ReviewWaveformModel,
  } from './silence-removal-dialog-model'

  const isOpen = select(useSilenceRemovalDialogStore, (state) => state.isOpen)
  const itemIds = select(useSilenceRemovalDialogStore, (state) => state.itemIds)
  const settings = select(useSilenceRemovalDialogStore, (state) => state.settings)
  const rangesByMediaId = select(useSilenceRemovalDialogStore, (state) => state.rangesByMediaId)
  const summary = select(useSilenceRemovalDialogStore, (state) => state.summary)
  const failedMediaCount = select(useSilenceRemovalDialogStore, (state) => state.failedMediaCount)
  const analyzedMediaCount = select(
    useSilenceRemovalDialogStore,
    (state) => state.analyzedMediaCount,
  )
  const updatePreview = select(useSilenceRemovalDialogStore, (state) => state.updatePreview)
  const close = select(useSilenceRemovalDialogStore, (state) => state.close)
  let draft = $state.raw<SilenceRemovalSettings>(useSilenceRemovalDialogStore.getState().settings)
  let isAnalyzing = $state(false)
  let analysisProgress = $state(0)
  let waveformZoom = $state(1)
  let analysisAbort: AbortController | null = null
  let auditionPlan: AuditionPlan | null = null
  let analyzedCurrentOpen = false
  const itemById = select(useItemsStore, (state) => state.itemById)
  const timelineFps = select(useTimelineSettingsStore, (state) => state.fps)

  const reviewRanges = $derived.by<ReviewRange[]>(() => {
    const items = itemById.current
    const labelByMediaId = new Map<string, string>()
    for (const itemId of itemIds.current) {
      const item = items[itemId]
      if ((item?.type === 'audio' || item?.type === 'video') && item.mediaId) {
        labelByMediaId.set(item.mediaId, item.label)
      }
    }
    return Object.entries(rangesByMediaId.current).flatMap(([mediaId, ranges]) =>
      ranges.map((range, index) => ({
        ...range,
        index,
        key: `${mediaId}:${index}:${range.start}:${range.end}`,
        label: labelByMediaId.get(mediaId) ?? mediaId,
        mediaId,
      })),
    )
  })

  const reviewWaveform = $derived.by<ReviewWaveformModel | null>(() => {
    const items = itemById.current
    const fps = timelineFps.current
    const item = itemIds.current
      .map((itemId) => items[itemId])
      .find(
        (
          candidate,
        ): candidate is TimelineItem & {
          mediaId: string
          type: 'audio' | 'video'
        } => (candidate?.type === 'audio' || candidate?.type === 'video') && !!candidate.mediaId,
      )
    if (!item) return null
    const span = getItemSourceSpanSeconds(item, fps)
    if (!span) return null
    const sourceFps = getMediaSourceFps(item, fps)
    const sourceDuration = Math.max(
      span.end,
      item.sourceDuration !== undefined ? item.sourceDuration / sourceFps : span.end,
    )
    const itemRanges = rangesByMediaId.current[item.mediaId] ?? []
    const ranges = itemRanges.flatMap((range, index) => {
      const mappedStart = sourceSecondsToTimelineFrame(item, range.start, fps)
      const mappedEnd = sourceSecondsToTimelineFrame(item, range.end, fps)
      const startRatio = Math.max(
        0,
        Math.min(1, (Math.min(mappedStart, mappedEnd) - item.from) / item.durationInFrames),
      )
      const endRatio = Math.max(
        0,
        Math.min(1, (Math.max(mappedStart, mappedEnd) - item.from) / item.durationInFrames),
      )
      return endRatio > startRatio
        ? [{ startRatio, endRatio, key: `${item.mediaId}:${index}:${range.start}:${range.end}` }]
        : []
    })
    return { item, ranges, sourceDuration, sourceEnd: span.end, sourceStart: span.start }
  })

  $effect(() => {
    const open = isOpen.current
    const currentSettings = settings.current
    if (open) {
      untrack(() => {
        draft = currentSettings
        waveformZoom = 1
      })
    }
  })

  function handleClose() {
    analysisAbort?.abort()
    analysisAbort = null
    if (auditionPlan) {
      usePlaybackStore.getState().pause()
      auditionPlan = null
    }
    clearSilencePreviewOverlays(itemIds.current)
    close.current()
  }

  $effect(() =>
    usePlaybackStore.subscribe((state, previous) => {
      const plan = auditionPlan
      if (!plan || state.currentFrame === previous.currentFrame) return
      if (
        plan.skipStartFrame !== undefined &&
        plan.skipEndFrame !== undefined &&
        state.currentFrame >= plan.skipStartFrame &&
        state.currentFrame < plan.skipEndFrame
      ) {
        state.setCurrentFrame(plan.skipEndFrame)
        return
      }
      if (state.currentFrame >= plan.stopFrame) {
        state.pause()
        auditionPlan = null
      }
    }),
  )

  const handlePanelClose = () => handleClose()

  $effect(() => {
    if (!isOpen.current) return

    return untrack(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        // Capture-phase + consume so the timeline's global keydown doesn't also
        // react to Escape (e.g. clearing selection) while we're closing.
        event.preventDefault()
        event.stopPropagation()
        handleClose()
      }

      window.addEventListener('keydown', handleKeyDown, { capture: true })
      return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
    })
  })

  function runPreviewAnalysis(nextSettings: SilenceRemovalSettings) {
    const currentItemIds = itemIds.current
    const run = async () => {
      const abortController = new AbortController()
      analysisAbort?.abort()
      analysisAbort = abortController
      isAnalyzing = true
      analysisProgress = 0
      try {
        const analysis = await analyzeSilenceForItems(currentItemIds, nextSettings, {
          signal: abortController.signal,
          onProgress: (progress) => {
            analysisProgress = progress
          },
        })
        if (abortController.signal.aborted) return
        const nextRangesByMediaId = analysis.rangesByMediaId
        const nextSummary = applySilencePreviewOverlays(currentItemIds, nextRangesByMediaId)
        updatePreview.current({
          settings: nextSettings,
          rangesByMediaId: nextRangesByMediaId,
          summary: nextSummary,
          analyzedMediaCount: analysis.analyzedMediaIds.length,
          failedMediaCount: analysis.failedMediaIds.length,
        })
        if (analysis.failedMediaIds.length > 0) {
          toast.warning(
            t('timeline.silenceRemoval.partialFailure', {
              count: analysis.failedMediaIds.length,
            }),
          )
        }
        if (nextSummary.rangeCount === 0) {
          toast.info(t('timeline.silenceRemoval.toastNoRemovable'))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        logger.warn('Silence preview failed', error)
        toast.error(
          error instanceof Error ? error.message : t('timeline.silenceRemoval.toastPreviewFailed'),
        )
      } finally {
        if (analysisAbort === abortController) {
          analysisAbort = null
          isAnalyzing = false
          analysisProgress = 0
        }
      }
    }

    void run()
  }

  function handleUpdatePreview() {
    runPreviewAnalysis(draft)
  }

  function handleModeChange(mode: SilenceRemovalSettings['mode']) {
    if (draft.mode === mode) return
    const nextDraft = { ...draft, mode }
    draft = nextDraft
    runPreviewAnalysis(nextDraft)
  }

  $effect(() => {
    const open = isOpen.current
    const currentSettings = settings.current
    untrack(() => {
      if (!open) {
        analyzedCurrentOpen = false
        return
      }
      if (analyzedCurrentOpen) return
      analyzedCurrentOpen = true
      runPreviewAnalysis(currentSettings)
    })
  })

  function handleApply() {
    if (!areSettingsEqual(draft, settings.current)) {
      toast.info(t('timeline.silenceRemoval.toastSettingsChanged'))
      return
    }

    const currentItemIds = itemIds.current
    let result: RemoveSilenceResult | null = null
    try {
      result = removeSilenceFromItems(currentItemIds, rangesByMediaId.current)
    } finally {
      clearSilencePreviewOverlays(currentItemIds)
      close.current()
    }

    if (!result || result.removedItemCount === 0) {
      toast.info(t('timeline.silenceRemoval.toastNoneInClips'))
      return
    }

    toast.success(t('timeline.silenceRemoval.toastRemoved', { count: result.removedRangeCount }))
  }

  function commitReviewedRanges(nextRangesByMediaId: typeof rangesByMediaId.current) {
    const nextSummary = applySilencePreviewOverlays(itemIds.current, nextRangesByMediaId)
    updatePreview.current({
      settings: settings.current,
      rangesByMediaId: nextRangesByMediaId,
      summary: nextSummary,
      analyzedMediaCount: analyzedMediaCount.current,
      failedMediaCount: failedMediaCount.current,
    })
  }

  function handleKeepRange(range: ReviewRange) {
    const currentRanges = rangesByMediaId.current
    const nextRanges = (currentRanges[range.mediaId] ?? []).filter(
      (_, index) => index !== range.index,
    )
    const nextRangesByMediaId = { ...currentRanges }
    if (nextRanges.length > 0) nextRangesByMediaId[range.mediaId] = nextRanges
    else delete nextRangesByMediaId[range.mediaId]
    commitReviewedRanges(nextRangesByMediaId)
  }

  function handleRangeBoundaryChange(range: ReviewRange, boundary: 'end' | 'start', value: number) {
    if (!Number.isFinite(value)) return
    const currentRanges = rangesByMediaId.current
    const mediaRanges = currentRanges[range.mediaId] ?? []
    const current = mediaRanges[range.index]
    if (!current) return
    const next =
      boundary === 'start'
        ? { ...current, start: Math.max(0, Math.min(value, current.end - 0.01)) }
        : { ...current, end: Math.max(current.start + 0.01, value) }
    const nextMediaRanges = mediaRanges.map((candidate, index) =>
      index === range.index ? next : candidate,
    )
    commitReviewedRanges({ ...currentRanges, [range.mediaId]: nextMediaRanges })
  }

  function findAuditionFrames(range: ReviewRange) {
    const fps = timelineFps.current
    const items = itemById.current
    for (const itemId of itemIds.current) {
      const item = items[itemId]
      if ((item?.type !== 'audio' && item?.type !== 'video') || item.mediaId !== range.mediaId) {
        continue
      }
      const mappedStart = sourceSecondsToTimelineFrame(item, range.start, fps)
      const mappedEnd = sourceSecondsToTimelineFrame(item, range.end, fps)
      const startFrame = Math.max(item.from, Math.min(mappedStart, mappedEnd))
      const endFrame = Math.min(item.from + item.durationInFrames, Math.max(mappedStart, mappedEnd))
      if (endFrame > startFrame) return { endFrame, fps, item, startFrame }
    }
    return null
  }

  function handlePlayRange(range: ReviewRange) {
    const target = findAuditionFrames(range)
    if (!target) return
    auditionPlan = { stopFrame: target.endFrame }
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.setCurrentFrame(target.startFrame)
    playback.play()
  }

  function handlePreviewCut(range: ReviewRange) {
    const target = findAuditionFrames(range)
    if (!target) return
    const handleFrames = Math.max(1, Math.round(target.fps * 0.5))
    const previewStart = Math.max(target.item.from, target.startFrame - handleFrames)
    const previewEnd = Math.min(
      target.item.from + target.item.durationInFrames,
      target.endFrame + handleFrames,
    )
    auditionPlan = {
      skipStartFrame: target.startFrame,
      skipEndFrame: target.endFrame,
      stopFrame: previewEnd,
    }
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.setCurrentFrame(previewStart)
    playback.play()
  }
</script>

{#if isOpen.current}
  <FloatingPanel
    title={t('timeline.silenceRemoval.title')}
    defaultBounds={SILENCE_REMOVAL_PANEL_DEFAULT_BOUNDS}
    minWidth={420}
    minHeight={320}
    storageKey={SILENCE_REMOVAL_PANEL_STORAGE_KEY}
    onClose={handlePanelClose}
    resizable={false}
    autoHeight
    class="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <section
      role="dialog"
      aria-label={t('timeline.silenceRemoval.title')}
      aria-modal="false"
      class="flex flex-col"
    >
      <div class="space-y-4 p-3">
        <div class="rounded-md border bg-muted/35 px-3 py-2 text-sm leading-tight">
          <div class="font-medium">
            {t('timeline.silenceRemoval.rangesSelected', { count: summary.current.rangeCount })}
          </div>
          {#if failedMediaCount.current > 0}
            <div class="mt-1 text-xs text-amber-400">
              {t('timeline.silenceRemoval.partialFailure', { count: failedMediaCount.current })}
            </div>
          {/if}
          <div class="mt-1 text-xs text-muted-foreground">
            {t('timeline.silenceRemoval.aboutWillBeRemoved', {
              duration: formatSeconds(summary.current.totalSeconds),
            })}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-1">
          <Button
            type="button"
            size="sm"
            variant={draft.mode === 'signal' ? 'secondary' : 'ghost'}
            onclick={() => handleModeChange('signal')}
            disabled={isAnalyzing && draft.mode === 'signal'}
          >
            {t('timeline.silenceRemoval.signalMode')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={draft.mode === 'speech' ? 'secondary' : 'ghost'}
            onclick={() => handleModeChange('speech')}
            disabled={isAnalyzing && draft.mode === 'speech'}
          >
            {t('timeline.silenceRemoval.speechMode')}
          </Button>
        </div>

        <div class="space-y-3.5">
          {#if draft.mode === 'signal'}
            <div class="flex items-center justify-between gap-3">
              <Label for="silence-auto-thresholds" class="text-xs font-medium">
                {t('timeline.silenceRemoval.autoThresholds')}
              </Label>
              <Switch
                id="silence-auto-thresholds"
                checked={draft.autoThresholds}
                onCheckedChange={(autoThresholds) => (draft = { ...draft, autoThresholds })}
              />
            </div>
            {#if !draft.autoThresholds}
              <SettingControl
                id="silence-threshold"
                label={t('timeline.silenceRemoval.silenceThreshold')}
                value={draft.thresholdDb}
                min={-80}
                max={-20}
                step={1}
                suffix="dB"
                onChange={(thresholdDb) => (draft = { ...draft, thresholdDb })}
              />
              <SettingControl
                id="audio-threshold"
                label={t('timeline.silenceRemoval.audioThreshold')}
                value={draft.audioThresholdDb}
                min={Math.min(-19, draft.thresholdDb + 1)}
                max={-6}
                step={1}
                suffix="dB"
                onChange={(audioThresholdDb) => (draft = { ...draft, audioThresholdDb })}
              />
            {/if}
          {/if}
          <SettingControl
            id="silence-duration"
            label={t('timeline.silenceRemoval.minimumSilence')}
            value={draft.minSilenceMs}
            min={100}
            max={3000}
            step={50}
            suffix="ms"
            onChange={(minSilenceMs) => (draft = { ...draft, minSilenceMs })}
          />
          {#if draft.mode === 'signal'}
            <SettingControl
              id="audio-duration"
              label={t('timeline.silenceRemoval.minimumAudio')}
              value={draft.minAudioMs}
              min={20}
              max={1000}
              step={20}
              suffix="ms"
              onChange={(minAudioMs) => (draft = { ...draft, minAudioMs })}
            />
          {/if}
          <SettingControl
            id="silence-padding-start"
            label={t('timeline.silenceRemoval.keepAfterAudio')}
            value={draft.paddingStartMs}
            min={0}
            max={1000}
            step={25}
            suffix="ms"
            onChange={(paddingStartMs) => (draft = { ...draft, paddingStartMs })}
          />
          <SettingControl
            id="silence-padding-end"
            label={t('timeline.silenceRemoval.keepBeforeAudio')}
            value={draft.paddingEndMs}
            min={0}
            max={1000}
            step={25}
            suffix="ms"
            onChange={(paddingEndMs) => (draft = { ...draft, paddingEndMs })}
          />
        </div>

        {#if reviewRanges.length > 0}
          <div class="space-y-2">
            <Label class="text-xs font-medium">
              {t('timeline.silenceRemoval.reviewRanges')}
            </Label>
            {#if reviewWaveform}
              {@const waveformWidth = Math.round(360 * waveformZoom)}
              <div class="space-y-1.5 rounded-md border p-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs text-muted-foreground">
                    {reviewWaveform.item.label}
                  </span>
                  <div class="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-6 w-7 px-0"
                      aria-label={t('timeline.toolbar.zoomOut')}
                      disabled={waveformZoom <= 1}
                      onclick={() => (waveformZoom = Math.max(1, waveformZoom / 2))}
                    >
                      −
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-[11px]"
                      aria-label={t('timeline.toolbar.zoomToFit')}
                      onclick={() => (waveformZoom = 1)}
                    >
                      {waveformZoom}×
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-6 w-7 px-0"
                      aria-label={t('timeline.toolbar.zoomIn')}
                      disabled={waveformZoom >= 8}
                      onclick={() => (waveformZoom = Math.min(8, waveformZoom * 2))}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div class="overflow-x-auto rounded bg-muted/30">
                  <div class="relative h-20 min-w-full" style:width="{waveformWidth}px">
                    <ClipWaveform
                      mediaId={reviewWaveform.item.mediaId}
                      clipWidth={waveformWidth}
                      sourceStart={reviewWaveform.sourceStart}
                      sourceEnd={reviewWaveform.sourceEnd}
                      sourceDuration={reviewWaveform.sourceDuration}
                      trimStart={0}
                      speed={reviewWaveform.item.speed ?? 1}
                      isReversed={reviewWaveform.item.isReversed}
                      fps={timelineFps.current}
                      isVisible
                      pixelsPerSecond={waveformWidth /
                        Math.max(0.01, reviewWaveform.item.durationInFrames / timelineFps.current)}
                    />
                    {#each reviewWaveform.ranges as range (range.key)}
                      <div
                        class="pointer-events-none absolute inset-y-0 border-x border-red-400/80 bg-red-500/25"
                        style:left="{range.startRatio * 100}%"
                        style:width="{(range.endRatio - range.startRatio) * 100}%"
                      ></div>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
            <ScrollArea class="h-48 rounded-md border">
              <div class="divide-y">
                {#each reviewRanges as range (range.key)}
                  <div
                    class="space-y-2 p-2 [contain-intrinsic-size:0_72px] [content-visibility:auto]"
                  >
                    <div class="truncate text-xs font-medium" title={range.label}>
                      {range.label}
                    </div>
                    <div class="flex items-center gap-1.5">
                      <Label class="text-[11px] text-muted-foreground">
                        {t('timeline.silenceRemoval.rangeStart')}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.05}
                        value={Number(range.start.toFixed(3))}
                        oninput={(event) =>
                          handleRangeBoundaryChange(
                            range,
                            'start',
                            Number(event.currentTarget.value),
                          )}
                        class="h-7 w-20 px-1.5 text-xs"
                      />
                      <Label class="text-[11px] text-muted-foreground">
                        {t('timeline.silenceRemoval.rangeEnd')}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.05}
                        value={Number(range.end.toFixed(3))}
                        oninput={(event) =>
                          handleRangeBoundaryChange(
                            range,
                            'end',
                            Number(event.currentTarget.value),
                          )}
                        class="h-7 w-20 px-1.5 text-xs"
                      />
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        onclick={() => handlePlayRange(range)}
                      >
                        {t('timeline.silenceRemoval.playRange')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        onclick={() => handlePreviewCut(range)}
                      >
                        {t('timeline.silenceRemoval.previewCut')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        onclick={() => handleKeepRange(range)}
                      >
                        {t('timeline.silenceRemoval.keepRange')}
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            </ScrollArea>
          </div>
        {/if}
      </div>

      <div
        class="flex flex-col-reverse gap-2 border-t border-border bg-secondary/10 p-3 sm:flex-row sm:justify-end"
      >
        <Button variant="ghost" size="sm" onclick={handleClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onclick={isAnalyzing ? () => analysisAbort?.abort() : handleUpdatePreview}
        >
          {isAnalyzing
            ? `${t('timeline.silenceRemoval.cancelAnalysis')} ${Math.round(analysisProgress * 100)}%`
            : t('timeline.silenceRemoval.updatePreview')}
        </Button>
        <Button
          size="sm"
          onclick={handleApply}
          disabled={isAnalyzing || summary.current.rangeCount === 0}
        >
          {t('timeline.silenceRemoval.remove')}
        </Button>
      </div>
    </section>
  </FloatingPanel>
{/if}
