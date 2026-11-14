<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  interface TransitionDropGhostProps {
    ghost: {
      left: number
      width: number
      cutOffset: number
    } | null
  }

  let { ghost }: TransitionDropGhostProps = $props()
</script>

{#if ghost}
  <div
    class="absolute inset-y-0 pointer-events-none overflow-hidden rounded-sm border border-slate-100/80 shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
    style:left="{ghost.left}px"
    style:width="{ghost.width}px"
    style:z-index="35"
    style:background="rgba(248,250,252,0.08)"
  >
    <div
      class="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.08),rgba(255,255,255,0.02)_48%,rgba(255,255,255,0.02)_52%,rgba(248,250,252,0.08))]"
    ></div>
    <div
      class="absolute top-0 bottom-0 w-px bg-slate-50/90"
      style:left="{ghost.cutOffset}px"
    ></div>
    <div class="absolute inset-x-0 top-0 h-px bg-white/60"></div>
    <div class="absolute inset-x-0 bottom-0 h-px bg-slate-900/20"></div>
  </div>
{/if}
