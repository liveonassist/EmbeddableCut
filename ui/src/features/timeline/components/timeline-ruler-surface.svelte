<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import TimelineMarkers from './timeline-markers.svelte'
  import { applyTimelineLiveGeometry } from '@/features/timeline/utils/timeline-live-geometry'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'

  interface TimelineRulerSurfaceProps {
    duration: number
    containerWidth: number
    initialWidth: number
    /** The ruler element, bound out so siblings (the unified playhead) share its origin. */
    coordinateSurface?: HTMLDivElement | null
  }

  /**
   * Keeps live wheel zoom local to the ruler instead of re-rendering the entire
   * TimelineContent tree. TimelineMarkers still receives live zoom from its own
   * focused store subscription, while this shell updates width imperatively.
   */
  let {
    duration,
    containerWidth,
    initialWidth,
    coordinateSurface = $bindable(null),
  }: TimelineRulerSurfaceProps = $props()

  let committedSurface = $state<HTMLDivElement | null>(null)

  const applyRulerZoom = () => {
    const outer = coordinateSurface
    const surface = committedSurface
    if (!outer || !surface) return
    const { pixelsPerSecond } = useZoomStore.getState()
    applyTimelineLiveGeometry({
      outer,
      surface,
      duration,
      viewportWidth: containerWidth,
      livePixelsPerSecond: pixelsPerSecond,
    })
  }

  $effect(() => {
    void [containerWidth, duration, coordinateSurface, committedSurface]
    untrack(applyRulerZoom)
  })

  $effect(() =>
    useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond !== previousState.pixelsPerSecond) {
        applyRulerZoom()
      }
    }),
  )
</script>

<div
  bind:this={coordinateSurface}
  class="relative z-30 shrink-0 timeline-ruler bg-background"
  style:width="{initialWidth}px"
  style:height={EDITOR_LAYOUT_CSS_VALUES.timelineRulerHeight}
>
  <div
    bind:this={committedSurface}
    data-timeline-committed-surface="ruler"
    class="absolute inset-y-0 left-0"
    style:width="{initialWidth}px"
    style:contain="layout style paint"
  >
    <TimelineMarkers {duration} />
  </div>
</div>
