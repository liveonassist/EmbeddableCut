<!-- SPDX-License-Identifier: MIT -->
<!--
  Renders a Lottie animation synced to the timeline frame.

  dotlottie-web renders the requested frame synchronously into the canvas, so
  (unlike the GIF player) there is no frame pre-extraction — we just seek on
  every `localFrame` change. The canvas is sized to the animation's native
  resolution and CSS-stretched; the surrounding ItemVisualWrapper handles fit.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { AbsoluteFill, useSequenceContext } from '@/runtime/composition-runtime/deps/player'
  import { useVideoConfig } from '../../hooks/use-player-compat.svelte'
  import {
    LottieRenderer,
    mapTimelineFrameToLottieFrame,
  } from '@/infrastructure/lottie/lottie-frame-provider'
  import { resolveLottieRenderSpec } from '@/infrastructure/lottie/lottie-text'
  import type { LottieItem } from '@/types/timeline'

  let { item }: { item: LottieItem } = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let renderer: LottieRenderer | null = null
  let loaded = $state(false)
  let failed = $state(false)

  const sequenceContext = useSequenceContext()
  const localFrame = $derived(sequenceContext?.localFrame ?? 0)
  const videoConfig = useVideoConfig()

  const src = $derived(item.src)
  // Serialize the render inputs so the renderer only rebuilds when the selected
  // animation/theme or text/color edits change.
  const overridesKey = $derived(
    JSON.stringify({
      a: item.animationId ?? null,
      m: item.themeId ?? null,
      t: item.textOverrides ?? null,
      c: item.colorOverrides ?? null,
      s: item.slotOverrides ?? null,
    }),
  )

  // (Re)create the renderer when the source (or text overrides) change.
  // autoResize lets dotlottie size its render target to the displayed canvas.
  $effect(() => {
    const source = src
    void overridesKey
    const target = untrack(() => canvas)
    if (!target || !source) return

    loaded = false
    failed = false

    let cancelled = false
    let created: LottieRenderer | null = null
    // overridesKey stands in for the item's text/color edits read here.
    const renderItem = untrack(() => item)

    void (async () => {
      // Resolve the selected animation/theme + text/color edits before render;
      // `data` is null when nothing needs patching (load `src` directly).
      const spec = await resolveLottieRenderSpec(source, renderItem)
      if (cancelled) return
      created = new LottieRenderer({
        canvas: target,
        autoResize: true,
        themeData: spec.themeData ?? undefined,
        slots: spec.slots ?? undefined,
        ...(spec.data ? { data: spec.data } : { src: source }),
      })
      renderer = created
      await created.ready
      if (cancelled) return
      if (created.isLoaded) loaded = true
      else failed = true
    })()

    return () => {
      cancelled = true
      created?.destroy()
      renderer = null
    }
  })

  // Seek to the frame for the current timeline position.
  $effect(() => {
    const lottieFrame = mapTimelineFrameToLottieFrame({
      localFrame,
      projectFps: videoConfig.fps,
      speed: item.speed ?? 1,
      totalFrames: item.totalFrames,
      frameRate: item.frameRate,
      loop: item.loop ?? true,
      reversed: item.reversed,
      loopMode: item.loopMode,
      segmentStart: item.segmentStart,
      segmentEnd: item.segmentEnd,
    })
    if (!renderer || !loaded) return
    renderer.renderFrame(lottieFrame)
  })
</script>

{#if failed}
  <AbsoluteFill
    style="background-color: #1a1a1a; display: flex; align-items: center; justify-content: center;"
  >
    <span style="color: #ff6b6b; font-size: 14px;">Lottie load failed</span>
  </AbsoluteFill>
{:else}
  <AbsoluteFill>
    <canvas bind:this={canvas} style="width: 100%; height: 100%; display: block;"></canvas>
  </AbsoluteFill>
{/if}
