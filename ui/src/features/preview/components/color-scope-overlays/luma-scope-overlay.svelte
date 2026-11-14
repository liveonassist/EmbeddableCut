<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { SCOPE_LUMA_GUIDES } from '../color-scope-overlay-data'
  import ParadeOverlay from './parade-overlay.svelte'

  let { parade, histogram }: { parade: boolean; histogram: boolean } = $props()
</script>

<div aria-hidden="true" class="pointer-events-none absolute inset-0">
  {#each SCOPE_LUMA_GUIDES as level (level)}
    {@const top = `${100 - level}%`}
    <div
      class="absolute left-0 right-0 border-t border-slate-400/18"
      style:top="{top}px"
    >
      <span
        class="absolute left-1 -translate-y-1/2 rounded-sm bg-black/45 px-1 font-mono text-[9px] leading-4 text-slate-300/80"
      >
        {level}
      </span>
    </div>
  {/each}
  {#if histogram}
    <div
      class="absolute bottom-1 left-1 font-mono text-[9px] text-slate-400/80"
    >
      0
    </div>
    <div
      class="absolute bottom-1 right-1 font-mono text-[9px] text-slate-400/80"
    >
      255
    </div>
  {/if}
  {#if parade}
    <ParadeOverlay />
  {/if}
</div>
