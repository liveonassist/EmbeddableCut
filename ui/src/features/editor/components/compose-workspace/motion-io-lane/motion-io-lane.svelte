<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import {
    setInOutPointsWithoutHistory,
    setInPoint,
    setOutPoint,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import {
    beginIoPointerDrag,
    IoRangeHandles,
    IoRangeStrip,
    useMeasuredWidth,
  } from '@/shared/timeline/io-range'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'
  import { MOTION_IO_LANE_HEIGHT } from './constants'

  /**
   * The Motion ruler's in/out (render range) lane — the same DaVinci-style IO bar
   * the Edit ruler and the Color/Animate mini-timeline render, wired to the
   * Motion time viewport.
   *
   * No state of its own: in/out live in the markers store, which the composition
   * navigation swaps on drill-in and persists onto the SubComposition, so marking
   * a range here marks *this comp's* range and the export dialog's sequence
   * picker renders exactly that window.
   *
   * Unlike the mini-timeline lane (whose axis is always the whole timeline) the
   * Motion axis is zoomable, so a point can sit outside the visible window: the
   * strip is clipped to the window and a handle whose frame is off-screen is not
   * drawn (there is nothing there to grab).
   */
  let {
    viewport,
    maxFrame,
    fps,
  }: {
    viewport: { startFrame: number; endFrame: number }
    /** Last frame the range may reach — the comp end, not the content extent. */
    maxFrame: number
    fps: number
  } = $props()

  const inPoint = select(useMarkersStore, (s) => s.inPoint)
  const outPoint = select(useMarkersStore, (s) => s.outPoint)

  const laneRef: { current: HTMLDivElement | null } = { current: null }
  // The lane positions via `%`, but the handles need the real visible span in px
  // so the two grips meet instead of overlapping when the range is narrow.
  const measured = useMeasuredWidth(laneRef)
  let dragCleanup: (() => void) | null = null

  // Tear down an in-flight drag if the lane unmounts mid-gesture.
  $effect(() => () => dragCleanup?.())

  function frameFromClientX(clientX: number): number | null {
    const lane = laneRef.current
    if (!lane) return null
    const rect = lane.getBoundingClientRect()
    if (rect.width <= 0) return null
    const { startFrame, endFrame } = viewport
    const frameRange = Math.max(1, endFrame - startFrame)
    const ratio = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(maxFrame, Math.round(startFrame + ratio * frameRange)))
  }

  const startHandleDrag = (side: 'in' | 'out') => (event: PointerEvent) => {
    const setFrame = side === 'in' ? setInPoint : setOutPoint
    const prevCursor = document.body.style.cursor

    const cleanup = beginIoPointerDrag(
      event,
      (clientX) => {
        const frame = frameFromClientX(clientX)
        if (frame === null) return
        setFrame(frame)
        // Skim the preview to the boundary; out is exclusive, so show out - 1.
        usePlaybackStore.getState().setPreviewFrame(side === 'out' ? Math.max(0, frame - 1) : frame)
        return formatTimecodeCompact(frame, fps)
      },
      () => {
        document.body.style.cursor = prevCursor
        usePlaybackStore.getState().setPreviewFrame(null)
        dragCleanup = null
      },
    )
    if (!cleanup) return
    document.body.style.cursor = 'col-resize'
    dragCleanup = cleanup
  }

  // Drag the strip body to slide the whole range, preserving its length. No
  // history per move (mirrors the Edit ruler and mini-timeline); mark dirty once
  // on release.
  function startRangeDrag(event: PointerEvent) {
    const startIn = inPoint.current
    const startOut = outPoint.current
    if (startIn === null || startOut === null) return
    const lane = laneRef.current
    if (!lane) return

    const startClientX = event.clientX
    const span = Math.max(1, startOut - startIn)
    const { startFrame, endFrame } = viewport
    const frameRange = Math.max(1, endFrame - startFrame)
    const prevCursor = document.body.style.cursor
    let lastIn = startIn

    const cleanup = beginIoPointerDrag(
      event,
      (clientX) => {
        const rect = lane.getBoundingClientRect()
        if (rect.width <= 0) return
        const frameDelta = Math.round(((clientX - startClientX) / rect.width) * frameRange)
        const maxIn = Math.max(0, maxFrame - span)
        const nextIn = Math.max(0, Math.min(startIn + frameDelta, maxIn))
        const label = `${formatTimecodeCompact(nextIn, fps)} → ${formatTimecodeCompact(nextIn + span, fps)}`
        if (nextIn === lastIn) return label
        lastIn = nextIn
        setInOutPointsWithoutHistory(nextIn, nextIn + span)
        // Preview follows the leading edge.
        usePlaybackStore.getState().setPreviewFrame(nextIn)
        return label
      },
      () => {
        document.body.style.cursor = prevCursor
        usePlaybackStore.getState().setPreviewFrame(null)
        useTimelineSettingsStore.getState().markDirty()
        dragCleanup = null
      },
    )
    if (!cleanup) return
    document.body.style.cursor = 'grabbing'
    dragCleanup = cleanup
  }

  const frameRange = $derived(Math.max(1, viewport.endFrame - viewport.startFrame))
  const toPercent = (frame: number) => ((frame - viewport.startFrame) / frameRange) * 100
  const inPercent = $derived(inPoint.current !== null ? toPercent(inPoint.current) : null)
  const outPercent = $derived(outPoint.current !== null ? toPercent(outPoint.current) : null)

  // Clipped to the visible window — the range may extend past either edge.
  const clippedStart = $derived(inPercent !== null ? Math.max(0, Math.min(100, inPercent)) : null)
  const clippedEnd = $derived(outPercent !== null ? Math.max(0, Math.min(100, outPercent)) : null)
  const hasRange = $derived(
    inPoint.current !== null && outPoint.current !== null && outPoint.current > inPoint.current,
  )
  const spanPx = $derived(
    clippedStart !== null && clippedEnd !== null
      ? ((clippedEnd - clippedStart) / 100) * measured.width
      : null,
  )
