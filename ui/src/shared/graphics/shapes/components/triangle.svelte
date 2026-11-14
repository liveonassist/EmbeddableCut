<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeTriangle } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Triangle shape component */
  let {
    length,
    direction = 'up',
    cornerRadius = 0,
    ...shape
  }: BaseShapeProps & {
    length: number
    direction?: 'up' | 'down' | 'left' | 'right'
    cornerRadius?: number
  } = $props()

  const result = $derived(makeTriangle({ length, direction, cornerRadius }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
