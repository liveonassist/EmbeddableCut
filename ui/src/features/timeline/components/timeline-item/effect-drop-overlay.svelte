<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  interface EffectDropOverlayProps {
    multiDropCount: number
  }

  let { multiDropCount }: EffectDropOverlayProps = $props()
</script>

<div
  class="absolute inset-0 rounded pointer-events-none z-20 border border-dashed border-sky-300/90 bg-sky-400/15 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.35)]"
>
  {#if multiDropCount > 1}
    <div
      class="absolute top-1 right-1 rounded-full bg-sky-300/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-950"
    >
      {multiDropCount} clips
    </div>
  {/if}
</div>
