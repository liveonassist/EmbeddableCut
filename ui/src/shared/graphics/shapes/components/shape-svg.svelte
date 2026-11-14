<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ShapePath from './shape-path.svelte'
  import type { BaseShapeProps } from './types'

  // The <svg> every shape component renders its path into.
  let {
    width,
    height,
    path,
    fillDefinition,
    style,
    class: className,
    ...shape
  }: BaseShapeProps & { width: number; height: number; path: string } = $props()
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" overflow="visible" {style} class={className}>
  {@render fillDefinition?.()}
  <ShapePath d={path} {...shape} />
</svg>
