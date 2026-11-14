<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { makeEllipse } from '@/shared/graphics/shapes/shape-generators'
  import ShapeSvg from './shape-svg.svelte'
  import type { BaseShapeProps } from './types'

  /** Ellipse shape component */
  let { rx, ry, ...shape }: BaseShapeProps & { rx: number; ry: number } = $props()

  const result = $derived(makeEllipse({ rx, ry }))
</script>

<ShapeSvg width={result.width} height={result.height} path={result.path} {...shape} />
