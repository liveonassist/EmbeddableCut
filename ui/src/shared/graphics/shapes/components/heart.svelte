<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeHeart } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Heart shape component */
  let { height, ...shape }: BaseShapeProps & { height: number } = $props()

  const result = $derived(makeHeart({ height }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
