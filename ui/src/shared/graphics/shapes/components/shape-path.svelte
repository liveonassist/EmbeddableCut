<!-- SPDX-License-Identifier: MIT -->
<svelte:options namespace="svg" />

<script lang="ts">
  import { getTrimPathSvgProps } from '@/shared/graphics/shapes/trim-path'
  import { getTaperStrokeSegments, hasActiveTaper } from '@/shared/graphics/shapes/taper-path'
  import type { BaseShapeProps } from './types'

  let {
    d,
    fill,
    stroke,
    strokeWidth,
    taperStartWidth,
    taperEndWidth,
    taperStartLength,
    taperEndLength,
    trimPathStart,
    trimPathEnd,
    trimPathOffset,
    strokeLinecap,
    strokeLinejoin,
    strokeMiterlimit,
  }: Omit<BaseShapeProps, 'fillDefinition' | 'style' | 'class'> & { d: string } = $props()

  const taperValues = $derived({
    taperStartWidth,
    taperEndWidth,
    taperStartLength,
    taperEndLength,
    trimPathStart,
    trimPathEnd,
    trimPathOffset,
  })
  const tapered = $derived(!!stroke && !!strokeWidth && hasActiveTaper(taperValues))
  const segments = $derived(tapered ? getTaperStrokeSegments(taperValues) : [])
  const trim = $derived(getTrimPathSvgProps({ trimPathStart, trimPathEnd, trimPathOffset }))
</script>

<path
  {d}
  {fill}
  stroke={tapered ? undefined : stroke}
  stroke-width={strokeWidth}
  pathLength={trim.pathLength}
  stroke-dasharray={trim.strokeDasharray}
  stroke-dashoffset={trim.strokeDashoffset}
  stroke-linecap={strokeLinecap}
  stroke-linejoin={strokeLinejoin}
  stroke-miterlimit={strokeMiterlimit?.toString()}
/>
{#each segments as segment, index (index)}
  <path
    {d}
    fill="none"
    {stroke}
    stroke-width={strokeWidth! * segment.widthScale}
    pathLength={100}
    stroke-dasharray="{segment.length} {100 - segment.length}"
    stroke-dashoffset={-segment.offset}
    stroke-linecap="butt"
    stroke-linejoin={strokeLinejoin}
    stroke-miterlimit={strokeMiterlimit?.toString()}
  />
{/each}
