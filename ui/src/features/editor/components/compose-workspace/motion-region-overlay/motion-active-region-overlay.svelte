<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useMarkersStore } from '@/features/editor/deps/timeline-store'
  import { clampPercent, toPercent, type MotionRegionViewport } from './shared'

  /**
   * Layer-row shading: everything outside the active (in/out) region, and
   * everything past the end of the comp.
   */
  let {
    viewport,
    compositionEndFrame,
    testId = 'motion-active-region-overlay',
    compositionEndTestId = 'motion-comp-end-dim',
  }: {
    viewport: MotionRegionViewport
    compositionEndFrame: number | null
    testId?: string
    compositionEndTestId?: string
  } = $props()

  const inPoint = select(useMarkersStore, (s) => s.inPoint)
  const outPoint = select(useMarkersStore, (s) => s.outPoint)

  const hasActiveRegion = $derived(
    inPoint.current !== null && outPoint.current !== null && outPoint.current > inPoint.current,
  )
  const inPercent = $derived(
    hasActiveRegion ? clampPercent(toPercent(inPoint.current ?? 0, viewport)) : 0,
  )
  const outPercent = $derived(
    hasActiveRegion ? clampPercent(toPercent(outPoint.current ?? 0, viewport)) : 100,
  )
  const compEndPercent = $derived(
    compositionEndFrame === null ? 100 : clampPercent(toPercent(compositionEndFrame, viewport)),
  )
</script>

<div aria-hidden="true" data-testid={testId} class="pointer-events-none absolute inset-0 overflow-hidden">
  {#if hasActiveRegion}
    <div
      data-from-frame={0}
      data-to-frame={inPoint.current ?? 0}
      data-motion-viewport-clamp
      class="absolute inset-y-0 bg-background/45"
      style:left="0px"
      style:width="{inPercent}%"
    ></div>
  {/if}

  {#if hasActiveRegion}
    <div
      data-from-frame={outPoint.current ?? 0}
      data-motion-viewport-clamp
      class="absolute inset-y-0 bg-background/45"
      style:left="{outPercent}%"
      style:right="0px"
    ></div>
  {/if}

  {#if compositionEndFrame !== null}
    <div
      data-testid={compositionEndTestId}
      data-from-frame={compositionEndFrame ?? 0}
      data-motion-viewport-clamp
      class="absolute inset-y-0 border-l border-border/80 bg-background/55"
      style:left="{compEndPercent}%"
      style:right="0px"
    ></div>
  {/if}
</div>
