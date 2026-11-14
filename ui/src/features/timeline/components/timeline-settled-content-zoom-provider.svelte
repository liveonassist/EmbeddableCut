<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { setSettledContentPixelsPerSecondContext } from '../contexts/timeline-zoom-context.svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'

  /**
   * Bridges the synchronous external zoom store into the settled content
   * geometry rich clip content reads.
   *
   * React keeps this update behind a transition so filmstrips and waveforms
   * commit atomically instead of popping clip-by-clip; Svelte applies one
   * batched update to every reader, so the bridge publishes the settled value
   * directly, and the live zoom of an ongoing gesture never reaches rich content.
   */
  let { children }: { children?: Snippet } = $props()

  let pixelsPerSecond = $state(useZoomStore.getState().contentPixelsPerSecond)

  setSettledContentPixelsPerSecondContext({
    get current() {
      return pixelsPerSecond
    },
  })

  $effect.pre(() => {
    const unsubscribe = useZoomStore.subscribe((state, previousState) => {
      if (state.contentPixelsPerSecond === previousState.contentPixelsPerSecond) return
      pixelsPerSecond = state.contentPixelsPerSecond
    })
    const current = useZoomStore.getState().contentPixelsPerSecond
    if (current !== untrack(() => pixelsPerSecond)) pixelsPerSecond = current
    return unsubscribe
  })
</script>

{@render children?.()}
