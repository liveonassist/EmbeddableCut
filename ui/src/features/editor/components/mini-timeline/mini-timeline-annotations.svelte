<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { resolveMarkerNames } from '@/shared/timeline/marker-names'
  import type {
    TimelineAnnotationMarker,
    TimelineAnnotationModel,
  } from '@/shared/timeline/timeline-annotations'

  interface MiniTimelineAnnotationsProps {
    model: TimelineAnnotationModel
    selectedMarkerId: string | null
    onMarkerPress: (marker: TimelineAnnotationMarker) => void
    labelWidth: number
    testIdPrefix: string
  }

  /**
   * Track-spanning annotations for the mini timeline: clickable marker flags over
   * the ruler + track rows. The IO range strip + handles live in
   * MiniTimelineIoLane; the in/out guide lines are intentionally not drawn
   * here so the rows stay uncluttered.
   */
  let { model, selectedMarkerId, onMarkerPress, labelWidth, testIdPrefix }: MiniTimelineAnnotationsProps =
    $props()

  const markerNames = $derived(
    resolveMarkerNames(model.markers, (index) => t('timeline.markerName', { index })),
  )
</script>

<div
  class="pointer-events-none absolute bottom-0 right-0 top-0"
  data-testid={`${testIdPrefix}-annotations`}
  style:left="{labelWidth}px"
>
  {#each model.markers as marker (marker.id)}
    {@const selected = selectedMarkerId === marker.id}
    {@const name = markerNames.get(marker.id)}
    <button
      type="button"
      class="pointer-events-auto absolute bottom-0 top-0 z-[14] w-5 -translate-x-1/2 cursor-pointer"
      data-testid={`${testIdPrefix}-marker`}
      data-marker-id={marker.id}
      style:left="{marker.positionRatio * 100}%"
      title={name}
      aria-label={name}
      onpointerdown={(event) => {
        event.stopPropagation()
        if (event.button !== 0) return
        onMarkerPress(marker)
      }}
      onclick={(event) => {
        event.stopPropagation()
        // Mouse clicks are already handled by onpointerdown; only act on
        // keyboard activation (Enter/Space), which has detail === 0.
        if (event.detail !== 0) return
        onMarkerPress(marker)
      }}
    >
      <span
        class={`absolute bottom-0 top-4 left-1/2 w-px -translate-x-1/2 ${selected ? 'bg-white' : 'bg-white/45'}`}
        aria-hidden="true"
      ></span>
      <span
        class="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[9px] border-x-transparent drop-shadow"
        style:border-top-color={selected ? '#ffffff' : marker.color}
        aria-hidden="true"
      ></span>
      {#if selected}
        <span
          class="absolute left-1/2 top-[2px] h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[6px] border-x-transparent"
          style:border-top-color={marker.color}
          aria-hidden="true"
        ></span>
      {/if}
    </button>
  {/each}
</div>
