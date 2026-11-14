<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'
  import { select } from '$lib/store.svelte'
  import { useIoRangeReadoutStore } from '@/shared/timeline/io-range/io-range-readout-store'

  /**
   * Floating readout shown at the cursor during an IO drag (mirrors the clip trim
   * readout / TransitionDragTooltip). Mount once, high in the tree — it portals to
   * the editor's portal layer and positions in viewport coords, so a single
   * instance covers every IO surface (Edit ruler, mini-timeline, source monitor).
   */
  const target = portalTarget()
  const readout = select(useIoRangeReadoutStore, (s) => s.readout)
</script>

{#if readout.current}
  <!-- Matches the clip trim readout (TrimInfoOverlay) for a consistent look;
       positioned centered above the cursor rather than anchored to a clip edge. -->
  <Portal to={target}>
    <div
      class="pointer-events-none fixed z-[10000] min-w-[58px] rounded-sm bg-neutral-950/90 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-tight text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-white/15 tabular-nums"
      style:left="{readout.current.x}px"
      style:top="{readout.current.y - 16}px"
      style:transform="translate(-50%, -100%)"
    >
      {readout.current.label}
    </div>
  </Portal>
{/if}
