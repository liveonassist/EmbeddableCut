<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeStar } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Star shape component */
  let {
    points,
    outerRadius,
    innerRadius,
    cornerRadius = 0,
    ...shape
  }: BaseShapeProps & {
    points: number
    outerRadius: number
    innerRadius: number
    cornerRadius?: number
  } = $props()

  const result = $derived(makeStar({ points, outerRadius, innerRadius, cornerRadius }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
