<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Timeline Guidelines Component
   *
   * Renders vertical snap line for the active snap target during drag operations
   * - Green line for magnetic snap (item edges)
   * - Primary color for playhead snap
   *
   * Only shows when actively snapping to magnetic or playhead targets
   */
  import { useSelectionStore } from '@/shared/state/selection'
  import type { SnapTarget } from '@/features/timeline/types/drag'
  import { useTimelineZoomContext } from '../contexts/timeline-zoom-context.svelte'

  const zoom = useTimelineZoomContext()
  let containerEl = $state<HTMLDivElement | null>(null)
  let lineEl = $state<HTMLDivElement | null>(null)
  let activeSnapTarget: SnapTarget | null = useSelectionStore.getState().activeSnapTarget

  function syncGuideline(target: SnapTarget | null) {
    const container = containerEl
    const line = lineEl
    if (!container || !line) {
      return
    }

    if (!target) {
      container.style.display = 'none'
      return
    }

    const isMagnetic = target.type === 'item-start' || target.type === 'item-end'
    const isPlayhead = target.type === 'playhead'
    if (!isMagnetic && !isPlayhead) {
      container.style.display = 'none'
      return
    }

    container.style.display = ''
    line.style.left = `${zoom.frameToPixels(target.frame)}px`
  }

  $effect(() => {
    // Re-sync when the zoom changes; the store subscription covers snap changes.
    void zoom.pixelsPerSecond
    void zoom.fps
    void containerEl
    void lineEl
    syncGuideline(activeSnapTarget)

    return useSelectionStore.subscribe((state, previous) => {
      if (state.activeSnapTarget === previous.activeSnapTarget) {
        return
      }

      activeSnapTarget = state.activeSnapTarget
      syncGuideline(state.activeSnapTarget)
    })
  })
</script>

<div
  bind:this={containerEl}
  class="absolute inset-0 pointer-events-none"
  style="z-index: 10000; display: none"
>
  <div
    bind:this={lineEl}
    class="absolute top-0 bottom-0 w-px"
    style="background-color: var(--color-timeline-snap); opacity: 0.9; box-shadow: 0 0 4px var(--color-timeline-snap)"
  ></div>
</div>
