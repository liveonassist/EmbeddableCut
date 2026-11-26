<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const EMPTY_COMPOSITION_LOOKUP: Record<string, never> = {}
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import type { SubComposition } from '@/features/timeline/stores/compositions-store'
  import { useSettingsStore } from '@/features/timeline/deps/settings'
  import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
  import { useSequencesStore } from '@/features/timeline/stores/sequences-store'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import {
    getCompositionVisualSegments,
    summarizeCompositionClipContent,
    type CompositionVisualSegment,
  } from '@/features/timeline/utils/composition-clip-summary'
  import { hasLinkedAudioCompanion } from '@/shared/utils/linked-media'
  import { formatSignedFrameDelta } from '@/shared/utils/time-utils'
  import { useClipVisibility } from '../../../hooks/use-clip-visibility.svelte'
  import { useTimelineContentPixelsPerSecond } from '../../../contexts/timeline-zoom-context.svelte'
  import ClipTitleText from './clip-title-text.svelte'
  import CompositionFilmstripSegment from './composition-filmstrip-segment.svelte'
  import { loadCompoundClipWaveform } from './lazy-visuals'
  import {
    FILMSTRIP_MIN_WIDTH_PX,
    RENDER_BUFFER,
    WAVEFORM_MIN_WIDTH_PX,
    type ClipContentProps,
  } from './types'

  let {
    item,
    clipLeftFrames,
    clipWidthFrames,
    fps,
    isLinked = false,
    preferImmediateRendering = false,
    linkedSyncOffsetFrames = null,
  }: ClipContentProps = $props()

  // Keep ClipContent measurements on the SETTLED zoom
  // (contentPixelsPerSecond) by default. The clip shell itself resizes smoothly
  // through the live-width percentage geometry layer without rerendering this subtree. Filmstrips
  // remain on this settled geometry and use their cached repeating cover while
  // zoom is live. Mounted waveforms independently sample the live zoom at a
  // bounded redraw cadence, so they stay sharp without putting ClipContent back
  // on the per-frame zoom hot path.
  //
  // preferImmediateRendering (active edit previews — trim/slide) opts back into
  // the live pps so the content tracks the shell frame-for-frame while the user
  // is actively dragging an edge, where the settle lag would be distracting.
  const pixelsPerSecond = useTimelineContentPixelsPerSecond(() => preferImmediateRendering)
  const showWaveforms = select(useSettingsStore, (s) => s.showWaveforms)
  const showVideoFilmstrips = select(
    useSettingsStore,
    (s) => s.showFilmstrips && s.enableFilmstripExtraction,
  )

  const clipLeftPx = $derived(fps > 0 ? (clipLeftFrames / fps) * pixelsPerSecond.current : 0)
  const clipWidth = $derived(
    Math.max(0, fps > 0 ? (clipWidthFrames / fps) * pixelsPerSecond.current : 0),
  )
  // Small safety buffer - clips the excess via overflow:hidden.
  const renderWidth = $derived(Math.ceil(clipWidth * RENDER_BUFFER))
  const clipVisibility = useClipVisibility(
    () => clipLeftPx,
    () => clipWidth,
    () => pixelsPerSecond.current,
  )
  const isCompositionAudioWrapper = $derived(item.type === 'audio' && !!item.compositionId)

  // For composition items: find the topmost video in the sub-comp for filmstrip.
  const compositionId = $derived(
    item.type === 'composition' || isCompositionAudioWrapper ? item.compositionId : undefined,
  )
  const compositionSource = $derived.by(() => {
    const id = compositionId
    return select(useCompositionsStore, (s) => (id ? (s.compositionById[id] ?? null) : null))
  })
  const compositionByIdSource = $derived.by(() => {
    const id = compositionId
    return select(useCompositionsStore, (s) => (id ? s.compositionById : EMPTY_COMPOSITION_LOOKUP))
  })
  // A clip that references a standalone sequence reads "Sequence", a Motion
  // composition reads "Composition", and a classic pre-comp reads "Compound".
  const isSequenceClip = $derived.by(() => {
    const id = compositionId
    return select(useSequencesStore, (s) => (id ? s.topLevelSequenceIds.includes(id) : false))
  })
  const hasCompositionAudioCompanion = $derived.by(() => {
    const current = item
    return select(
      useItemsStore,
      // A compound clip's audio companion shares its linked group: look there, not in every item.
      (s) =>
        current.type === 'composition' &&
        !!current.linkedGroupId &&
        hasLinkedAudioCompanion(s.itemsByLinkedGroupId[current.linkedGroupId] ?? [], current),
    )
  })
  const composition = $derived(compositionSource.current)
  const compositionById = $derived(compositionByIdSource.current)
  const compositionSummary = $derived.by(() => {
    if (!composition) {
      return {
        visualMediaId: null,
        audioMediaId: null,
        hasOwnedAudio: false,
        hasMultipleOwnedAudioSources: false,
        visualSource: null,
      }
    }

    return summarizeCompositionClipContent({
      items: composition.items,
      tracks: composition.tracks,
      fps: composition.fps,
      compositionById,
    })
  })
  const visualSegments = $derived.by<CompositionVisualSegment[]>(() => {
    if (item.type !== 'composition' || !composition) return []
    return getCompositionVisualSegments({
      wrapper: item,
      parentFps: fps,
      compositionById,
    })
  })
  const showCompositionWaveform = $derived(
    showWaveforms.current &&
      compositionSummary.hasOwnedAudio &&
      !hasCompositionAudioCompanion.current,
  )
  const linkedSyncOffsetLabel = $derived(
    linkedSyncOffsetFrames === null ? null : formatSignedFrameDelta(linkedSyncOffsetFrames, fps),
  )

  const compositionSourceDurationFrames = $derived(
    Math.max(1, composition?.durationInFrames ?? item.sourceDuration ?? item.durationInFrames),
  )
  const compositionSourceStartFrames = $derived(
    Math.max(0, item.sourceStart ?? item.trimStart ?? 0),
  )
  const isReversed = $derived(item.isReversed === true)
  const compoundClipTimelineFps = $derived(composition?.fps ?? fps)
  const compoundClipSourceDuration = $derived(
    compositionSourceDurationFrames / compoundClipTimelineFps,
  )
  const compoundClipSourceStart = $derived(compositionSourceStartFrames / compoundClipTimelineFps)
  const compositionKindLabel = $derived(
    composition?.editorKind === 'composite-2d'
      ? 'Composition'
      : isSequenceClip.current
        ? 'Sequence'
        : 'Compound',
  )
  const defaultCompositionLabel = $derived(
    composition?.editorKind === 'composite-2d' ? 'Composition' : 'Compound Clip',
  )

  // Resolve-style visual LOD: a thumbnail needs more real pixel width to remain
  // legible, while a waveform is still useful in a much narrower clip.
  const showFilmstripContent = $derived(clipWidth >= FILMSTRIP_MIN_WIDTH_PX)
  const showWaveformContent = $derived(clipWidth >= WAVEFORM_MIN_WIDTH_PX)
  const showFilmstripRow = $derived(showFilmstripContent && showVideoFilmstrips.current)
  const showWaveformRow = $derived(showWaveformContent && showCompositionWaveform && !!composition)
