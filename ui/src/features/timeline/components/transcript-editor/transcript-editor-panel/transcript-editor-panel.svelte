<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { MediaTranscript } from '@/types/storage'
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('TranscriptEditorPanel')

  type MediaStatus = 'loading' | 'ready' | 'needs' | 'error' | 'transcribing'

  interface MediaEntry {
    status: MediaStatus
    transcript?: MediaTranscript
    errorMessage?: string
  }

  function hasWordTimings(
    transcript: MediaTranscript | null | undefined,
  ): transcript is MediaTranscript {
    return !!transcript && transcript.segments.some((segment) => (segment.words?.length ?? 0) > 0)
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import Captions from '@lucide/svelte/icons/captions'
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import Copy from '@lucide/svelte/icons/copy'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Scissors from '@lucide/svelte/icons/scissors'
  import Search from '@lucide/svelte/icons/search'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import X from '@lucide/svelte/icons/x'
  import { t } from '$lib/i18n.svelte'
  import { select, shallow } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import {
    TranscribeDialog,
    type TranscribeDialogValues,
  } from '@/features/timeline/deps/transcribe-dialog'
  import { cn } from '@/shared/ui/cn'
  import {
    isTranscriptionOutOfMemoryError,
    TRANSCRIPTION_OOM_HINT,
  } from '@/shared/utils/transcription-cancellation'
  import { useSelectionStore } from '@/shared/state/selection'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useClipboardStore } from '@/shared/state/clipboard'
  import { useEditorStore } from '@/shared/state/editor'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { removeTranscriptRangesFromItems } from '@/features/timeline/stores/timeline-actions'
  import {
    countIgnoredSpans,
    totalIgnoredSeconds,
    useTranscriptIgnoreStore,
  } from '@/features/timeline/stores/transcript-ignore-store'
  import { buildTranscriptClipboardItems } from '@/features/timeline/utils/transcript-clipboard'
  import { registerTranscriptCopyHandler } from '@/features/timeline/utils/transcript-copy-bridge'
  import {
    cancelMediaTranscriptionJob,
    mediaTranscriptionService,
    runMediaTranscriptionJob,
  } from '@/features/timeline/deps/media-transcription-service'
  import {
    buildRemovalRangesByMediaId,
    buildTranscriptTokens,
    findActiveTokenIndex,
    getSelectedTokenSlice,
    isTranscriptableItem,
    type TranscriptableItem,
  } from '@/features/timeline/utils/transcript-edit-model'
  import { isSpanIgnored } from '@/features/timeline/utils/source-range-intervals'
  import { findTranscriptWordMatches } from '@/features/timeline/utils/transcript-fuzzy'
  import ScopeToggle from './scope-toggle.svelte'
  import TranscriptSegmentRow from './transcript-segment-row.svelte'
  import {
    buildSegments,
    formatTimecode,
    type TranscriptEditorPanelProps,
    type TranscriptScope,
  } from './transcript-segments'

  let { active }: TranscriptEditorPanelProps = $props()

  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const itemById = select(useItemsStore, (s) => s.itemById)
  const allItems = select(useItemsStore, (s) => s.items)
  const timelineFps = select(useTimelineSettingsStore, (s) => s.fps)
  // Only track the playhead while the tab is visible. The panel is always mounted
  // (media-sidebar toggles a CSS `hidden` class, never unmounts), so subscribing to
  // currentFrame unconditionally would update the whole token list on every
  // playback/skim frame even when hidden. When inactive the selector returns a
  // constant, so the store change never reaches the panel.
  const currentFrame = $derived(select(usePlaybackStore, (s) => (active ? s.currentFrame : 0)))
  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)
  const ignoreRanges = select(useTranscriptIgnoreStore, (s) => s.ranges)
  const setTranscriptShortcutScope = select(
    useEditorStore,
    (s) => s.setTranscriptEditorShortcutScopeActive,
  )

  let scope = $state<TranscriptScope>('selection')
  let mediaState = $state.raw<Record<string, MediaEntry>>({})
  let anchorIndex = $state(-1)
  let focusIndex = $state(-1)
  let query = $state('')
  let transcribeDialogOpen = $state(false)
  // -1 means "no match shown yet", so the first Next/Enter lands on match 0.
  let matchCursor = $state(-1)
  // Bumped when a stored transcript changes externally (e.g. deleted from the media
  // library) to force the load effect to re-fetch instead of serving the stale cache.
  let refreshNonce = $state(0)

  let pointerWithin = $state(false)
  let focusWithin = $state(false)

  let isSelecting = false
  let scrollEl = $state<HTMLDivElement | null>(null)
  let rootEl = $state<HTMLDivElement | null>(null)
  // mediaIds we've already kicked off a load for — keeps the load effect from
  // depending on `mediaState` (which would re-run it and cancel its own fetch).
  const requested = new Set<string>()
  let mounted = true

  // Own Delete/Backspace whenever the pointer or focus is inside the panel, so
  // the timeline's clip-delete shortcut yields to us (see use-editing-shortcuts).
  $effect(() => {
    setTranscriptShortcutScope.current(active && (pointerWithin || focusWithin))
  })

  $effect(() => {
    const setScope = setTranscriptShortcutScope.current
    return () => setScope(false)
  })

  // Both keep their last array while its contents are unchanged: an edit
  // elsewhere on the timeline replaces the items arrays, and would otherwise
  // rebuild every token and reset the word selection below.
  let lastTranscriptableItems: TranscriptableItem[] = []
  const transcriptableItems = $derived.by(() => {
    const next =
      scope === 'project'
        ? allItems.current.filter(isTranscriptableItem).toSorted((a, b) => a.from - b.from)
        : selectedItemIds.current.map((id) => itemById.current[id]).filter(isTranscriptableItem)
    if (!shallow(next, lastTranscriptableItems)) lastTranscriptableItems = next
    return lastTranscriptableItems
  })

  let lastUniqueMediaIds: string[] = []
  const uniqueMediaIds = $derived.by(() => {
    const next = Array.from(new Set(transcriptableItems.map((item) => item.mediaId))).sort()
    if (!shallow(next, lastUniqueMediaIds)) lastUniqueMediaIds = next
    return lastUniqueMediaIds
  })

  const transcriptsByMediaId = $derived.by(() => {
    const map: Record<string, MediaTranscript | undefined> = {}
    for (const id of uniqueMediaIds) map[id] = mediaState[id]?.transcript
    return map
  })

  const tokens = $derived(
    buildTranscriptTokens(transcriptableItems, transcriptsByMediaId, timelineFps.current),
  )

  const activeIndex = $derived(findActiveTokenIndex(tokens, currentFrame.current))

  const segments = $derived(buildSegments(tokens, timelineFps.current))

  const sourceCoverage = $derived.by(() => {
    if (scope !== 'selection' || uniqueMediaIds.length !== 1 || tokens.length === 0) return null
    return tokens.reduce(
      (coverage, token) => ({
        start: Math.min(coverage.start, token.sourceStart),
        end: Math.max(coverage.end, token.sourceEnd),
      }),
      { start: Number.POSITIVE_INFINITY, end: 0 },
    )
  })

  const selectedSlice = $derived(getSelectedTokenSlice(tokens, anchorIndex, focusIndex))
  const selectedKeys = $derived(new Set(selectedSlice.map((token) => token.key)))

  const ignoredKeys = $derived.by(() => {
    const ranges = ignoreRanges.current
    const keys = new Set<string>()
    for (const token of tokens) {
      if (isSpanIgnored(token.sourceStart, token.sourceEnd, ranges[token.mediaId])) {
        keys.add(token.key)
      }
    }
    return keys
  })

  const ignoredSpanCount = $derived(countIgnoredSpans(ignoreRanges.current))
  const ignoredSeconds = $derived(totalIgnoredSeconds(ignoreRanges.current))

  const hasQuery = $derived(query.trim().length > 0)
  const searchResult = $derived(
    findTranscriptWordMatches(
      tokens.map((token) => token.text),
      query,
    ),
  )
  const matchSpans = $derived(searchResult.spans)
  const matchesApproximate = $derived(searchResult.approximate)

  // One phrase = one navigable result (count + next/prev use matchSpans); every
  // token inside a span is highlighted.
  const matchKeys = $derived.by(() => {
    const keys = new Set<string>()
    for (const span of matchSpans) {
      for (let index = span.start; index <= span.end; index++) {
        const key = tokens[index]?.key
        if (key) keys.add(key)
      }
    }
    return keys
  })

  // Reset transient UI when the document changes (clips or scope).
  $effect(() => {
    void uniqueMediaIds
    void scope
    untrack(() => {
      anchorIndex = -1
      focusIndex = -1
      matchCursor = 0
    })
  })

  $effect(() => {
    mounted = true
    return () => {
      mounted = false
    }
  })

  // Invalidate our cached transcript when the stored one changes elsewhere (deleted from
  // the media library, or (re)generated). Drop it from the dedup set + local state and
  // nudge the load effect so it re-fetches the current state instead of the stale copy.
  $effect(() => {
    return mediaTranscriptionService.onTranscriptChanged((mediaId) => {
      if (!requested.has(mediaId)) return
      requested.delete(mediaId)
      if (mediaId in mediaState) {
        const next = { ...mediaState }
        delete next[mediaId]
        mediaState = next
      }
      refreshNonce += 1
    })
  })

  // Load transcripts for any media we haven't requested yet. Dedupe is tracked in
  // a set so this effect never depends on `mediaState` — depending on it would
  // re-run the effect after the `loading` write and strand the fetch.
  $effect(() => {
    void refreshNonce
    const mediaIds = uniqueMediaIds
    if (!active) return
    const missing = mediaIds.filter((id) => !requested.has(id))
    if (missing.length === 0) return

    for (const id of missing) requested.add(id)
    untrack(() => {
      const next = { ...mediaState }
      for (const id of missing) next[id] = { status: 'loading' }
      mediaState = next
    })

    void Promise.all(
      missing.map(async (mediaId) => {
        try {
          const transcript = await mediaTranscriptionService.getTranscript(mediaId)
          if (!mounted) return
          if (transcript) {
            mediaTranscriptionService.syncExistingTranscriptCaptions(mediaId, transcript)
          }
          mediaState = {
            ...mediaState,
            [mediaId]: hasWordTimings(transcript)
              ? { status: 'ready', transcript }
              : { status: 'needs' },
          }
        } catch (error) {
          if (!mounted) return
          logger.warn('Failed to load transcript', { mediaId, error })
          const errorMessage =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t('transcript.toastTranscribeFailed')
          mediaState = {
            ...mediaState,
            [mediaId]: { status: 'error', errorMessage },
          }
        }
      }),
    )
  })

  // Keep the active word in view during playback. Skip entirely when hidden — a
  // querySelector + scrollIntoView every frame on an off-screen panel is pure waste.
  $effect(() => {
    if (!active || !isPlaying.current || activeIndex < 0) return
    const key = tokens[activeIndex]?.key
    if (!key) return
    const el = scrollEl?.querySelector<HTMLElement>(`[data-token-key="${CSS.escape(key)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })

  $effect(() => {
    const stop = () => {
      isSelecting = false
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  })

  function seekToToken(frame: number) {
    usePlaybackStore.getState().setCurrentFrame(frame)
  }

  function handlePointerDown(index: number, event: PointerEvent) {
    const token = tokens[index]
    if (!token) return
    if (event.shiftKey && anchorIndex >= 0) {
      focusIndex = index
    } else {
      isSelecting = true
      anchorIndex = index
      focusIndex = index
    }
    // Focus the panel so Delete/Backspace land on our handler (which marks the
    // selection) instead of leaking to the timeline.
    rootEl?.focus({ preventScroll: true })
    // Capture the pointer so the drag keeps extending even when the cursor
    // outruns the words or strays into padding/gaps — pointermove then routes
    // here regardless of what's under the cursor.
    scrollEl?.setPointerCapture(event.pointerId)
    seekToToken(token.startFrame)
  }

  // Drag-extend by hit-testing the word under the cursor on every move. This is
  // far smoother than per-span pointerenter (which skips words on fast drags
  // and stalls over any non-word pixel). Assigning an unchanged focusIndex is a
  // no-op, so this only updates on an actual word boundary crossing.
  function handlePointerMove(event: PointerEvent) {
    if (!isSelecting) return
    // The editor may live in a shadow root: hit-test in the panel's own root.
    const root = (event.currentTarget as HTMLElement).getRootNode() as Document | ShadowRoot
    const el = root
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-token-index]')
    if (!el) return
    const index = Number(el.dataset.tokenIndex)
    if (Number.isInteger(index)) focusIndex = index
  }

  // Non-destructive: striking words stages them as "ignored" (restorable) rather
  // than cutting the timeline. Re-striking an already-ignored selection restores it.
  function handleIgnoreToggle() {
    if (selectedSlice.length === 0) return
    const ranges = buildRemovalRangesByMediaId(selectedSlice)
    const allIgnored = selectedSlice.every((token) => ignoredKeys.has(token.key))
    if (allIgnored) {
      useTranscriptIgnoreStore.getState().restore(ranges)
    } else {
      useTranscriptIgnoreStore.getState().ignore(ranges)
    }
  }

  // Word-level copy/cut that carries the media: each run of selected words
  // becomes a trimmed clone of its clip, placed on the shared clipboard so the
  // existing global paste (Ctrl+V) drops the spans onto the timeline. Cut also
  // removes the words from the timeline immediately.
  function handleCopyWords(cut: boolean) {
    if (selectedSlice.length === 0) return
    const clones = buildTranscriptClipboardItems(
      selectedSlice,
      itemById.current,
      timelineFps.current,
    )
    if (clones.length === 0) return

    const currentFrame = usePlaybackStore.getState().currentFrame
    useClipboardStore.getState().copyItems(clones, currentFrame, cut ? 'cut' : 'copy')
    void navigator.clipboard
      ?.writeText(selectedSlice.map((token) => token.text).join(' '))
      .catch(() => {})

    const count = selectedSlice.length
    if (!cut) {
      toast.success(t('transcript.toastCopied', { defaultValue: 'Copied {{count}} words', count }))
      return
    }

    const rangesByMediaId = buildRemovalRangesByMediaId(selectedSlice)
    const itemIds = Array.from(new Set(selectedSlice.map((token) => token.itemId)))
    try {
      removeTranscriptRangesFromItems(itemIds, rangesByMediaId)
    } catch (error) {
      logger.warn('Transcript cut failed', error)
      toast.error(t('transcript.toastRemoveFailed'))
      return
    }
    anchorIndex = -1
    focusIndex = -1
    toast.success(t('transcript.toastCut', { defaultValue: 'Cut {{count}} words', count }))
  }

  // Bridge Ctrl+C / Ctrl+X to word-level copy/cut. The global clipboard hotkeys
  // fire on the capture phase before this panel sees the key, so we register a
  // handler they consult first — claiming the keys only while the transcript tab
  // is visible and words are selected (otherwise they copy the clip as usual).
  $effect(() => {
    return registerTranscriptCopyHandler({
      isActive: () => active && selectedSlice.length > 0,
      copy: (cut) => handleCopyWords(cut),
    })
  })

  const selectionAllIgnored = $derived(
    selectedSlice.length > 0 && selectedSlice.every((token) => ignoredKeys.has(token.key)),
  )

  // Commit: turn every staged ignore into a real, single undoable timeline edit.
  function handleApply() {
    const ignoredMediaIds = Object.keys(useTranscriptIgnoreStore.getState().ranges)
    if (ignoredMediaIds.length === 0) return

    const ignoredSet = new Set(ignoredMediaIds)
    const affectedOrigins = new Set(
      useItemsStore
        .getState()
        .items.filter((item) => isTranscriptableItem(item) && ignoredSet.has(item.mediaId))
        .map((item) => item.originId ?? item.id),
    )

    let result: { removedItemCount: number } | null = null
    try {
      result = useTranscriptIgnoreStore.getState().commit()
    } catch (error) {
      logger.warn('Transcript apply failed', error)
      toast.error(t('transcript.toastRemoveFailed'))
      return
    }

    anchorIndex = -1
    focusIndex = -1

    if (!result || result.removedItemCount === 0) {
      toast.info(t('transcript.toastNothingRemoved'))
      return
    }

    // Re-select every surviving piece of the edited clips so the document stays whole.
    if (scope === 'selection') {
      const survivors = useItemsStore
        .getState()
        .items.filter((item) => affectedOrigins.has(item.originId ?? item.id))
        .map((item) => item.id)
      if (survivors.length > 0) useSelectionStore.getState().selectItems(survivors)
    }

    toast.success(t('transcript.toastRemoved', { count: result.removedItemCount }))
  }

  function handleRestoreAll() {
    useTranscriptIgnoreStore.getState().clear()
  }

  // Jump to a specific match. Callers own the cursor math (next/prev/Enter) and
  // pass the target index; this normalizes, selects, and records the cursor in a
  // single update so navigation never double-increments.
  function goToMatch(target: number) {
    if (matchSpans.length === 0) return
    const cursor = ((target % matchSpans.length) + matchSpans.length) % matchSpans.length
    const span = matchSpans[cursor]
    if (!span) return
    const token = tokens[span.start]
    if (!token) return
    // Select the whole matched run so a phrase jump highlights the phrase.
    anchorIndex = span.start
    focusIndex = span.end
    seekToToken(token.startFrame)
    const el = scrollEl?.querySelector<HTMLElement>(`[data-token-key="${CSS.escape(token.key)}"]`)
    el?.scrollIntoView({ block: 'center' })
    matchCursor = cursor
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Never hijack typing in the search box (or any input that bubbles here).
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Always own these so they never fall through to the timeline's clip
      // delete — even with no selection (then it's simply a no-op).
      event.preventDefault()
      event.stopPropagation()
      if (selectedKeys.size > 0) handleIgnoreToggle()
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (ignoredSpanCount === 0) return
      event.preventDefault()
      event.stopPropagation()
      handleApply()
    } else if (event.key === 'Escape') {
      anchorIndex = -1
      focusIndex = -1
    }
  }

  const needsTranscription = $derived(
    uniqueMediaIds.filter(
      (id) => mediaState[id]?.status === 'needs' || mediaState[id]?.status === 'error',
    ),
  )
  const isBusy = $derived(
    uniqueMediaIds.some((id) => {
      const status = mediaState[id]?.status
      return status === 'loading' || status === 'transcribing'
    }),
  )

  function handleTranscribe(values: TranscribeDialogValues) {
    const targets = uniqueMediaIds.filter((id) => {
      const status = mediaState[id]?.status
      return status === 'needs' || status === 'error'
    })
    if (targets.length === 0) return

    transcribeDialogOpen = false

    for (const id of targets) requested.add(id)
    const next = { ...mediaState }
    for (const id of targets) next[id] = { status: 'transcribing' }
    mediaState = next

    void Promise.all(
      targets.map(async (mediaId) => {
        try {
          const result = await runMediaTranscriptionJob(mediaId, {
            ...values,
            onModelFallback: () => {
              toast.info(t('transcript.largeTurboFallback'))
            },
          })
          if (!mounted) return
          if (result.status === 'cancelled') {
            mediaState = { ...mediaState, [mediaId]: { status: 'needs' } }
            return
          }
          const { transcript } = result
          mediaState = {
            ...mediaState,
            [mediaId]: hasWordTimings(transcript)
              ? { status: 'ready', transcript }
              : { status: 'needs' },
          }
        } catch (error) {
          logger.warn('Transcription failed', { mediaId, error })
          const errorMessage = isTranscriptionOutOfMemoryError(error)
            ? TRANSCRIPTION_OOM_HINT
            : error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t('transcript.toastTranscribeFailed')
          if (mounted) {
            mediaState = {
              ...mediaState,
              [mediaId]: { status: 'error', errorMessage },
            }
          }
          toast.error(errorMessage)
        }
      }),
    )
  }

  const transcriptionError = $derived(
    needsTranscription
      .map((mediaId) => mediaState[mediaId])
      .find((entry) => entry?.status === 'error')?.errorMessage,
  )

  const transcriptionFileName = $derived.by(() => {
    if (needsTranscription.length !== 1) {
      return t('transcript.selectedClips', {
        defaultValue: '{{count}} selected clips',
        count: needsTranscription.length,
      })
    }
    const mediaId = needsTranscription[0]
    return (
      transcriptableItems.find((item) => item.mediaId === mediaId)?.label ??
      t('transcript.selectedClip', { defaultValue: 'Selected clip' })
    )
  })

  const selectionCount = $derived(selectedKeys.size)
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={rootEl}
  class="flex h-full flex-col outline-none"
  tabindex={-1}
  onkeydown={handleKeyDown}
  onpointerenter={() => (pointerWithin = true)}
  onpointerleave={() => (pointerWithin = false)}
  onfocusin={() => (focusWithin = true)}
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      focusWithin = false
    }
  }}
  role="region"
  aria-label={t('transcript.title')}
>
  <!-- Scope toggle -->
  <div class="flex items-center gap-1 border-b border-border p-2">
    <ScopeToggle {scope} onChange={(next) => (scope = next)} />
  </div>

  <!-- Search -->
  <div class="flex items-center gap-2 border-b border-border p-2">
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={query}
        oninput={(event) => {
          query = event.currentTarget.value
          matchCursor = -1
        }}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            goToMatch(matchCursor + 1)
          }
        }}
        placeholder={t('transcript.searchPlaceholder')}
        class={cn('h-8 pl-7 text-xs', query.length > 0 && 'pr-7')}
      />
      {#if query.length > 0}
        <button
          type="button"
          onclick={() => {
            query = ''
            matchCursor = -1
          }}
          aria-label={t('transcript.clearSearch', { defaultValue: 'Clear search' })}
          class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      {/if}
    </div>
    {#if hasQuery}
      <div class="flex items-center gap-1">
        <span
          class="w-12 text-right text-xs tabular-nums text-muted-foreground"
          data-tooltip={matchesApproximate
            ? t('transcript.approxMatches', { defaultValue: 'Approximate matches' })
            : undefined}
          >{matchesApproximate && matchSpans.length > 0 ? '~' : ''}{matchSpans.length}</span
        >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          disabled={matchSpans.length === 0}
          onclick={() => goToMatch(matchCursor + 1)}
          aria-label={t('transcript.nextMatch')}
        >
          <ChevronDown class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          disabled={matchSpans.length === 0}
          onclick={() => goToMatch(matchCursor - 1)}
          aria-label={t('transcript.previousMatch')}
        >
          <ChevronUp class="h-3.5 w-3.5" />
        </Button>
      </div>
    {/if}
  </div>

  <!-- Transcript body -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={scrollEl}
    onpointermove={handlePointerMove}
    class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2"
  >
    {#if transcriptableItems.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Captions class="h-8 w-8 text-muted-foreground/60" />
        <p class="text-sm text-muted-foreground">
          {scope === 'project'
            ? t('transcript.emptyProject', {
                defaultValue: 'No video or audio clips in this project yet.',
              })
            : t('transcript.emptySelection')}
        </p>
      </div>
    {:else if needsTranscription.length > 0 && tokens.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Captions class="h-8 w-8 text-muted-foreground/60" />
        <div class="max-w-[34ch] space-y-1">
          <p class="text-sm text-muted-foreground">
            {transcriptionError
              ? t('transcript.transcriptionFailed')
              : t('transcript.noTranscript')}
          </p>
          {#if transcriptionError}
            <p class="break-words text-xs leading-5 text-destructive">
              {transcriptionError}
            </p>
          {/if}
        </div>
        <Button size="sm" onclick={() => (transcribeDialogOpen = true)} disabled={isBusy}>
          {#if isBusy}
            <Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
          {/if}
          {isBusy
            ? t('transcript.transcribing')
            : transcriptionError
              ? t('transcript.tryAgain')
              : t('transcript.generate')}
        </Button>
      </div>
    {:else if tokens.length === 0 && isBusy}
      <div class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        {t('transcript.loading')}
      </div>
    {:else}
      <div class="mx-auto max-w-[62ch] select-none">
        {#if sourceCoverage}
          <div
            class="mb-2 flex items-start gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2"
          >
            <CircleCheck class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-foreground">
                {t('transcript.sourceAnalyzed', {
                  defaultValue: 'Full source analyzed',
                })}
              </p>
              <p class="text-[11px] leading-4 text-muted-foreground">
                {t('transcript.detectedRange', {
                  defaultValue:
                    'Voice detected from {{start}} to {{end}}. Silent and music-only sections are omitted.',
                  start: formatTimecode(sourceCoverage.start),
                  end: formatTimecode(sourceCoverage.end),
                })}
              </p>
            </div>
          </div>
        {/if}
        {#each segments as segment (segment.key)}
          <TranscriptSegmentRow
            {segment}
            {tokens}
            activeIndex={activeIndex >= segment.firstIndex && activeIndex <= segment.lastIndex
              ? activeIndex
              : -1}
            {selectedKeys}
            {matchKeys}
            {ignoredKeys}
            {matchesApproximate}
            onSeek={seekToToken}
            onPointerDown={handlePointerDown}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Pending edits bar -->
  {#if ignoredSpanCount > 0}
    <div
      class="@container flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-border bg-secondary/30 px-2 py-1.5"
    >
      <span class="min-w-0 text-xs font-medium text-foreground">
        {t('transcript.pendingHidden', {
          defaultValue: '{{count}} marked for deletion · {{seconds}}s',
          count: ignoredSpanCount,
          seconds: ignoredSeconds.toFixed(1),
        })}
      </span>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          class="h-7 gap-1.5 text-muted-foreground"
          onclick={handleRestoreAll}
          aria-label={t('transcript.restoreAll', { defaultValue: 'Restore all' })}
          data-tooltip={t('transcript.restoreAll', { defaultValue: 'Restore all' })}
        >
          <RotateCcw class="h-3.5 w-3.5" />
          <span class="hidden @[340px]:inline">
            {t('transcript.restoreAll', { defaultValue: 'Restore all' })}
          </span>
        </Button>
        <Button
          size="sm"
          class="h-7 gap-1.5"
          onclick={handleApply}
          aria-label={t('transcript.applyEdits', { defaultValue: 'Delete marked' })}
          data-tooltip={t('transcript.applyEdits', { defaultValue: 'Delete marked' })}
        >
          <Trash2 class="h-3.5 w-3.5" />
          <span class="hidden @[340px]:inline">
            {t('transcript.applyEdits', { defaultValue: 'Delete marked' })}
          </span>
        </Button>
      </div>
    </div>
  {/if}

  <!-- Footer actions -->
  <div
    class="@container flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border p-2"
  >
    <span class="min-w-0 text-xs text-muted-foreground">
      {selectionCount > 0
        ? t('transcript.wordsSelected', { count: selectionCount })
        : t('transcript.ignoreHint', {
            defaultValue: 'Select words, then Backspace to mark them for deletion',
          })}
    </span>
    <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        class="h-7 gap-1.5 px-2 text-muted-foreground"
        onclick={() => handleCopyWords(false)}
        disabled={selectionCount === 0}
        aria-label={t('transcript.copy', { defaultValue: 'Copy' })}
        data-tooltip={t('transcript.copyHint', {
          defaultValue: 'Copy words (paste onto the timeline with Ctrl+V)',
        })}
      >
        <Copy class="h-3.5 w-3.5" />
        <span class="hidden @[340px]:inline">
          {t('transcript.copy', { defaultValue: 'Copy' })}
        </span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        class="h-7 gap-1.5 px-2 text-muted-foreground"
        onclick={() => handleCopyWords(true)}
        disabled={selectionCount === 0}
        aria-label={t('transcript.cut', { defaultValue: 'Cut' })}
        data-tooltip={t('transcript.cut', { defaultValue: 'Cut' })}
      >
        <Scissors class="h-3.5 w-3.5" />
        <span class="hidden @[340px]:inline">
          {t('transcript.cut', { defaultValue: 'Cut' })}
        </span>
      </Button>
      <Button
        size="sm"
        variant="secondary"
        class="gap-1.5"
        onclick={handleIgnoreToggle}
        disabled={selectionCount === 0}
        aria-label={selectionAllIgnored
          ? t('transcript.restoreSelection', { defaultValue: 'Restore' })
          : t('transcript.ignoreSelection', { defaultValue: 'Mark for delete' })}
        data-tooltip={selectionAllIgnored
          ? t('transcript.restoreSelection', { defaultValue: 'Restore' })
          : t('transcript.ignoreSelection', { defaultValue: 'Mark for delete' })}
      >
        {#if selectionAllIgnored}
          <Undo2 class="h-3.5 w-3.5" />
        {:else}
          <Trash2 class="h-3.5 w-3.5" />
        {/if}
        <span class="hidden @[340px]:inline">
          {selectionAllIgnored
            ? t('transcript.restoreSelection', { defaultValue: 'Restore' })
            : t('transcript.ignoreSelection', { defaultValue: 'Mark for delete' })}
        </span>
      </Button>
    </div>
  </div>

  <TranscribeDialog
    open={transcribeDialogOpen}
    onOpenChange={(open) => (transcribeDialogOpen = open)}
    fileName={transcriptionFileName}
    hasTranscript={false}
    isRunning={isBusy}
    progressPercent={null}
    progressLabel={t('transcript.transcribing')}
    onStart={handleTranscribe}
    onCancel={() => {
      for (const mediaId of uniqueMediaIds) cancelMediaTranscriptionJob(mediaId)
    }}
  />
</div>
