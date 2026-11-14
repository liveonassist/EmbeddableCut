<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Playhead indicator on the graph.
   * Shows current frame position as a vertical line with a triangular marker.
   * Can be dragged to scrub through frames.
   */
  import { untrack } from 'svelte'
  import type { GraphPadding, GraphViewport } from '../types'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useCoalescedScrub } from '../../use-coalesced-scrub.svelte'

  interface GraphPlayheadProps {
    frame: number
    /** Absolute timeline frame where the edited item starts (for live playback). */
    itemFrom?: number
    viewport: GraphViewport
    padding: GraphPadding
    /** Total frames in the clip (for display) */
    totalFrames?: number
    /** Timeline FPS used to scale scrub throttling by horizontal density */
    fps?: number
    /** Callback when playhead is scrubbed (dragged) */
    onScrub?: (frame: number) => void
    /** Callback when scrubbing starts */
    onScrubStart?: () => void
    /** Callback when scrubbing ends */
    onScrubEnd?: () => void
    /** Whether scrubbing is disabled */
    disabled?: boolean
    /** Whether to render the visible playhead line/marker */
    visuals?: 'visible' | 'hidden'
  }

  let {
    frame,
    itemFrom = 0,
    viewport,
    padding,
    totalFrames,
    fps = 30,
    onScrub,
    onScrubStart,
    onScrubEnd,
    disabled = false,
    visuals = 'visible',
  }: GraphPlayheadProps = $props()

  const graphLeft = $derived(padding.left)
  const graphTop = $derived(padding.top)
  const graphWidth = $derived(viewport.width - padding.left - padding.right)
  const graphHeight = $derived(viewport.height - padding.top - padding.bottom)
  const frameRange = $derived(Math.max(1, viewport.endFrame - viewport.startFrame))
  const graphPixelsPerSecond = $derived((graphWidth / frameRange) * fps)

  // Clip-relative frame → clamped x in the graph's own coordinate space.
  const frameToGraphX = (relFrame: number): number => {
    const rawX = graphLeft + ((relFrame - viewport.startFrame) / frameRange) * graphWidth
    return Math.max(graphLeft, Math.min(graphLeft + graphWidth, rawX))
  }
  const x = $derived(frameToGraphX(frame))

  // The visuals are rendered at local x=0 inside a translated group so the
  // playhead can be moved during playback by writing the group transform
  // directly — the graph is kept off the playback hot path. During active
  // editor scrubs the parent intentionally avoids pushing every frame through
  // props, so this group also follows the scrub store directly. On settled
  // seek/zoom the `frame` prop changes and the effect below repositions.
  let group = $state<SVGGElement | null>(null)
  const {
    startScrub: startPlayheadScrub,
    queueScrub: queuePlayheadScrub,
    flushPendingScrub: flushPendingPlayheadScrub,
  } = useCoalescedScrub(() => onScrub)

  $effect.pre(() => {
    group?.setAttribute('transform', `translate(${x}, 0)`)
  })

  $effect(() => {
    // Dependencies of the live follow, as React listed them.
    void itemFrom
    void totalFrames
    void viewport.startFrame
    void viewport.endFrame
    void graphLeft
    void graphWidth
    return untrack(() =>
      usePlaybackStore.subscribe((state, previous) => {
        const isPreviewing = state.previewFrame !== null
        if (!state.isPlaying && !isPreviewing) {
          // Settled: snap back to the prop position, as a re-render would.
          if (previous.isPlaying || previous.previewFrame !== null) {
            group?.setAttribute('transform', `translate(${x}, 0)`)
          }
          return
        }
        const lastFrame = totalFrames ? totalFrames - 1 : viewport.endFrame - 1
        const liveFrame = state.previewFrame ?? state.currentFrame
        const rel = Math.max(0, Math.min(lastFrame, liveFrame - itemFrom))
        group?.setAttribute('transform', `translate(${frameToGraphX(rel)}, 0)`)
      }),
    )
  })

  // Convert screen X to frame (clamped to valid range)
  const screenXToFrame = (screenX: number): number => {
    const relativeX = screenX - graphLeft
    const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth))
    const calculatedFrame = Math.round(viewport.startFrame + normalizedX * frameRange)
    // Clamp to valid frame range [0, totalFrames - 1] (last valid frame is totalFrames - 1)
    // This prevents scrubbing past the clip boundary which would deselect the clip
    const maxValidFrame = totalFrames ? totalFrames - 1 : viewport.endFrame - 1
    return Math.max(0, Math.min(maxValidFrame, calculatedFrame))
  }

  // Handle pointer down on playhead
  const handlePointerDown = (event: PointerEvent) => {
    if (disabled || !onScrub) return

    event.preventDefault()
    event.stopPropagation()

    const svg = (event.target as SVGElement).ownerSVGElement
    if (!svg) return

    // Notify scrub start
    onScrubStart?.()

    // Capture pointer for drag
    svg.setPointerCapture(event.pointerId)
    let lastScrubbedFrame: number | null = null

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = svg.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const newFrame = screenXToFrame(localX)
      if (newFrame === lastScrubbedFrame) {
        return
      }
      lastScrubbedFrame = newFrame
      queuePlayheadScrub({
        frame: newFrame,
        pointerX: localX,
        pixelsPerSecond: graphPixelsPerSecond,
      })
    }

    // Also handles pointercancel — a system-interrupted gesture (capture lost,
    // touch cancelled) must clean up exactly like a normal release.
    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      svg.releasePointerCapture(event.pointerId)
      svg.removeEventListener('pointermove', handlePointerMove)
      svg.removeEventListener('pointerup', handlePointerUp)
      svg.removeEventListener('pointercancel', handlePointerUp)
      flushPendingPlayheadScrub(true)

      // Notify scrub end
      onScrubEnd?.()
    }

    svg.addEventListener('pointermove', handlePointerMove)
    svg.addEventListener('pointerup', handlePointerUp)
    svg.addEventListener('pointercancel', handlePointerUp)
    startPlayheadScrub({
      frame,
      pointerX: x,
      pixelsPerSecond: graphPixelsPerSecond,
    })
  }

  const isInteractive = $derived(!disabled && !!onScrub)
</script>

<g
  bind:this={group}
  class="graph-playhead"
  style:pointer-events={isInteractive ? 'auto' : 'none'}
  style:cursor={isInteractive ? 'ew-resize' : 'default'}
>
  <!-- Invisible wider hit area for easier grabbing (local x=0; group is translated) -->
  {#if isInteractive}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <line
      x1={0}
      y1={graphTop}
      x2={0}
      y2={graphTop + graphHeight}
      stroke="transparent"
      stroke-width={12}
      onpointerdown={handlePointerDown}
      style:cursor="ew-resize"
    />
  {/if}
  {#if visuals === 'visible'}
    <!-- Playhead line — orange, matching the dopesheet body line and the
         main timeline playhead; the flag handle is rendered once in the
         shared ruler. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <line
      x1={0}
      y1={0}
      x2={0}
      y2={graphTop + graphHeight}
      stroke="var(--color-timeline-playhead)"
      stroke-width={1}
      onpointerdown={isInteractive ? handlePointerDown : undefined}
      style:filter="drop-shadow(0 0 5px rgba(255, 140, 58, 0.65))"
      style:cursor={isInteractive ? 'ew-resize' : 'default'}
    />
  {/if}
</g>
