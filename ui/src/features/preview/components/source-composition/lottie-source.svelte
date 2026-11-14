<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AbsoluteFill } from '@/features/preview/deps/player-core'
  import { useClock } from '@/features/preview/deps/player-context'
  import { LottieRenderer } from '@/infrastructure/lottie/lottie-frame-provider'

  let { src }: { src: string } = $props()
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const clock = useClock()

  $effect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return
    const renderer = new LottieRenderer({ canvas, src, autoResize: true })
    let raf = 0
    let lastFrame = -1
    let loaded = false
    renderer.ready.then(() => {
      loaded = renderer.isLoaded
    })
    // Drive frames from the source clock imperatively (no per-frame React render).
    const tick = () => {
      if (loaded) {
        const total = renderer.totalFrames
        const frame =
          total > 0 ? Math.max(0, Math.min(Math.round(clock.currentFrame), total - 1)) : 0
        if (frame !== lastFrame) {
          renderer.renderFrame(frame)
          lastFrame = frame
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      renderer.destroy()
    }
  })
</script>

<AbsoluteFill>
  <canvas
    bind:this={canvasRef.current}
    style:width="100%"
    style:height="100%"
    style:display="block"
  ></canvas>
</AbsoluteFill>
