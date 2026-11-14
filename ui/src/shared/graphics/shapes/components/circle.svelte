<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeCircle } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Circle shape component */
  let { radius, ...shape }: BaseShapeProps & { radius: number } = $props()

  const result = $derived(makeCircle({ radius }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
