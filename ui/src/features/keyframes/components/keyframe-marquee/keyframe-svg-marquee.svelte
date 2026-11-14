<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { KeyframeMarqueeRect } from './types'

  let { rect }: { rect: KeyframeMarqueeRect | null } = $props()
</script>

{#if rect}
  <rect
    class="text-primary"
    x={rect.x}
    y={rect.y}
    width={rect.width}
    height={rect.height}
    fill="currentColor"
    fill-opacity={0.2}
    pointer-events="none"
    stroke="currentColor"
    stroke-opacity={0.7}
    stroke-width={1}
  />
{/if}
