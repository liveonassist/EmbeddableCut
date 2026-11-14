<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { EasingType } from '@/types/keyframe'

  interface Point {
    x: number
    y: number
  }

  const start: Point = { x: 2.1, y: 11.9 }
  const end: Point = { x: 13.9, y: 4.1 }

  const toScreenPoint = (x: number, y: number): Point => ({
    x: start.x + (end.x - start.x) * x,
    y: start.y - (start.y - end.y) * y,
  })

  const formatPoint = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  const getDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

  const BEZIERS: Partial<Record<EasingType, [number, number, number, number]>> = {
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
    'cubic-bezier': [0.2, 0.1, 0.74, 0.88],
  }

  const springOne = toScreenPoint(0.24, 0.02)
  const springTwo = toScreenPoint(0.36, 0.58)
  const springMid = toScreenPoint(0.52, 0.58)
  const springThree = toScreenPoint(0.68, 0.58)
  const springFour = toScreenPoint(0.8, 1.08)
  const springSettle = toScreenPoint(0.9, 0.98)
  const springFive = toScreenPoint(0.98, 1)
  const springPath = [
    `M${formatPoint(start)}`,
    `C${formatPoint(springOne)} ${formatPoint(springTwo)} ${formatPoint(springMid)}`,
    `C${formatPoint(springThree)} ${formatPoint(springFour)} ${formatPoint(springSettle)}`,
    `C${formatPoint(springSettle)} ${formatPoint(springFive)} ${formatPoint(end)}`,
  ].join(' ')
</script>

<script lang="ts">
  let { type }: { type: EasingType } = $props()

  const bezier = $derived.by(() => {
    const points = BEZIERS[type]
    if (!points) return null
    const controlOne = toScreenPoint(points[0], points[1])
    const controlTwo = toScreenPoint(points[2], points[3])
    return {
      controlOne,
      controlTwo,
      path: `M${formatPoint(start)}C${formatPoint(controlOne)} ${formatPoint(controlTwo)} ${formatPoint(end)}`,
    }
  })
</script>

{#snippet controlHandle(anchor: Point, control: Point)}
  {#if getDistance(anchor, control) >= 0.9}
    <g>
      <path
        d="M{formatPoint(anchor)}L{formatPoint(control)}"
        stroke="currentColor"
        stroke-width={0.66}
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity={0.5}
      />
      <circle cx={control.x} cy={control.y} r="0.56" fill="currentColor" stroke="none" opacity="0.68" />
    </g>
  {/if}
{/snippet}

{#snippet curve(d: string)}
  <path {d} stroke="currentColor" stroke-width={0.88} stroke-linecap="round" stroke-linejoin="round" />
{/snippet}

<svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill="none">
  {#if type === 'linear'}
    {@render curve(`M${formatPoint(start)}L${formatPoint(end)}`)}
  {:else if type === 'hold'}
    {@render curve(`M${formatPoint(start)}L${formatPoint(toScreenPoint(1, 0))}L${formatPoint(end)}`)}
  {:else if bezier}
    {@render controlHandle(start, bezier.controlOne)}
    {@render controlHandle(end, bezier.controlTwo)}
    {@render curve(bezier.path)}
  {:else}
    {@render controlHandle(start, springOne)}
    {@render controlHandle(end, springFive)}
    {@render curve(springPath)}
  {/if}
  <circle cx={start.x} cy={start.y} r="0.74" fill="currentColor" stroke="none" />
  <circle cx={end.x} cy={end.y} r="0.74" fill="currentColor" stroke="none" />
</svg>
