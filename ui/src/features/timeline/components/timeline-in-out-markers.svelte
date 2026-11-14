<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useInOutPoints } from '../hooks/use-in-out-points.svelte'
  import { useTimelineCommittedZoomContext } from '../contexts/timeline-zoom-context.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { previewScrubberSuppressRef } from './preview-scrubber-suppress'
  import { beginIoPointerDrag, IoRangeHandles } from '@/shared/timeline/io-range'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'
  import { pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'
  import { setGlobalCursorStyle } from '../utils/global-cursor-roots'
  import { select } from '$lib/store.svelte'

  // Matches the ruler's top IO lane height in timeline-markers.
  const IO_LANE_HEIGHT = 12

  /**
   * Timeline In/Out Markers. Handle grip/hit-area rendering (incl. collapse-safe
   * sizing when the range is narrow) lives in the shared `IoRangeHandles`; this
   * component owns only the Edit-workspace drag behavior + pixel positioning.
   */
  const inOut = useInOutPoints()
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const zoom = useTimelineCommittedZoomContext()

  // Store active drag cleanup so we can tear down on unmount
  let dragCleanup: (() => void) | null = null

  const startDrag = (handle: 'in' | 'out') => (e: PointerEvent) => {
    const container = (e.currentTarget as HTMLElement).closest('.timeline-ruler')
    if (!container) return

    const setter = handle === 'in' ? inOut.setInPoint : inOut.setOutPoint
    let restoreCursor: (() => void) | null = null
    const cleanup = beginIoPointerDrag(
      e,
      (clientX) => {
        const rect = container.getBoundingClientRect()
        const x = clientX - rect.left
        const frame = Math.max(0, pixelsToFrameNow(x))
        setter(frame)
        // Skim the preview to the boundary frame. Out is exclusive, so show the
        // last included frame (out - 1) rather than the frame just past it.
        const previewFrame =
          handle === 'out' ? Math.max(0, Math.round(frame) - 1) : Math.round(frame)
        usePlaybackStore.getState().setPreviewFrame(previewFrame)
        return formatTimecodeCompact(Math.round(frame), fps.current)
      },
      () => {
        restoreCursor?.()
        previewScrubberSuppressRef.current = false
        usePlaybackStore.getState().setPreviewFrame(null)
        dragCleanup = null
      },
    )
    if (!cleanup) return
    restoreCursor = setGlobalCursorStyle('cursor', 'col-resize')
    // Keep the preview canvas refreshing but pin the ghost skimmer so it
    // doesn't chase the marker (matches the Color workspace IO drag).
    previewScrubberSuppressRef.current = true
    dragCleanup = cleanup
  }

  // Tear down listeners if component unmounts mid-drag
  $effect(() => () => {
    dragCleanup?.()
  })

  const handleInDown = startDrag('in')
  const handleOutDown = startDrag('out')

  const inPx = $derived(inOut.inPoint !== null ? zoom.frameToPixels(inOut.inPoint) : null)
  const outPx = $derived(inOut.outPoint !== null ? zoom.frameToPixels(inOut.outPoint) : null)
  const spanPx = $derived(inPx !== null && outPx !== null ? outPx - inPx : null)
</script>

<IoRangeHandles
  inLeft={inPx !== null ? `${inPx}px` : null}
  outLeft={outPx !== null ? `${outPx}px` : null}
  {spanPx}
  laneHeight={IO_LANE_HEIGHT}
  onInDragStart={handleInDown}
  onOutDragStart={handleOutDown}
/>
