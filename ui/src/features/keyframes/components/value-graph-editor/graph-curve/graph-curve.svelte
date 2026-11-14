<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * A single interpolation curve between two keyframes.
   */
  import type { GraphKeyframePoint } from '../types'
  import type { EasingConfig } from '@/types/keyframe'
  import { applyEasingConfig } from '@/features/keyframes/utils/easing'

  interface GraphCurveProps {
    /** Start keyframe point */
    startPoint: GraphKeyframePoint
    /** End keyframe point */
    endPoint: GraphKeyframePoint
    /** Easing configuration for this segment */
    easingConfig?: EasingConfig
    /** Whether this segment is selected */
    isSelected?: boolean
    /** Stroke color override */
    strokeColor?: string
  }

  /** Number of sample points for curve */
  const CURVE_SAMPLES = 50

  let { startPoint, endPoint, easingConfig, isSelected = false, strokeColor }: GraphCurveProps =
    $props()

  // Generate path by sampling the easing function
  const path = $derived.by(() => {
    const points: string[] = []
    const config = easingConfig || { type: 'linear' as const }

    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES
      const easedT = applyEasingConfig(t, config)

      // Interpolate x linearly (time), y with easing (value)
      const x = startPoint.x + t * (endPoint.x - startPoint.x)
      const y = startPoint.y + easedT * (endPoint.y - startPoint.y)

      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`)
    }

    return points.join(' ')
  })

  // Always use orange for curves (blue glow added when selected)
  const color = $derived(strokeColor || '#f97316')
</script>

<g class="graph-curve" style:pointer-events="none">
  <!-- Shadow/glow for selected curves -->
  {#if isSelected}
    <path
      d={path}
      fill="none"
      stroke="#3b82f6"
      stroke-width={5}
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-opacity={0.3}
    />
  {/if}
  <!-- Main curve -->
  <path
    d={path}
    fill="none"
    stroke={color}
    stroke-width={2}
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-opacity={1}
  />
</g>