</script>

<div
  {@attach measured.measureRef}
  data-testid="motion-io-lane"
  class="pointer-events-none absolute inset-x-0 bottom-0"
  style:height="{MOTION_IO_LANE_HEIGHT}px"
>
  <div aria-hidden="true" class="absolute inset-0 border-t border-border/60 bg-muted/25"></div>

  {#if hasRange && clippedStart !== null && clippedEnd !== null}
    <IoRangeStrip
      left="{clippedStart}%"
      width="{clippedEnd - clippedStart}%"
      height={MOTION_IO_LANE_HEIGHT}
      onDragStart={startRangeDrag}
      title="{formatTimecodeCompact(inPoint.current ?? 0, fps)} → {formatTimecodeCompact(
        outPoint.current ?? 0,
        fps,
      )}"
      testId="motion-io-strip"
      zIndex={1}
      dataset={{
        'data-from-frame': String(inPoint.current ?? 0),
        'data-to-frame': String(outPoint.current ?? 0),
        'data-motion-viewport-clamp': '',
      }}
    />
  {/if}

  <IoRangeHandles
    inLeft={inPercent !== null ? `${inPercent}%` : null}
    outLeft={outPercent !== null ? `${outPercent}%` : null}
    {spanPx}
    laneHeight={MOTION_IO_LANE_HEIGHT}
    zIndex={2}
    onInDragStart={startHandleDrag('in')}
    onOutDragStart={startHandleDrag('out')}
    inTitle={t('editor.compose.inPoint')}
    outTitle={t('editor.compose.outPoint')}
    testIdPrefix="motion-io"
    inDataset={{
      'data-from-frame': String(inPoint.current ?? 0),
    }}
    outDataset={{
      'data-from-frame': String(outPoint.current ?? 0),
    }}
  />
</div>
