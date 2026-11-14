<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { clampPercent, toPercent, type MotionRegionViewport } from './shared'

  /** Ruler decoration that dims the inspectable axis past the authored comp end. */
  let {
    viewport,
    compositionEndFrame,
  }: {
    viewport: MotionRegionViewport
    compositionEndFrame: number
  } = $props()

  const endPercent = $derived(clampPercent(toPercent(compositionEndFrame, viewport)))
</script>

<div
  aria-hidden="true"
  data-testid="motion-comp-end-ruler-dim"
  data-from-frame={compositionEndFrame}
  data-motion-viewport-clamp
  class="pointer-events-none absolute inset-y-0 border-l border-border/80 bg-background/60"
  style:left="{endPercent}%"
  style:right="0px"
></div>
