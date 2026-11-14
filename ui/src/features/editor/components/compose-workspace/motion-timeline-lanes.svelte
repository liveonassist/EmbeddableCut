<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const PROCEDURAL_HATCH =
    'repeating-linear-gradient(45deg, rgba(56,189,248,0.55) 0 2px, transparent 2px 5px)'
</script>

<script lang="ts">
  import { LAYER_COLUMN_WIDTH } from './motion-timeline-primitives'
  import type { MotionTimeViewport } from './motion-time-viewport-controller'
  import {
    beginTextMotionEdit,
    commitTextMotionEdit,
    updateTextMotionLive,
  } from '@/features/editor/deps/timeline-store'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'
  import type { TextMotionTimelineBand } from '@/shared/timeline/text-motion-timeline'
  import type { TextMotionSlot } from '@/types/text-motion'

  type DivPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLDivElement }

  let {
    itemId,
    bands,
    timeViewport,
  }: {
    itemId: string
    bands: TextMotionTimelineBand[]
    timeViewport: MotionTimeViewport
  } = $props()

  let drag: {
    pointerId: number
    slot: TextMotionSlot
    startX: number
    startDurationFrames: number
    currentDurationFrames: number
    laneWidth: number
    before: ReturnType<typeof beginTextMotionEdit> | null
  } | null = null
  let suppressClick = false
  let previewDurationBySlot = $state.raw<Partial<Record<TextMotionSlot, number>>>({})
  const visibleFrameRange = $derived(Math.max(1, timeViewport.endFrame - timeViewport.startFrame))

  function beginDurationDrag(event: DivPointerEvent, band: TextMotionTimelineBand) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const laneWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    if (laneWidth <= 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag = {
      pointerId: event.pointerId,
      slot: band.slot,
      startX: event.clientX,
      startDurationFrames: band.durationFrames,
      currentDurationFrames: band.durationFrames,
      laneWidth,
      before: null,
    }
  }

  function moveDurationDrag(event: DivPointerEvent) {
    const current = drag
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const deltaFrames = ((event.clientX - current.startX) / current.laneWidth) * visibleFrameRange
    if (!current.before) {
      if (Math.abs(event.clientX - current.startX) < 3) return
      current.before = beginTextMotionEdit()
    }
    const directedDelta = current.slot === 'out' ? -deltaFrames : deltaFrames
    const durationFrames = Math.max(1, Math.round(current.startDurationFrames + directedDelta))
    if (durationFrames === current.currentDurationFrames) return
    current.currentDurationFrames = durationFrames
    // Keep the high-frequency preview local to these tiny band rows. A live
    // item-store write invalidates the full expanded dopesheet on every tick.
    previewDurationBySlot = { ...previewDurationBySlot, [current.slot]: durationFrames }
  }

  function finishDurationDrag(event: DivPointerEvent, commit: boolean) {
    const current = drag
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    drag = null
    suppressClick = commit && current.before !== null
    if (commit && current.before) {
      updateTextMotionLive([itemId], current.slot, {
        durationFrames: current.currentDurationFrames,
      })
      commitTextMotionEdit(current.before, { slot: current.slot, itemIds: [itemId] })
    }
    if (previewDurationBySlot[current.slot] !== undefined) {
      const next = { ...previewDurationBySlot }
      delete next[current.slot]
      previewDurationBySlot = next
    }
  }

  function openAnimationInspector(event: MouseEvent) {
    event.stopPropagation()
    if (suppressClick) {
      suppressClick = false
      return
    }
    useSelectionStore.getState().selectItems([itemId])
    const editor = useEditorStore.getState()
    editor.setRightSidebarOpen(true)
    editor.setClipInspectorTab('audio')
  }
</script>

<div data-testid="motion-text-procedural-lanes">
  {#each bands as band (band.slot)}
    {@const previewDuration = previewDurationBySlot[band.slot] ?? band.durationFrames}
    {@const durationDelta = previewDuration - band.durationFrames}
    {@const previewFromFrame = band.slot === 'out' ? band.fromFrame - durationDelta : band.fromFrame}
    {@const previewToFrame = band.slot === 'out' ? band.toFrame : band.toFrame + durationDelta}
    {@const left = ((previewFromFrame - timeViewport.startFrame) / visibleFrameRange) * 100}
    {@const width = ((previewToFrame - previewFromFrame) / visibleFrameRange) * 100}
    <div class="flex h-7 border-t border-border/45 bg-background/25">
      <div
        class="flex shrink-0 items-center border-r border-border pl-14 pr-2 text-[9px] text-sky-300/90"
        style:width="{LAYER_COLUMN_WIDTH}px"
      >
        <span class="w-8 uppercase tracking-[0.08em]">{band.slot}</span>
        <span class="truncate text-muted-foreground">{band.presetId}</span>
        <span class="ml-auto pl-2 tabular-nums text-muted-foreground/70">
          {previewDuration}f · {band.unitCount}u
        </span>
      </div>
      <div class="relative h-7 min-w-0 flex-1 overflow-hidden">
        <div data-motion-viewport-surface class="absolute inset-0 overflow-hidden">
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div
            data-testid={`motion-text-procedural-band-${band.slot}`}
            data-motion-span-drag-visual
            data-from-frame={previewFromFrame}
            data-to-frame={previewToFrame}
            class="absolute top-1/2 h-4 -translate-y-1/2 touch-none cursor-ew-resize rounded-sm border border-sky-300/45 bg-sky-400/10 transition-[border-color,background-color] hover:border-sky-200/80 hover:bg-sky-400/20 active:border-sky-100"
            style:left="{left}%"
            style:width="{Math.max(0.5, width)}%"
            style:background-image={PROCEDURAL_HATCH}
            title={`${band.presetId} · drag to change duration · ${previewDuration}f · ${band.unitCount} units`}
            onpointerdown={(event) => beginDurationDrag(event, band)}
            onpointermove={moveDurationDrag}
            onpointerup={(event) => finishDurationDrag(event, true)}
            onpointercancel={(event) => finishDurationDrag(event, false)}
            onclick={openAnimationInspector}
          ></div>
        </div>
      </div>
    </div>
  {/each}
</div>
