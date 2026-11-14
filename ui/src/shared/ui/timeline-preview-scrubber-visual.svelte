<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const FLAG_HEIGHT = 12

  interface ImperativeBooleanSignal {
    readonly current: boolean
    subscribe: (listener: () => void) => () => void
  }

  interface ImperativeSignal {
    subscribe: (listener: () => void) => () => void
  }

  function isImperativelySuppressed(
    suppressRefs: ReadonlyArray<{ current: boolean }> | undefined,
    suppressSignal: ImperativeBooleanSignal | undefined,
  ): boolean {
    return (suppressRefs?.some((ref) => ref.current) ?? false) || (suppressSignal?.current ?? false)
  }

  function shouldHidePreviewScrubber({
    previewFrame,
    suppressed,
    suppressRefActive,
  }: {
    previewFrame: number | null
    suppressed: boolean
    suppressRefActive: boolean
  }): boolean {
    return previewFrame === null || suppressed || suppressRefActive
  }

  interface TimelinePreviewScrubberVisualProps {
    frameToPixels: (frame: number) => number
    fps: number
    inRuler?: boolean
    maxFrame?: number
    rulerOffset?: number
    showTooltip?: boolean
    suppressed?: boolean
    /** Mutable flags read on every reposition, as React's refs were. */
    suppressRefs?: ReadonlyArray<{ current: boolean }>
    suppressSignal?: ImperativeBooleanSignal
    /** Reposition from the live mapper when external geometry changes. */
    repositionSignal?: ImperativeSignal
    /** Reposition from the live mapper whenever this external timeline scrolls. */
    positionSyncTarget?: HTMLElement | null
    zIndex?: number
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSelectionStore } from '@/shared/state/selection'
  import { formatTimecode } from '@/shared/utils/time-utils'

  /** Shared ghost playhead visual used by every Edit timeline surface. */
  let {
    frameToPixels,
    fps,
    inRuler = false,
    maxFrame,
    rulerOffset = 0,
    showTooltip = true,
    suppressed = false,
    suppressRefs,
    suppressSignal,
    repositionSignal,
    positionSyncTarget,
    zIndex = 20,
  }: TimelinePreviewScrubberVisualProps = $props()

  let scrubber = $state<HTMLDivElement | null>(null)
  let tooltip = $state<HTMLDivElement | null>(null)
  let line = $state<HTMLDivElement | null>(null)
  let handle = $state<HTMLDivElement | null>(null)

  // Reads the latest props without subscribing, so store and signal callbacks
  // never re-run the effects that registered them.
  const updatePosition = (previewFrame: number | null) =>
    untrack(() => {
      const node = scrubber
      if (!node) return
      if (
        shouldHidePreviewScrubber({
          previewFrame,
          suppressed,
          suppressRefActive: isImperativelySuppressed(suppressRefs, suppressSignal),
        })
      ) {
        if (node.style.display !== 'none') node.style.display = 'none'
        return
      }

      let clampedFrame = Math.max(0, previewFrame ?? 0)
      if (maxFrame !== undefined) {
        clampedFrame = Math.min(clampedFrame, maxFrame)
      }

      // Preserve the exact mapped coordinate. The main timeline is a scrolled
      // content surface while the keyframe timeline is a fixed viewport surface;
      // rounding on different sides of scrollLeft makes their skim lines disagree
      // by a pixel during wheel zoom.
      const leftPosition = frameToPixels(clampedFrame)
      if (node.style.display !== '') node.style.display = ''
      const transform = `translate3d(${leftPosition}px, 0, 0)`
      if (node.style.transform !== transform) node.style.transform = transform
      if (tooltip) {
        const timecode = formatTimecode(clampedFrame, fps)
        if (tooltip.textContent !== timecode) tooltip.textContent = timecode
      }
    })

  $effect(() => {
    if (!scrubber) return
    updatePosition(usePlaybackStore.getState().previewFrame)
    return usePlaybackStore.subscribe((state, previousState) => {
      if (state.previewFrame === previousState.previewFrame) return
      updatePosition(state.previewFrame)
    })
  })

  $effect(() => {
    const signal = suppressSignal
    if (!signal) return
    return signal.subscribe(() => {
      updatePosition(usePlaybackStore.getState().previewFrame)
    })
  })

  $effect(() => {
    const signal = repositionSignal
    if (!signal) return
    return signal.subscribe(() => {
      updatePosition(usePlaybackStore.getState().previewFrame)
    })
  })

  $effect(() => {
    const target = positionSyncTarget
    if (!target) return
    const reposition = () => updatePosition(usePlaybackStore.getState().previewFrame)
    target.addEventListener('scroll', reposition, { passive: true })
    return () => target.removeEventListener('scroll', reposition)
  })

  $effect.pre(() => {
    void [fps, frameToPixels, maxFrame, suppressed, scrubber, tooltip]
    updatePosition(usePlaybackStore.getState().previewFrame)
  })

  $effect(() => {
    const lineNode = line
    const handleNode = handle
    const updateColor = (tool: string) => {
      const isRazor = tool === 'razor'
      const isRateStretch = tool === 'rate-stretch'
      const isTrimEdit = tool === 'trim-edit'
      const lineColor = isRazor
        ? 'rgba(239, 68, 68, 0.7)'
        : isRateStretch
          ? 'rgba(168, 85, 247, 0.7)'
          : isTrimEdit
            ? 'rgba(234, 179, 8, 0.7)'
            : 'rgba(255, 255, 255, 0.3)'
      const handleColor = isRazor
        ? 'rgba(239, 68, 68, 0.8)'
        : isRateStretch
          ? 'rgba(168, 85, 247, 0.8)'
          : isTrimEdit
            ? 'rgba(234, 179, 8, 0.8)'
            : 'rgba(255, 255, 255, 0.4)'

      if (lineNode) lineNode.style.backgroundColor = lineColor
      if (handleNode) handleNode.style.backgroundColor = handleColor
      updatePosition(usePlaybackStore.getState().previewFrame)
    }

    updateColor(useSelectionStore.getState().activeTool)
    return useSelectionStore.subscribe((state, previousState) => {
      if (state.activeTool !== previousState.activeTool) updateColor(state.activeTool)
    })
  })
</script>

<!-- display is owned imperatively by updatePosition, so it stays out of the reactive style. -->
<div
  bind:this={scrubber}
  data-testid="timeline-preview-scrubber"
  class="absolute bottom-0 top-0 w-px"
  style="display: none; pointer-events: none"
  style:z-index={zIndex}
>
  <div
    bind:this={line}
    class="absolute bg-white/30"
    style:top="{inRuler ? rulerOffset + FLAG_HEIGHT : 0}px"
    style:bottom="0px"
    style:left="0px"
    style:right="0px"
  ></div>

  {#if inRuler}
    <div
      bind:this={handle}
      class="absolute left-1/2 h-3 w-2 -translate-x-1/2 rounded-b-[2px] bg-white/40"
      style:top="{rulerOffset}px"
    ></div>
    {#if showTooltip}
      <div
        bind:this={tooltip}
        class="absolute left-1/2 -top-[22px] -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] leading-3 text-white"
      ></div>
    {/if}
  {/if}
</div>