</script>

{#snippet compositionKindBadge()}<span
    class="shrink-0 rounded bg-violet-950/40 px-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-violet-100/90"
    >{compositionKindLabel}</span
  >{/snippet}

{#snippet compoundClipLabel(label: string)}
  <div
    class="flex items-center gap-1.5 px-2 text-[11px] font-medium truncate shrink-0"
    style:height={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
    style:line-height={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  >
    <!-- Badge sits after the link icon so the link icon stays flush-left like
         every other clip's label row. -->
    <ClipTitleText {label} badge={compositionKindBadge} {isLinked} {linkedSyncOffsetLabel} />
  </div>
{/snippet}

{#snippet compoundClipWaveform(composition: SubComposition)}
  {#await loadCompoundClipWaveform() then CompoundClipWaveform}
    <CompoundClipWaveform
      {composition}
      {clipWidth}
      {renderWidth}
      sourceStart={compoundClipSourceStart}
      sourceDuration={compoundClipSourceDuration}
      isVisible={clipVisibility.current.isVisible}
      visibleStartRatio={clipVisibility.current.visibleStartRatio}
      visibleEndRatio={clipVisibility.current.visibleEndRatio}
    />
  {/await}
{/snippet}

{#if isCompositionAudioWrapper && composition}
  <div class="absolute inset-0 flex flex-col">
    {@render compoundClipLabel(item.label || defaultCompositionLabel)}
    {#if showWaveformContent && showWaveforms.current}
      <div class="relative overflow-hidden bg-waveform-gradient flex-1 min-h-0">
        {@render compoundClipWaveform(composition)}
      </div>
    {/if}
  </div>
{:else if item.type === 'composition'}
  <!-- Composition item - multi-segment filmstrip from visible sub-comp videos, or label
       fallback -->
  {#if visualSegments.length > 0}
    <div class="absolute inset-0 flex flex-col">
      {@render compoundClipLabel(item.label || defaultCompositionLabel)}
      {#if showFilmstripRow}
        <div class="relative overflow-hidden flex-1 min-h-0">
          {#each visualSegments as segment (segment.itemId)}
            <CompositionFilmstripSegment
              {segment}
              wrapperDurationFrames={item.durationInFrames}
              wrapperClipWidthPx={clipWidth}
              wrapperRenderWidthPx={renderWidth}
              wrapperVisibleStartRatio={clipVisibility.current.visibleStartRatio}
              wrapperVisibleEndRatio={clipVisibility.current.visibleEndRatio}
              wrapperIsVisible={clipVisibility.current.isVisible}
              {fps}
              pixelsPerSecond={pixelsPerSecond.current}
              {preferImmediateRendering}
              {isReversed}
            />
          {/each}
        </div>
      {/if}
      {#if showWaveformRow && composition}
        <div
          class={`relative overflow-hidden bg-waveform-gradient ${
            showFilmstripRow ? '' : 'flex-1 min-h-0'
          }`}
          style:height={showFilmstripRow
            ? EDITOR_LAYOUT_CSS_VALUES.timelineWaveformRowHeight
            : undefined}
        >
          {@render compoundClipWaveform(composition)}
        </div>
      {/if}
    </div>
  {:else if compositionSummary.hasOwnedAudio &&
    composition &&
    !hasCompositionAudioCompanion.current}
    <div class="absolute inset-0 flex flex-col">
      {@render compoundClipLabel(item.label || defaultCompositionLabel)}
      {#if showWaveformContent && showWaveforms.current}
        <div class="relative overflow-hidden bg-waveform-gradient flex-1 min-h-0">
          {@render compoundClipWaveform(composition)}
        </div>
      {/if}
    </div>
  {:else}
    <div class="absolute inset-0 flex flex-col overflow-hidden">
      {@render compoundClipLabel(item.label || defaultCompositionLabel)}
    </div>
  {/if}
{:else}
  <!-- Missing composition data keeps the legacy simple-label fallback. -->
  <div class="px-2 py-1 text-xs font-medium truncate">{item.label}</div>
{/if}
