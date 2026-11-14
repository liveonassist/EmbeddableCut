<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { SnapLine } from '@/features/preview/utils/canvas-snap-utils'
  import type { CoordinateParams } from '@/features/preview/types/gizmo'
  import { getEffectiveScale } from '@/features/preview/utils/coordinate-transform'

  interface SnapGuidesProps {
    snapLines: SnapLine[]
    coordParams: CoordinateParams
  }

  let { snapLines, coordParams }: SnapGuidesProps = $props()
  const scale = $derived.by(() => getEffectiveScale(coordParams))
</script>

{#each snapLines as line, index (`${line.type === 'vertical' ? 'v' : 'h'}-${index}-${line.position}`)}
  {@const screenPos = line.position * scale}
  {#if line.type === 'vertical'}
    <div
      class="absolute pointer-events-none"
      style:left="{screenPos}px"
      style:top="0"
      style:width="1px"
      style:height="100%"
      style:background-color="#f472b6"
      style:box-shadow="0 0 4px #f472b6"
    >
      <!-- Label -->
      {#if line.label}
        <span
          class="absolute text-xs font-medium px-1 rounded"
          style:top="4px"
          style:left="4px"
          style:background-color="#f472b6"
          style:color="white"
          style:font-size="10px"
          style:white-space="nowrap"
        >
          {line.label}
        </span>
      {/if}
    </div>
  {:else}
    <!-- Horizontal line -->
    <div
      class="absolute pointer-events-none"
      style:left="0"
      style:top="{screenPos}px"
      style:width="100%"
      style:height="1px"
      style:background-color="#f472b6"
      style:box-shadow="0 0 4px #f472b6"
    >
      <!-- Label -->
      {#if line.label}
        <span
          class="absolute text-xs font-medium px-1 rounded"
          style:left="4px"
          style:top="4px"
          style:background-color="#f472b6"
          style:color="white"
          style:font-size="10px"
          style:white-space="nowrap"
        >
          {line.label}
        </span>
      {/if}
    </div>
  {/if}
{/each}
