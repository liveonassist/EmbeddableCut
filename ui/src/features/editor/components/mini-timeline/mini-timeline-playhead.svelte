<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type ComponentProps } from 'svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import PlayheadMarks from '@/shared/ui/playhead-marks.svelte'
  import { MINI_TIMELINE_MIN_FRAMES } from './constants'
  import { getMiniTimelineDisplayFrame } from './utils'

  interface MiniTimelinePlayheadProps {
    labelWidth: number
    maxFrame: number
    handle?: ComponentProps<typeof PlayheadMarks>['handle']
    pointer?: boolean
    suppressPreviewRef?: { current: boolean }
    testId?: string
  }

  /**
   * Self-tracking playhead overlay. Subscribes to the playback store and moves
   * itself via a transform so per-frame scrub updates never re-render the host
   * strip. Pass `suppressPreviewRef` to pin the playhead at the committed frame
   * during an IO drag while the preview canvas keeps updating.
   */
  let {
    labelWidth,
    maxFrame,
    handle = 'flag',
    pointer = false,
    suppressPreviewRef,
    testId,
  }: MiniTimelinePlayheadProps = $props()

  let playhead: HTMLDivElement | undefined = $state()
  // Container width is cached so per-frame position updates stay layout-free
  // (getBoundingClientRect forces layout on every playback store change).
  let containerWidth = 0

  function updatePosition(frame: number) {
    if (!playhead) return
    if (containerWidth <= 0) {
      containerWidth = playhead.parentElement?.getBoundingClientRect().width ?? 0
    }
    const contentWidth = Math.max(0, containerWidth - labelWidth)
    const maxFrameValue = Math.max(MINI_TIMELINE_MIN_FRAMES, maxFrame, frame + 1)
    const ratio = maxFrameValue > 0 ? Math.max(0, Math.min(1, frame / maxFrameValue)) : 0
    playhead.style.transform = `translate3d(${Math.round(labelWidth + contentWidth * ratio)}px, 0, 0)`
  }

  $effect(() => {
    const element = playhead
    if (!element) return
    const suppress = suppressPreviewRef
    // Geometry changes reposition through the pre-effect below, not by resubscribing.
    untrack(() => updatePosition(getMiniTimelineDisplayFrame(suppress?.current === true)))

    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const frame = suppress?.current ? state.currentFrame : (state.previewFrame ?? state.currentFrame)
      updatePosition(frame)
    })

    const container = element.parentElement
    if (typeof ResizeObserver === 'undefined' || !container) return unsubscribe

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) containerWidth = width
      untrack(() => updatePosition(getMiniTimelineDisplayFrame(suppress?.current === true)))
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      unsubscribe()
    }
  })

  $effect.pre(() => {
    void labelWidth
    void maxFrame
    updatePosition(getMiniTimelineDisplayFrame(suppressPreviewRef?.current === true))
  })
</script>

<div
  bind:this={playhead}
  class="pointer-events-none absolute bottom-0 top-0 z-20 w-0"
  data-testid={testId}
  aria-hidden="true"
>
  <PlayheadMarks {handle} {pointer} />
</div>
