<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TextMotionTimelineBand } from '@/shared/timeline/text-motion-timeline'
  import type { TextMotionSlot } from '@/types/text-motion'

  const DRAG_THRESHOLD_PX = 3

  function getTimelineGridLineStyle(
    ticks: readonly number[],
    frameToX: (frame: number) => number,
  ): string {
    const positions = ticks.map((frame) => Math.round(frameToX(frame)))
    const left = positions[0] ?? 0
    const boxShadow = positions
      .slice(1)
      .map((position) => `${position - left}px 0 currentColor`)
      .join(', ')
    return `left: ${left}px;${boxShadow ? ` box-shadow: ${boxShadow};` : ''}`
  }

  interface DurationDrag {
    pointerId: number
    slot: TextMotionSlot
    startX: number
    startDurationFrames: number
    currentDurationFrames: number
    started: boolean
  }

  interface OffsetDrag {
    pointerId: number
    slot: 'in' | 'out'
    startX: number
    startOffsetFrames: number
    currentOffsetFrames: number
    maxOffsetFrames: number
    started: boolean
  }

  function getMaxOffsetFrames(
    band: TextMotionTimelineBand,
    bands: readonly TextMotionTimelineBand[],
  ): number {
    const length = band.toFrame - band.fromFrame
    if (band.slot === 'in') {
      const outBand = bands.find((candidate) => candidate.slot === 'out')
      const boundary = outBand?.fromFrame ?? band.clipToFrame
      return Math.max(0, Math.floor(boundary - band.clipFromFrame - length))
    }
    if (band.slot === 'out') {
      const inBand = bands.find((candidate) => candidate.slot === 'in')
      const boundary = inBand?.toFrame ?? band.clipFromFrame
      return Math.max(0, Math.floor(band.clipToFrame - boundary - length))
    }
    return 0
  }

  function withoutSlot(
    previous: Partial<Record<TextMotionSlot, number>>,
    slot: TextMotionSlot,
  ): Partial<Record<TextMotionSlot, number>> {
    if (previous[slot] === undefined) return previous
    const next = { ...previous }
    delete next[slot]
    return next
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { getTextMotionPreset } from '@/shared/typography/text-motion'
  import { t } from '$lib/i18n.svelte'
  import type { TextMotionTimelineRowsProps } from './text-motion-timeline-rows'

  let {
    bands,
    gridStyle,
    ticks,
    axisWidth,
    frameToX,
    getPixelsPerFrame,
    disabled,
    onBackgroundPointerDown,
    onDurationDragStart,
    onDurationCommit,
    onDurationCancel,
    onOffsetDragStart,
    onOffsetCommit,
    onOffsetCancel,
    onBandClick,
  }: TextMotionTimelineRowsProps = $props()

  type ButtonPointerEvent = PointerEvent & { currentTarget: HTMLButtonElement }
  type DivPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

  let durationDrag: DurationDrag | null = null
  let offsetDrag: OffsetDrag | null = null
  let suppressClick = false
  let previewDurationBySlot = $state.raw<Partial<Record<TextMotionSlot, number>>>({})
  let previewOffsetBySlot = $state.raw<Partial<Record<TextMotionSlot, number>>>({})

  const beginDurationDrag = (event: ButtonPointerEvent, band: TextMotionTimelineBand) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    suppressClick = false
    durationDrag = {
      pointerId: event.pointerId,
      slot: band.slot,
      startX: event.clientX,
      startDurationFrames: band.durationFrames,
      currentDurationFrames: band.durationFrames,
      started: false,
    }
  }

  const moveDurationDrag = (event: ButtonPointerEvent) => {
    const drag = durationDrag
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const deltaX = event.clientX - drag.startX
    if (!drag.started) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return
      drag.started = true
      onDurationDragStart?.()
    }
    const pixelsPerFrame = Math.max(getPixelsPerFrame(), Number.EPSILON)
    const deltaFrames = Math.round(deltaX / pixelsPerFrame)
    const directedDelta = drag.slot === 'out' ? -deltaFrames : deltaFrames
    const durationFrames = Math.max(1, drag.startDurationFrames + directedDelta)
    if (durationFrames === drag.currentDurationFrames) return
    drag.currentDurationFrames = durationFrames
    previewDurationBySlot = { ...previewDurationBySlot, [drag.slot]: durationFrames }
  }

  const finishDurationDrag = (event: ButtonPointerEvent, commit: boolean) => {
    const drag = durationDrag
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    durationDrag = null
    suppressClick = drag.started
    if (drag.started) {
      if (commit) {
        onDurationCommit?.(drag.slot, drag.currentDurationFrames)
      } else {
        onDurationCancel?.()
      }
    }
    previewDurationBySlot = withoutSlot(previewDurationBySlot, drag.slot)
  }

  const beginOffsetDrag = (event: DivPointerEvent, band: TextMotionTimelineBand) => {
    if (event.button !== 0) return
    if (band.slot === 'loop') {
      event.stopPropagation()
      return
    }
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    suppressClick = false
    offsetDrag = {
      pointerId: event.pointerId,
      slot: band.slot,
      startX: event.clientX,
      startOffsetFrames: band.offsetFrames,
      currentOffsetFrames: band.offsetFrames,
      maxOffsetFrames: getMaxOffsetFrames(band, bands),
      started: false,
    }
  }

  const moveOffsetDrag = (event: DivPointerEvent) => {
    const drag = offsetDrag
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const deltaX = event.clientX - drag.startX
    if (!drag.started) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return
      drag.started = true
      onOffsetDragStart?.()
    }
    const pixelsPerFrame = Math.max(getPixelsPerFrame(), Number.EPSILON)
    const deltaFrames = Math.round(deltaX / pixelsPerFrame)
    const directedDelta = drag.slot === 'out' ? -deltaFrames : deltaFrames
    const offsetFrames = Math.min(
      drag.maxOffsetFrames,
      Math.max(0, drag.startOffsetFrames + directedDelta),
    )
    if (offsetFrames === drag.currentOffsetFrames) return
    drag.currentOffsetFrames = offsetFrames
    previewOffsetBySlot = { ...previewOffsetBySlot, [drag.slot]: offsetFrames }
  }

  const finishOffsetDrag = (event: DivPointerEvent, commit: boolean) => {
    const drag = offsetDrag
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    offsetDrag = null
    suppressClick = drag.started
    if (drag.started) {
      if (commit) {
        onOffsetCommit?.(drag.slot, drag.currentOffsetFrames)
      } else {
        onOffsetCancel?.()
      }
    }
    previewOffsetBySlot = withoutSlot(previewOffsetBySlot, drag.slot)
  }

  const handleBandClick = (event: MouseEvent, slot: TextMotionSlot) => {
    event.stopPropagation()
    if (suppressClick) {
      suppressClick = false
      return
    }
    onBandClick?.(slot)
  }

  const gridLineStyle = $derived(getTimelineGridLineStyle(ticks, frameToX))

  const views = $derived.by(() => {
    const getDurationDelta = (slot: TextMotionSlot) => {
      const band = bands.find((candidate) => candidate.slot === slot)
      if (!band) return 0
      return (previewDurationBySlot[slot] ?? band.durationFrames) - band.durationFrames
    }
    const getOffsetDelta = (slot: TextMotionSlot) => {
      const band = bands.find((candidate) => candidate.slot === slot)
      if (!band) return 0
      return (previewOffsetBySlot[slot] ?? band.offsetFrames) - band.offsetFrames
    }

    return bands.map((band) => {
      const previewDuration = previewDurationBySlot[band.slot] ?? band.durationFrames
      const durationDelta = previewDuration - band.durationFrames
      const previewOffset = previewOffsetBySlot[band.slot] ?? band.offsetFrames
      const offsetDelta = previewOffset - band.offsetFrames
      const previewFrom =
        band.slot === 'in'
          ? band.fromFrame + offsetDelta
          : band.slot === 'out'
            ? band.fromFrame - offsetDelta - durationDelta
            : band.fromFrame + getOffsetDelta('in') + getDurationDelta('in')
      const rawPreviewTo =
        band.slot === 'in'
          ? band.toFrame + offsetDelta + durationDelta
          : band.slot === 'out'
            ? band.toFrame - offsetDelta
            : band.toFrame - getOffsetDelta('out') - getDurationDelta('out')
      const previewTo = Math.max(previewFrom, rawPreviewTo)
      const left = frameToX(previewFrom)
      const width = Math.max(3, frameToX(previewTo) - left)
      const loopHandleFrame = Math.min(previewTo, previewFrom + previewDuration)
      const loopHandleLeft = frameToX(loopHandleFrame) - left
      const preset = getTextMotionPreset(band.presetId)
      const presetLabel = t(preset.labelKey)
      const slotLabel = band.slot.toUpperCase()
      const offsetLabel =
        band.slot !== 'loop' && previewOffset > 0 ? ` · offset ${previewOffset}f` : ''
      const title = `${slotLabel} · ${presetLabel} · ${previewDuration}f${offsetLabel} · ×${band.unitCount}`
      return {
        band,
        previewDuration,
        previewFrom,
        previewTo,
        left,
        width,
        loopHandleFrame,
        loopHandleLeft,
        presetLabel,
        slotLabel,
        title,
      }
    })
  })
