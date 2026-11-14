<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    setInOutPointsWithoutHistory,
    setInPoint,
    setOutPoint,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { TimelineAnnotationModel } from '@/shared/timeline/timeline-annotations'
  import {
    beginIoPointerDrag,
    IoRangeHandles,
    IoRangeStrip,
    useMeasuredWidth,
  } from '@/shared/timeline/io-range'
  import { MINI_TIMELINE_IO_HANDLE_WIDTH, MINI_TIMELINE_IO_LANE_HEIGHT } from './constants'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'

  interface MiniTimelineIoLaneProps {
    model: TimelineAnnotationModel
    timelineMaxFrame: number
    labelWidth: number
    suppressPlayheadPreviewRef: { current: boolean }
    testIdPrefix: string
  }

  /**
   * The IO bar's own lane (DaVinci-style). Renders the in/out range strip (drag
   * the body to slide the whole range, preserving length) and the in/out drag
   * handles, mirroring the Edit-workspace in/out markers. While dragging it pins
   * the host playhead via `suppressPlayheadPreviewRef` so the playhead doesn't
   * chase the markers while the preview canvas keeps updating. The guide lines
   * that span the track rows below live in MiniTimelineAnnotations.
   */
  let { model, timelineMaxFrame, labelWidth, suppressPlayheadPreviewRef, testIdPrefix }: MiniTimelineIoLaneProps =
    $props()

  const lane: { current: HTMLDivElement | null } = { current: null }
  // Lane pixel width — the ratios render fluidly, but the handles need the
  // real span in px to avoid overlapping into a block when the range is narrow.
  const laneMeasure = useMeasuredWidth(lane)
  let dragCleanup: (() => void) | null = null

  // Tear down any in-flight drag if the lane unmounts mid-gesture.
  $effect(() => () => dragCleanup?.())

  // Drag the whole strip to slide the in/out range together, preserving its
  // length (mirrors the Edit-workspace ruler range drag: no history per move,
  // mark dirty on release).
  function startRangeDrag(event: PointerEvent) {
    const { inPoint: startIn, outPoint: startOut } = useMarkersStore.getState()
    if (startIn === null || startOut === null) return
    const laneElement = lane.current
    if (!laneElement) return

    const startClientX = event.clientX
    const span = Math.max(1, startOut - startIn)
    const prevCursor = document.body.style.cursor
    let lastIn = startIn

    const cleanup = beginIoPointerDrag(
      event,
      (clientX) => {
        const rect = laneElement.getBoundingClientRect()
        if (rect.width <= 0) return
        const frameDelta = Math.round(((clientX - startClientX) / rect.width) * timelineMaxFrame)
        const maxIn = Math.max(0, timelineMaxFrame - span)
        const nextIn = Math.max(0, Math.min(startIn + frameDelta, maxIn))
        const currentFps = useTimelineSettingsStore.getState().fps
        const label = `${formatTimecodeCompact(nextIn, currentFps)} → ${formatTimecodeCompact(nextIn + span, currentFps)}`
        if (nextIn === lastIn) return label
        lastIn = nextIn
        setInOutPointsWithoutHistory(nextIn, nextIn + span)
        // Preview follows the leading edge; the playhead stays put (suppressed).
        usePlaybackStore.getState().setPreviewFrame(nextIn)
        return label
      },
      () => {
        document.body.style.cursor = prevCursor
        usePlaybackStore.getState().setPreviewFrame(null)
        suppressPlayheadPreviewRef.current = false
        useTimelineSettingsStore.getState().markDirty()
        dragCleanup = null
      },
    )
    if (!cleanup) return
    document.body.style.cursor = 'grabbing'
    // Keep the preview live but pin the host playhead while dragging.
    suppressPlayheadPreviewRef.current = true
    dragCleanup = cleanup
  }

  const startDrag = (side: 'in' | 'out') => (event: PointerEvent) => {
    const laneElement = lane.current
    if (!laneElement) return

    const setFrame = side === 'in' ? setInPoint : setOutPoint
    const prevCursor = document.body.style.cursor

    const cleanup = beginIoPointerDrag(
      event,
      (clientX) => {
        const rect = laneElement.getBoundingClientRect()
        if (rect.width <= 0) return
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const frame = Math.round(ratio * timelineMaxFrame)
        setFrame(frame)
        // Skim the preview to the boundary; out is exclusive, so show out - 1.
        const previewFrame = side === 'out' ? Math.max(0, frame - 1) : frame
        usePlaybackStore.getState().setPreviewFrame(previewFrame)
        return formatTimecodeCompact(frame, useTimelineSettingsStore.getState().fps)
      },
      () => {
        document.body.style.cursor = prevCursor
        usePlaybackStore.getState().setPreviewFrame(null)
        suppressPlayheadPreviewRef.current = false
        dragCleanup = null
      },
    )
    if (!cleanup) return
    document.body.style.cursor = 'col-resize'
    // Keep the preview live but pin the host playhead while dragging.
    suppressPlayheadPreviewRef.current = true
    dragCleanup = cleanup
  }

  const inRatio = $derived(model.inPoint?.positionRatio ?? null)
  const outRatio = $derived(model.outPoint?.positionRatio ?? null)
  const spanPx = $derived(
    inRatio !== null && outRatio !== null ? (outRatio - inRatio) * laneMeasure.width : null,
  )
</script>

<div
  {@attach laneMeasure.measureRef}
  class="pointer-events-none absolute inset-y-0 right-0"
  data-testid={`${testIdPrefix}-io-lane`}
  style:left="{labelWidth}px"
>
  {#if model.ioRange}
    <IoRangeStrip
      left={`${model.ioRange.startRatio * 100}%`}
      width={`${(model.ioRange.endRatio - model.ioRange.startRatio) * 100}%`}
      height={MINI_TIMELINE_IO_LANE_HEIGHT}
      onDragStart={startRangeDrag}
      testId={`${testIdPrefix}-io-strip`}
      zIndex={1}
    />
  {/if}

  <IoRangeHandles
    inLeft={inRatio !== null ? `${inRatio * 100}%` : null}
    outLeft={outRatio !== null ? `${outRatio * 100}%` : null}
    {spanPx}
    laneHeight={MINI_TIMELINE_IO_LANE_HEIGHT}
    handleWidth={MINI_TIMELINE_IO_HANDLE_WIDTH}
    zIndex={2}
    onInDragStart={startDrag('in')}
    onOutDragStart={startDrag('out')}
    inTitle={t('editor.miniTimeline.inPoint')}
    outTitle={t('editor.miniTimeline.outPoint')}
    {testIdPrefix}
  />
</div>
