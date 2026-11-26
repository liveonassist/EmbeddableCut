<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import {
    clearAllMarkers,
    removeMarker,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { cn } from '@/shared/ui/cn'
  import { formatTimecodeDotFrames } from '@/shared/utils/time-utils'
  import { resolveMarkerNames } from '@/shared/timeline/marker-names'
  import { PropertySection } from '../components'

  /**
   * List of all project markers, sorted by frame. Provides the global "manage
   * markers" surface that the per-marker MarkerPanel lacks: click a row to select
   * the marker and seek the playhead to it, remove individual markers, or clear
   * all. Rendered both below the individual editor in MarkerPanel and in
   * CanvasPanel (the default panel), so markers are reachable regardless of
   * selection state.
   */
  let { defaultOpen = true }: { defaultOpen?: boolean } = $props()

  const markers = select(useMarkersStore, (s) => s.markers)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)

  // Don't mutate the store array; sort a copy for stable display order.
  const sortedMarkers = $derived([...markers.current].sort((a, b) => a.frame - b.frame))

  const markerNames = $derived(
    resolveMarkerNames(markers.current, (index) => t('timeline.markerName', { index })),
  )

  const handleSelect = (id: string, frame: number) => {
    useSelectionStore.getState().selectMarker(id)
    usePlaybackStore.getState().setCurrentFrame(frame)
  }

  const handleRemove = (e: MouseEvent, id: string) => {
    e.stopPropagation()
    removeMarker(id)
    // Only drop selection if we just deleted the selected marker.
    if (useSelectionStore.getState().selectedMarkerId === id) {
      useSelectionStore.getState().clearSelection()
    }
  }

  const handleClearAll = () => {
    clearAllMarkers()
    useSelectionStore.getState().clearSelection()
  }
</script>

<PropertySection title={t('editor.markerList.title')} icon={MapPin} {defaultOpen}>
  {#if sortedMarkers.length === 0}
    <div class="px-2 py-3 text-center">
      <p class="text-xs text-muted-foreground">{t('editor.markerList.empty')}</p>
      <p class="mt-1 text-[10px] leading-tight text-muted-foreground/70">
        {t('editor.markerList.emptyHint')}
      </p>
    </div>
  {:else}
    <div class="space-y-0.5">
      {#each sortedMarkers as marker (marker.id)}
        {@const isActive = marker.id === selectedMarkerId.current}
        <div
          class={cn(
            'group flex items-center h-7 rounded-md transition-colors',
            isActive ? 'bg-secondary' : 'hover:bg-secondary/50',
          )}
        >
          <button
            type="button"
            onclick={() => handleSelect(marker.id, marker.frame)}
            class="flex-1 min-w-0 flex items-center gap-2 h-full pl-2 pr-1 text-left"
          >
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
              style:background-color={marker.color}
            ></span>
            <span class="flex-1 min-w-0 truncate text-xs">
              {markerNames.get(marker.id)}
            </span>
            <span class="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
              {formatTimecodeDotFrames(marker.frame, fps.current)}
            </span>
          </button>
          <button
            type="button"
            onclick={(e) => handleRemove(e, marker.id)}
            class="shrink-0 grid place-items-center w-6 h-full rounded-r-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition-opacity"
            aria-label={t('editor.markerList.remove')}
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      {/each}
      <div class="pt-1.5 px-2">
        <button
          type="button"
          onclick={handleClearAll}
          class="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
        >
          {t('editor.markerList.clearAll')}
        </button>
      </div>
    </div>
  {/if}
</PropertySection>
