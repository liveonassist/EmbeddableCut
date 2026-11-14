<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makePolygon } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Polygon shape component */
  let {
    points,
    radius,
    cornerRadius = 0,
    ...shape
  }: BaseShapeProps & { points: number; radius: number; cornerRadius?: number } = $props()

  const result = $derived(makePolygon({ points, radius, cornerRadius }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
