<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /** One full original→effect→original sweep in ms; ping-pongs so it never cuts. */
  const SWEEP_MS = 1100
  /** Resting state shows the effect at full strength so the grid reads at a glance. */
  const POSTER_STRENGTH = 1

  type EffectParams = Record<string, number | boolean | string>

  /** A single effect in the preview chain, with the params to sweep toward. */
  interface PreviewSpec {
    gpuEffectType: string
    target: EffectParams
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { getGpuEffect } from '@/infrastructure/gpu-effects'
  import type { GpuEffectInstance } from '@/infrastructure/gpu-effects'
  import { cn } from '@/shared/ui/cn'
  import {
    PREVIEW_WIDTH,
    PREVIEW_HEIGHT,
    blendParams,
    ensureEffectPreviewPipeline,
    getEffectPreviewSample,
    getReadyEffectPreviewPipeline,
    getShowcaseParams,
  } from './engine'

  interface EffectThumbnailProps {
    /** Single GPU effect by registry id. Showcase params are derived. */
    effectId?: string
    /**
     * An explicit effect chain (e.g. a preset). Each entry's params are the
     * sweep target. Pass a referentially stable array so the thumbnail can memoize.
     */
    effects?: ReadonlyArray<{ gpuEffectType: string; params: EffectParams }>
    /** True while the host row is hovered — drives the animation loop. */
    active: boolean
    class?: string
  }

  /**
   * A small canvas that previews a GPU effect over a bundled sample frame.
   * Renders through the real WebGPU `EffectsPipeline` for true fidelity: idle at
   * full strength, sweeping strength 0 → full → 0 while `active` (hovered),
   * mirroring the transition-picker previews.
   */
  let { effectId, effects, active, class: className }: EffectThumbnailProps = $props()

  let canvas: HTMLCanvasElement | null = $state(null)
  let sample: OffscreenCanvas | null = null

  const specs = $derived.by<PreviewSpec[]>(() => {
    if (effects) {
      return effects.map((e) => ({ gpuEffectType: e.gpuEffectType, target: e.params }))
    }
    if (effectId) {
      const def = getGpuEffect(effectId)
      if (def) return [{ gpuEffectType: effectId, target: getShowcaseParams(def) }]
    }
    return []
  })

  const draw = (strength: number) => {
    if (!canvas || !sample) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pipeline = getReadyEffectPreviewPipeline()
    if (pipeline && specs.length > 0) {
      const instances: GpuEffectInstance[] = specs.map((spec, i) => ({
        id: `preview-${i}`,
        type: spec.gpuEffectType,
        name: spec.gpuEffectType,
        enabled: true,
        params: blendParams(spec.gpuEffectType, spec.target, strength),
      }))
      const result = pipeline.applyEffectsToCanvas(sample, instances)
      if (result) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(result, 0, 0, canvas.width, canvas.height)
        return
      }
    }

    // Fallback: paint the raw sample (pipeline not ready / unavailable).
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(sample, 0, 0, canvas.width, canvas.height)
  }

  // Decode the sample once and paint the poster. Kick off GPU init, then repaint
  // the poster through the real shaders once the pipeline is ready.
  $effect(() => {
    void specs
    void canvas
    let cancelled = false
    void getEffectPreviewSample().then((decoded) => {
      if (cancelled || !decoded) return
      sample = decoded
      draw(POSTER_STRENGTH)
      void ensureEffectPreviewPipeline().then(() => {
        if (!cancelled) draw(POSTER_STRENGTH)
      })
    })
    return () => {
      cancelled = true
    }
  })

  // Animate while hovered; reset to the poster frame on leave.
  $effect(() => {
    void specs
    if (!active) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      // Triangle wave 0→1→0 so the loop is seamless (no flash back to original).
      const phase = ((now - start) % (SWEEP_MS * 2)) / SWEEP_MS
      draw(phase <= 1 ? phase : 2 - phase)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      untrack(() => draw(POSTER_STRENGTH))
    }
  })
</script>

<canvas
  bind:this={canvas}
  width={PREVIEW_WIDTH}
  height={PREVIEW_HEIGHT}
  class={cn('bg-black/40', className)}
  draggable={false}
  aria-hidden="true"
></canvas>
