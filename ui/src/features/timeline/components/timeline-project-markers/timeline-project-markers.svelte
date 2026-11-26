<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'

  // Stores and selectors
  import { useMarkersStore } from '@/features/timeline/stores/markers-store'
  import { updateMarker } from '@/features/timeline/stores/timeline-actions'
  import { useSelectionStore } from '@/shared/state/selection'

  // Utilities and hooks
  import { useTimelineCommittedZoomContext } from '../../contexts/timeline-zoom-context.svelte'
  import { resolveMarkerNames } from '@/shared/timeline/marker-names'
  import { pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { setGlobalCursorStyle } from '@/shared/ui/global-cursor-roots'
  import MarkerIndicator from './marker-indicator.svelte'

  /**
   * Timeline Project Markers Component
   *
   * Renders user-created markers on the timeline ruler
   * - Triangle handles pointing down (like playhead diamond but inverted)
   * - Vertical line across the ruler
   * - Draggable for repositioning
   * - Shows the marker's label on hover
   */
  const markers = select(useMarkersStore, (s) => s.markers)
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)
  const selectMarker = select(useSelectionStore, (s) => s.selectMarker)
  const zoom = useTimelineCommittedZoomContext()

  let draggingId = $state<string | null>(null)
  let container = $state<HTMLDivElement | null>(null)

  const markerNames = $derived(
    resolveMarkerNames(markers.current, (index) => t('timeline.markerName', { index })),
  )

  // Handle drag start and selection
  const handleMouseDown = (e: MouseEvent, markerId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Select the marker (clears any clip selection)
    selectMarker.current(markerId)
    draggingId = markerId
  }

  // Handle dragging
  $effect(() => {
    const activeDraggingId = draggingId
    if (!activeDraggingId) return

    return untrack(() => {
      const restoreCursor = setGlobalCursorStyle('cursor', 'grabbing')
      const markerFrame = () =>
        useMarkersStore.getState().markers.find((marker) => marker.id === activeDraggingId)?.frame
      const startFrame = markerFrame()

      // The drag moves the marker in the store and commits once on release,
      // so it costs one undo step instead of one per frame it crossed.
      const handleMouseMove = (e: MouseEvent) => {
        const ruler = container?.closest('.timeline-ruler')
        if (!ruler) return

        const rect = ruler.getBoundingClientRect()
        const x = e.clientX - rect.left
        const frame = Math.max(0, pixelsToFrameNow(x))

        if (frame !== markerFrame()) useMarkersStore.getState().updateMarker(activeDraggingId, { frame })
      }

      const commit = () => {
        const frame = markerFrame()
        if (startFrame === undefined || frame === undefined || frame === startFrame) return
        useMarkersStore.getState().updateMarker(activeDraggingId, { frame: startFrame })
        updateMarker(activeDraggingId, { frame })
      }

      const handleMouseUp = () => {
        draggingId = null
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        restoreCursor()
        commit()
      }
    })
  })
</script>

{#if markers.current.length > 0}
  <div bind:this={container} class="absolute inset-0 pointer-events-none">
    {#each markers.current as marker (marker.id)}
      <MarkerIndicator
        {marker}
        markerId={marker.id}
        name={markerNames.get(marker.id) ?? ''}
        leftPosition={zoom.frameToPixels(marker.frame)}
        isDragging={draggingId === marker.id}
        isSelected={selectedMarkerId.current === marker.id}
        onMouseDown={handleMouseDown}
      />
    {/each}
  </div>
{/if}
