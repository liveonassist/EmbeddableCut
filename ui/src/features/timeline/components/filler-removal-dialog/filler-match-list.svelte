<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Label } from '@/components/ui/label'
  import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { FillerRange } from '@/features/timeline/utils/filler-word-removal-preview'
  import {
    getItemSourceSpanSeconds,
    sourceSecondsToTimelineFrame,
  } from '@/features/timeline/utils/media-item-frames'
  import { formatTimestamp, getConfidenceClass, getRangeId } from './filler-removal-dialog-model'

  interface Props {
    itemIds: readonly string[]
    rangesByMediaId: Record<string, FillerRange[]>
    selectedRangeIds: ReadonlySet<string>
    onToggleRange: (id: string) => void
  }

  let { itemIds, rangesByMediaId, selectedRangeIds, onToggleRange }: Props = $props()

  const mediaById = select(useMediaLibraryStore, (state) => state.mediaById)
  const itemsById = select(useItemsStore, (state) => state.itemById)
  const timelineFps = select(useTimelineSettingsStore, (state) => state.fps)
  const matches = $derived(
    Object.entries(rangesByMediaId)
      .flatMap(([mediaId, ranges]) =>
        ranges.map((range, index) => ({
          id: getRangeId(mediaId, range, index),
          mediaId,
          range,
          media: mediaById.current[mediaId],
        })),
      )
      .toSorted((left, right) => {
        const mediaCompare = (left.media?.fileName ?? left.mediaId).localeCompare(
          right.media?.fileName ?? right.mediaId,
        )
        return mediaCompare !== 0 ? mediaCompare : left.range.start - right.range.start
      }),
  )

  function handlePlayRange(mediaId: string, range: FillerRange) {
    const fps = timelineFps.current
    const items = itemsById.current
    const item = itemIds
      .map((id) => items[id])
      .find((candidate) => {
        if (!candidate || (candidate.type !== 'video' && candidate.type !== 'audio')) {
          return false
        }
        if (candidate.mediaId !== mediaId) return false
        const span = getItemSourceSpanSeconds(candidate, fps)
        return span !== null && range.start < span.end && range.end > span.start
      })

    if (!item) return

    const playback = usePlaybackStore.getState()
    const startFrame = sourceSecondsToTimelineFrame(item, range.start, fps)
    const endFrame = sourceSecondsToTimelineFrame(item, range.end, fps)
    const durationMs = Math.max(
      300,
      Math.min(3000, (Math.max(1, endFrame - startFrame) / fps) * 1000 + 180),
    )

    playback.setCurrentFrame(startFrame)
    playback.play()
    window.setTimeout(() => {
      const current = usePlaybackStore.getState()
      if (current.currentFrame >= startFrame && current.currentFrame <= endFrame + 2) {
        current.pause()
      }
    }, durationMs)
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <Label class="text-xs font-medium">{t('timeline.fillerRemoval.found')}</Label>
    <span class="text-xs text-muted-foreground">{matches.length}</span>
  </div>
  <div class="max-h-36 overflow-y-auto rounded-md border bg-muted/20">
    {#if matches.length === 0}
      <div class="px-3 py-2 text-xs text-muted-foreground">
        {t('timeline.fillerRemoval.noEntriesFound')}
      </div>
    {:else}
      {#each matches as { id, mediaId, media, range } (id)}
        <div
          class="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0 hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selectedRangeIds.has(id)}
            onchange={() => onToggleRange(id)}
            class="h-4 w-4 shrink-0"
            aria-label={t('timeline.fillerRemoval.includeRange', {
              text: range.text || t('timeline.fillerRemoval.fillerRange'),
            })}
          />
          <button
            type="button"
            onclick={() => handlePlayRange(mediaId, range)}
            class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            title={t('timeline.fillerRemoval.playThisRange')}
          >
            <span class="min-w-0">
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate font-medium">
                  {range.text || t('timeline.fillerRemoval.filler')}
                </span>
                {#if range.audioConfidence}
                  <span
                    class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none {getConfidenceClass(
                      range.audioConfidence.level,
                    )}"
                  >
                    {t(`timeline.fillerRemoval.confidence.${range.audioConfidence.level}`)}
                  </span>
                {/if}
              </span>
              <span class="block truncate text-muted-foreground">
                {media?.fileName ?? mediaId}
              </span>
            </span>
            <span class="shrink-0 tabular-nums text-muted-foreground">
              {formatTimestamp(range.start)}
            </span>
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>
