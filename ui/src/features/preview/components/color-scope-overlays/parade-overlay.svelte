<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'


</script>

{#each [1, 2] as index (index)}
  <div
    class="absolute top-0 bottom-0 border-l border-slate-400/25"
    style:left={`${(index / 3) * 100}%`}
  ></div>
{/each}
{#each [
        ['R', '16.666%', 'text-red-300/90'],
        ['G', '50%', 'text-emerald-300/90'],
        ['B', '83.333%', 'text-blue-300/90'],
      ] as [label, left, color] (label)}
  <span
    class={cn(
      'absolute top-1 -translate-x-1/2 rounded-sm bg-black/45 px-1 font-mono text-[10px] leading-4',
      color,
    )}
    style:left="{left}px"
  >
    {label}
  </span>
{/each}
