<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('FillerRemovalDialog')
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { FloatingPanel } from '@/components/ui/floating-panel'
  import { removeFillerWordsFromItems } from '@/features/timeline/stores/timeline-actions'
  import { useFillerRemovalDialogStore } from '@/features/timeline/stores/filler-removal-dialog-store'
  import {
    analyzeFillerWordsForItems,
    applyFillerPreviewOverlays,
    clearFillerPreviewOverlays,
    FILLER_REMOVAL_PRESETS,
    SUGGESTED_EXTRA_FILLER_WORDS,
    type FillerRangesByMediaId,
    type FillerRemovalSettings,
  } from '@/features/timeline/utils/filler-word-removal-preview'
  import { scoreFillerRangesWithClap } from '@/features/timeline/utils/filler-audio-confidence'
  import type { RemoveSilenceResult } from '@/features/timeline/stores/actions/item-edit-actions'
  import FillerEntryEditor from './filler-entry-editor.svelte'
  import FillerMatchList from './filler-match-list.svelte'
  import NumberSetting from './number-setting.svelte'
  import UndoRedoControls from './undo-redo-controls.svelte'
  import {
    DRAFT_HISTORY_LIMIT,
    FILLER_REMOVAL_PANEL_DEFAULT_BOUNDS,
    FILLER_REMOVAL_PANEL_STORAGE_KEY,
    addEntry,
    areSettingsEqual,
    cloneSettings,
    createHighConfidenceSelectedRangeIds,
    createSelectedRangeIds,
    filterRangesBySelectedIds,
    formatSeconds,
    isEditableTarget,
    summarizeRanges,
  } from './filler-removal-dialog-model'

  const isOpen = select(useFillerRemovalDialogStore, (state) => state.isOpen)
  const itemIds = select(useFillerRemovalDialogStore, (state) => state.itemIds)
  const settings = select(useFillerRemovalDialogStore, (state) => state.settings)
  const rangesByMediaId = select(useFillerRemovalDialogStore, (state) => state.rangesByMediaId)
  const updatePreview = select(useFillerRemovalDialogStore, (state) => state.updatePreview)
  const close = select(useFillerRemovalDialogStore, (state) => state.close)
  let draft = $state.raw<FillerRemovalSettings>(useFillerRemovalDialogStore.getState().settings)
  let draftPast = $state.raw<FillerRemovalSettings[]>([])
  let draftFuture = $state.raw<FillerRemovalSettings[]>([])
  let reviewRangesByMediaId = $state.raw<FillerRangesByMediaId>(
    useFillerRemovalDialogStore.getState().rangesByMediaId,
  )
  let selectedRangeIds = $state.raw<Set<string>>(
    createSelectedRangeIds(useFillerRemovalDialogStore.getState().rangesByMediaId),
  )
  let isAnalyzing = $state(false)
  let isScoringAudio = $state(false)
  let hasApplied = $state(false)
  let wasOpen = false
  let isOpenRef = useFillerRemovalDialogStore.getState().isOpen
  let draftVersion = 0

  $effect(() => {
    isOpenRef = isOpen.current
  })

  const selectedRangesByMediaId = $derived(
    filterRangesBySelectedIds(reviewRangesByMediaId, selectedRangeIds),
  )
  const totalReviewedRangeCount = $derived(
    Object.values(reviewRangesByMediaId).reduce((sum, ranges) => sum + ranges.length, 0),
  )
  const selectedSummary = $derived(summarizeRanges(selectedRangesByMediaId))

  $effect(() => {
    const open = isOpen.current
    const currentRanges = rangesByMediaId.current
    const currentSettings = settings.current
    untrack(() => {
      if (open && !wasOpen) {
        draftVersion += 1
        draft = cloneSettings(currentSettings)
        draftPast = []
        draftFuture = []
        reviewRangesByMediaId = currentRanges
        selectedRangeIds = createSelectedRangeIds(currentRanges)
        hasApplied = false
      }
      wasOpen = open
    })
  })

  function updateDraft(
    updater: FillerRemovalSettings | ((current: FillerRemovalSettings) => FillerRemovalSettings),
  ) {
    const current = draft
    const next = typeof updater === 'function' ? updater(current) : updater
    if (areSettingsEqual(current, next)) {
      return
    }

    draftVersion += 1
    draftPast = [...draftPast, cloneSettings(current)].slice(-DRAFT_HISTORY_LIMIT)
    draftFuture = []
    hasApplied = false
    draft = cloneSettings(next)
  }

  function undoDraft() {
    const previous = draftPast.at(-1)
    if (!previous) return
    draftVersion += 1
    draftFuture = [cloneSettings(draft), ...draftFuture].slice(0, DRAFT_HISTORY_LIMIT)
    draft = cloneSettings(previous)
    hasApplied = false
    draftPast = draftPast.slice(0, -1)
  }

  function redoDraft() {
    const next = draftFuture[0]
    if (!next) return
    draftVersion += 1
    draftPast = [...draftPast, cloneSettings(draft)].slice(-DRAFT_HISTORY_LIMIT)
    draft = cloneSettings(next)
    hasApplied = false
    draftFuture = draftFuture.slice(1)
  }

  function handleClose() {
    isOpenRef = false
    draftVersion += 1
    clearFillerPreviewOverlays(itemIds.current)
    isAnalyzing = false
    isScoringAudio = false
    close.current()
  }

  $effect(() => {
    if (!isOpen.current) return

    return untrack(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // The window sees a shadow-root editor's events retargeted to its host.
        if (isEditableTarget(event.composedPath()[0] ?? event.target)) return

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          const canRedo = event.shiftKey && draftFuture.length > 0
          const canUndo = !event.shiftKey && draftPast.length > 0
          if (!canUndo && !canRedo) return

          event.preventDefault()
          event.stopPropagation()
          if (canRedo) {
            redoDraft()
          } else {
            undoDraft()
          }
          return
        }

        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        handleClose()
      }

      window.addEventListener('keydown', handleKeyDown, { capture: true })
      return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
    })
  })

  function handleUpdatePreview() {
    const startedVersion = draftVersion
    const isStale = () => !isOpenRef || draftVersion !== startedVersion
    const currentItemIds = itemIds.current
    const currentDraft = draft
    const run = async () => {
      isAnalyzing = true
      try {
        const nextRangesByMediaId = await analyzeFillerWordsForItems(currentItemIds, currentDraft)
        if (isStale()) return
        const nextSelectedRangeIds = createSelectedRangeIds(nextRangesByMediaId)
        const selectedRanges = filterRangesBySelectedIds(nextRangesByMediaId, nextSelectedRangeIds)
        const nextSummary = applyFillerPreviewOverlays(currentItemIds, selectedRanges)
        reviewRangesByMediaId = nextRangesByMediaId
        selectedRangeIds = nextSelectedRangeIds
        updatePreview.current({
          settings: currentDraft,
          rangesByMediaId: selectedRanges,
          summary: nextSummary,
        })
        hasApplied = false
        if (nextSummary.rangeCount === 0) {
          toast.info(t('timeline.fillerRemoval.toastNoRemovable'))
        }
      } catch (error) {
        if (isStale()) return
        logger.warn('Filler preview failed', error)
        toast.error(
          error instanceof Error ? error.message : t('timeline.fillerRemoval.toastPreviewFailed'),
        )
      } finally {
        if (!isStale()) isAnalyzing = false
      }
    }

    void run()
  }

  function handleScoreAudio() {
    const startedVersion = draftVersion
    const isStale = () => !isOpenRef || draftVersion !== startedVersion
    const currentItemIds = itemIds.current
    const currentDraft = draft
    const currentReviewRanges = reviewRangesByMediaId
    const run = async () => {
      isScoringAudio = true
      try {
        const scoredRangesByMediaId = await scoreFillerRangesWithClap(currentReviewRanges)
        if (isStale()) return
        const nextSelectedRangeIds = createHighConfidenceSelectedRangeIds(scoredRangesByMediaId)
        const selectedRanges = filterRangesBySelectedIds(
          scoredRangesByMediaId,
          nextSelectedRangeIds,
        )
        const nextSummary = applyFillerPreviewOverlays(currentItemIds, selectedRanges)
        reviewRangesByMediaId = scoredRangesByMediaId
        selectedRangeIds = nextSelectedRangeIds
        updatePreview.current({
          settings: currentDraft,
          rangesByMediaId: selectedRanges,
          summary: nextSummary,
        })
        toast.success(t('timeline.fillerRemoval.toastAudioScored'))
      } catch (error) {
        if (isStale()) return
        logger.warn('Audio confidence scoring failed', error)
        toast.error(
          error instanceof Error ? error.message : t('timeline.fillerRemoval.toastScoreFailed'),
        )
      } finally {
        if (!isStale()) isScoringAudio = false
      }
    }

    void run()
  }

  function handleApply() {
    const currentItemIds = itemIds.current
    let result: RemoveSilenceResult | null = null
    try {
      result = removeFillerWordsFromItems(currentItemIds, selectedRangesByMediaId)
    } catch (error) {
      logger.warn('Filler removal failed', error)
      toast.error(
        error instanceof Error ? error.message : t('timeline.fillerRemoval.toastRemoveFailed'),
      )
      return
    } finally {
      clearFillerPreviewOverlays(currentItemIds)
    }

    if (!result || result.removedItemCount === 0) {
      toast.info(t('timeline.fillerRemoval.toastNoneInClips'))
      return
    }

    toast.success(t('timeline.fillerRemoval.toastRemoved', { count: result.removedItemCount }))
    hasApplied = true
  }

  function handleToggleRange(id: string) {
    const next = new Set(selectedRangeIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    const currentItemIds = itemIds.current
    const selectedRanges = filterRangesBySelectedIds(reviewRangesByMediaId, next)
    const nextSummary = applyFillerPreviewOverlays(currentItemIds, selectedRanges)
    updatePreview.current({
      settings: settings.current,
      rangesByMediaId: selectedRanges,
      summary: nextSummary,
    })
    hasApplied = false
    selectedRangeIds = next
  }
</script>

{#if isOpen.current}
  <FloatingPanel
    title={t('timeline.fillerRemoval.title')}
    defaultBounds={FILLER_REMOVAL_PANEL_DEFAULT_BOUNDS}
    minWidth={340}
    minHeight={220}
    storageKey={FILLER_REMOVAL_PANEL_STORAGE_KEY}
    onClose={handleClose}
    resizable={false}
    autoHeight
    class="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
  >
    {#snippet headerExtra()}
      <UndoRedoControls
        canUndo={draftPast.length > 0}
        canRedo={draftFuture.length > 0}
        onUndo={undoDraft}
        onRedo={redoDraft}
      />
    {/snippet}
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <section
      role="dialog"
      aria-label={t('timeline.fillerRemoval.title')}
      aria-modal="false"
      class="flex flex-col"
    >
      <div class="p-3">
        <div class="rounded-md border bg-muted/35 px-3 py-2 text-sm leading-tight">
          <div class="font-medium">
            {t('timeline.fillerRemoval.rangesSelected', { count: selectedSummary.rangeCount })}
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            {t('timeline.fillerRemoval.aboutWillBeRemoved', {
              duration: formatSeconds(selectedSummary.totalSeconds),
            })}
          </div>
        </div>

        <div class="mt-4 space-y-4">
          <div class="flex rounded-md border bg-muted/20 p-1">
            {#each FILLER_REMOVAL_PRESETS as preset (preset.id)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 flex-1 px-2 text-xs"
                onclick={() =>
                  updateDraft({
                    fillerWords: [...preset.settings.fillerWords],
                    fillerPhrases: [...preset.settings.fillerPhrases],
                    paddingMs: preset.settings.paddingMs,
                    maxSimpleFillerMs: preset.settings.maxSimpleFillerMs,
                    maxPhraseFillerMs: preset.settings.maxPhraseFillerMs,
                  })}
              >
                {t(`timeline.fillerRemoval.preset.${preset.id}`)}
              </Button>
            {/each}
          </div>
          <div class="space-y-2 rounded-md border bg-muted/20 p-2">
            <NumberSetting
              id="filler-padding"
              label={t('timeline.fillerRemoval.cutPadding')}
              value={draft.paddingMs}
              min={0}
              max={500}
              step={5}
              suffix="ms"
              onChange={(paddingMs) => updateDraft((current) => ({ ...current, paddingMs }))}
            />
            <NumberSetting
              id="filler-word-duration"
              label={t('timeline.fillerRemoval.maxWord')}
              value={draft.maxSimpleFillerMs}
              min={100}
              max={3000}
              step={50}
              suffix="ms"
              onChange={(maxSimpleFillerMs) =>
                updateDraft((current) => ({ ...current, maxSimpleFillerMs }))}
            />
            <NumberSetting
              id="filler-phrase-duration"
              label={t('timeline.fillerRemoval.maxPhrase')}
              value={draft.maxPhraseFillerMs}
              min={250}
              max={5000}
              step={50}
              suffix="ms"
              onChange={(maxPhraseFillerMs) =>
                updateDraft((current) => ({ ...current, maxPhraseFillerMs }))}
            />
          </div>
          <FillerMatchList
            itemIds={itemIds.current}
            rangesByMediaId={reviewRangesByMediaId}
            {selectedRangeIds}
            onToggleRange={handleToggleRange}
          />
          <FillerEntryEditor
            id="filler-words"
            label={t('timeline.fillerRemoval.words')}
            entries={draft.fillerWords}
            placeholder={t('timeline.fillerRemoval.addWord')}
            onChange={(fillerWords) => updateDraft((current) => ({ ...current, fillerWords }))}
          />
          <div class="flex flex-wrap gap-1.5">
            {#each SUGGESTED_EXTRA_FILLER_WORDS as word (word)}
              <button
                type="button"
                class="inline-flex overflow-hidden rounded border bg-background text-xs hover:bg-muted"
                onclick={() =>
                  updateDraft((current) => ({
                    ...current,
                    fillerWords: addEntry(current.fillerWords, word),
                  }))}
                ><span class="px-2 py-1">{word}</span><span
                  class="border-l border-border px-1.5 py-1 font-medium text-foreground">+</span
                ></button
              >
            {/each}
          </div>
          <FillerEntryEditor
            id="filler-phrases"
            label={t('timeline.fillerRemoval.phrases')}
            entries={draft.fillerPhrases}
            placeholder={t('timeline.fillerRemoval.addPhrase')}
            onChange={(fillerPhrases) => updateDraft((current) => ({ ...current, fillerPhrases }))}
          />
        </div>
      </div>

      <div
        class="flex flex-col-reverse gap-2 border-t border-border bg-secondary/10 p-3 sm:flex-row sm:justify-end"
      >
        <Button variant="ghost" size="sm" onclick={handleClose} disabled={isAnalyzing}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onclick={handleUpdatePreview}
          disabled={isAnalyzing || isScoringAudio}
        >
          {isAnalyzing
            ? t('timeline.fillerRemoval.updating')
            : t('timeline.fillerRemoval.updatePreview')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onclick={handleScoreAudio}
          disabled={isAnalyzing || isScoringAudio || totalReviewedRangeCount === 0}
        >
          {isScoringAudio
            ? t('timeline.fillerRemoval.scoring')
            : t('timeline.fillerRemoval.scoreAudio')}
        </Button>
        <Button
          size="sm"
          onclick={handleApply}
          disabled={isAnalyzing || isScoringAudio || hasApplied || selectedSummary.rangeCount === 0}
        >
          {hasApplied ? t('timeline.fillerRemoval.removed') : t('timeline.fillerRemoval.remove')}
        </Button>
      </div>
    </section>
  </FloatingPanel>
{/if}
