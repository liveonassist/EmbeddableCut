<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { useRafDeferredValue } from '@/shared/hooks/use-raf-deferred-value.svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { getDemotionAwarePixelsPerSecond } from '@/features/timeline/utils/timeline-dom-density'
  import { JOIN_INDICATOR_MIN_ZOOM_PPS, setTimelineJoinIndicatorsEnabled } from './context'

  let { children }: { children: Snippet } = $props()

  const enabledAtRenderZoom = select(useZoomStore, (state) => {
    return (
      getDemotionAwarePixelsPerSecond(
        state.contentPixelsPerSecond,
        state.pixelsPerSecond,
        state.isZoomInteracting,
      ) >= JOIN_INDICATOR_MIN_ZOOM_PPS
    )
  })
  const deferredEnabled = useRafDeferredValue(() => enabledAtRenderZoom.current)
  // Promotion can wait a frame, but zoom-out demotion must be immediate so even
  // a saturated split cohort removes its indicator leaves before the settle commit.
  const enabled = $derived(enabledAtRenderZoom.current && deferredEnabled.current)

  setTimelineJoinIndicatorsEnabled({
    get current() {
      return enabled
    },
  })
</script>

{@render children()}