</script>

{#each views as view (view.band.slot)}
  {@const band = view.band}
  <div
    data-testid="edit-text-motion-row-{band.slot}"
    class="grid w-full border-b border-border/60"
    style={gridStyle}
  >
    <button
      type="button"
      class="flex min-w-0 items-center gap-2 overflow-hidden px-2 text-left text-[11px] hover:bg-muted/40"
      {disabled}
      onclick={() => onBandClick?.(band.slot)}
      title={view.title}
    >
      <span class="w-8 shrink-0 font-medium text-sky-300">{view.slotLabel}</span>
      <span class="truncate text-muted-foreground">{view.presetLabel}</span>
      <span class="ml-auto shrink-0 tabular-nums text-muted-foreground/70"
        >{view.previewDuration}f</span
      >
    </button>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative h-full overflow-hidden border-l border-border/60"
      onpointerdown={onBackgroundPointerDown}
    >
      <div
        data-motion-viewport-surface
        data-motion-viewport-edge-inset={0}
        data-motion-viewport-axis-width={axisWidth}
        class="absolute inset-0"
      >
        <div
          aria-hidden="true"
          data-motion-grid-frames={ticks.join(',')}
          class="pointer-events-none absolute inset-y-0 w-px bg-current text-border/30"
          style={gridLineStyle}
        ></div>
        <div
          role="button"
          tabindex={disabled ? -1 : 0}
          data-testid="edit-text-motion-band-{band.slot}"
          data-from-frame={view.previewFrom}
          data-to-frame={view.previewTo}
          data-dopesheet-from-frame={view.previewFrom}
          data-dopesheet-to-frame={view.previewTo}
          data-dopesheet-min-width={3}
          aria-label={view.title}
          aria-disabled={disabled}
          title={view.title}
          class={cn(
            'group absolute top-1/2 z-10 h-3 -translate-y-1/2 bg-transparent aria-disabled:cursor-default aria-disabled:opacity-50',
            band.slot === 'loop' ? 'cursor-pointer' : 'touch-none cursor-grab active:cursor-grabbing',
          )}
          style:left="{view.left}px"
          style:width="{view.width}px"
          onpointerdown={(event) => beginOffsetDrag(event, band)}
          onpointermove={moveOffsetDrag}
          onpointerup={(event) => finishOffsetDrag(event, true)}
          onpointercancel={(event) => finishOffsetDrag(event, false)}
          onclick={(event) => handleBandClick(event, band.slot)}
          onkeydown={(event) => {
            if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            onBandClick?.(band.slot)
          }}
        >
          <span
            aria-hidden="true"
            data-testid="edit-text-motion-band-{band.slot}-visual"
            class="pointer-events-none absolute inset-0 rounded-[2px] bg-sky-400/40"
          ></span>
          <button
            type="button"
            data-testid="edit-text-motion-band-{band.slot}-handle"
            aria-label="{view.slotLabel} Text Animation duration handle"
            title="{view.slotLabel} duration · {view.previewDuration}f"
            {disabled}
            class={cn(
              'absolute inset-y-0 z-10 w-2 bg-transparent transition-colors enabled:cursor-ew-resize enabled:hover:bg-sky-100/10 disabled:cursor-default',
              band.slot === 'out' && 'left-0',
              band.slot === 'in' && 'right-0',
            )}
            style:left={band.slot === 'loop' ? `${view.loopHandleLeft}px` : undefined}
            style:transform={band.slot === 'loop' ? 'translateX(-50%)' : undefined}
            data-dopesheet-relative-frame={band.slot === 'loop' ? view.loopHandleFrame : undefined}
            onpointerdown={(event) => beginDurationDrag(event, band)}
            onpointermove={moveDurationDrag}
            onpointerup={(event) => finishDurationDrag(event, true)}
            onpointercancel={(event) => finishDurationDrag(event, false)}
            onclick={(event) => handleBandClick(event, band.slot)}
          >
            <span
              aria-hidden="true"
              class={cn(
                'pointer-events-none absolute inset-y-0.5 w-px rounded-full bg-sky-100/80 shadow-[0_0_0_1px_rgba(2,132,199,0.22)] transition-colors group-hover:bg-sky-50',
                band.slot === 'out'
                  ? 'left-0.5'
                  : band.slot === 'in'
                    ? 'right-0.5'
                    : 'left-1/2 -translate-x-1/2',
              )}
            ></span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/each}
