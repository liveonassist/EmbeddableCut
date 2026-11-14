<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeRect } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Rectangle shape component */
  let {
    width,
    height,
    cornerRadius = 0,
    ...shape
  }: BaseShapeProps & { width: number; height: number; cornerRadius?: number } = $props()

  const path = $derived(makeRect({ width, height, cornerRadius }).path)
</script>

<ShapeSvg {width} {height} {path} {...shape} />
