<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { getKeyframeNavigatorThumbMetrics as GetMetrics } from './compact-navigator-utils'

  const DRAG_THRESHOLD_PX = 2
  type MarqueeMode = 'replace' | 'add' | 'toggle'

  interface KeyframeTimingStripMarker {
    id: string
    frame: number
    selected: boolean
    draggable: boolean
  }

  interface DragState {
    pointerId: number
    startClientX: number
    started: boolean
    selectedIds: string[]
  }

  interface MarqueeState {
    pointerId: number
    startClientX: number
    currentClientX: number
    started: boolean
    mode: MarqueeMode
    baseSelection: Set<string>
  }

  function getMarkerLabel(marker: KeyframeTimingStripMarker, frame: number): string {
    if (marker.selected && marker.draggable) {
      return `Slide selected keyframe at frame ${frame}`
    }

    if (marker.selected) {
      return `Selected keyframe at frame ${frame}`
    }

    return `Select keyframe at frame ${frame}`
  }

  function getMarkerLeft(frame: number, metrics: ReturnType<typeof GetMetrics>): number {
    const maxFrame = Math.max(1, metrics.contentFrameMax - 1)
    return Math.max(
      metrics.edgeInset,
      Math.min(
        metrics.edgeInset + metrics.usableTrackWidth,
        metrics.edgeInset +
          (Math.max(0, Math.min(maxFrame, frame)) / maxFrame) * metrics.usableTrackWidth,
      ),
    )
  }

  function getMarqueeModeFromPointerEvent(
    event: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ): MarqueeMode {
    return event.shiftKey ? 'add' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace'
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { resolveMarqueeSelection } from '../marquee-selection'

  import {
    getKeyframeNavigatorThumbMetrics,
    type KeyframeNavigatorViewport,
  } from './compact-navigator-utils'
  import { addWindowPointerListeners } from './dopesheet-pointer-listeners'

  interface KeyframeTimingStripProps {
    viewport: KeyframeNavigatorViewport
    contentFrameMax: number
    markers: KeyframeTimingStripMarker[]
    previewFrames?: Record<string, number> | null
    disabled?: boolean
    onSelectionChange?: (selectedIds: Set<string>) => void
    onSlideStart?: (selectedIds: string[]) => void
    onSlideChange?: (deltaFrames: number, selectedIds: string[]) => void
    onSlideEnd?: (selectedIds: string[]) => void
    onSlideCancel?: (selectedIds: string[]) => void
  }

  let {
    viewport,
    contentFrameMax,
    markers,
    previewFrames = null,
    disabled = false,
    onSelectionChange,
    onSlideStart,
    onSlideChange,
    onSlideEnd,
    onSlideCancel,
  }: KeyframeTimingStripProps = $props()

  let track = $state<HTMLDivElement | null>(null)
  let dragState: DragState | null = null
  let marqueeState: MarqueeState | null = null
  let trackWidth = $state(0)
  let marqueeRange = $state.raw<{ left: number; width: number } | null>(null)

  const metrics = $derived(
    getKeyframeNavigatorThumbMetrics({
      viewport,
      contentFrameMax,
      trackWidth,
      minThumbWidth: 0,
    }),
  )

  const renderedMarkers = $derived(
    markers.map((marker) => ({
      ...marker,
      frame: previewFrames?.[marker.id] ?? marker.frame,
    })),
  )

  function updateMarqueeSelection(state: MarqueeState) {
    if (!track) {
      return
    }

    const rect = track.getBoundingClientRect()
    const startX = state.startClientX - rect.left
    const currentX = state.currentClientX - rect.left
    const minX = Math.min(startX, currentX)
    const maxX = Math.max(startX, currentX)
    const hitIds = new Set(
      renderedMarkers
        .filter((marker) => {
          const left = getMarkerLeft(marker.frame, metrics)
          return left >= minX && left <= maxX
        })
        .map((marker) => marker.id),
    )

    const nextSelection = resolveMarqueeSelection(state.mode, state.baseSelection, hitIds)

    onSelectionChange?.(nextSelection)
    marqueeRange = {
      left: Math.max(0, minX),
      width: Math.max(1, maxX - minX),
    }
  }

  function handleMarkerPointerDown(
    markerId: string,
    isSelected: boolean,
    event: PointerEvent & { currentTarget: HTMLButtonElement },
  ) {
    if (disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const selectedIds = isSelected
      ? markers.filter((marker) => marker.selected).map((marker) => marker.id)
      : [markerId]

    onSelectionChange?.(new Set(selectedIds))
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      started: false,
      selectedIds,
    }
  }

  function handleTrackPointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (disabled || event.button !== 0) {
      return
    }

    event.preventDefault()
    marqueeState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      currentClientX: event.clientX,
      started: false,
      mode: getMarqueeModeFromPointerEvent(event),
      baseSelection: new Set(markers.filter((marker) => marker.selected).map((marker) => marker.id)),
    }
    marqueeRange = null
  }

  $effect(() => {
    const node = track
    if (!node) {
      return
    }

    const updateWidth = () => {
      trackWidth = node.clientWidth
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)
    return () => observer.disconnect()
  })

  $effect(() => {
    // The handlers read the latest props and metrics when they run, so the
    // window listeners are attached once for the component's lifetime.
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragState
      if (drag && drag.pointerId === event.pointerId && metrics.usableTrackWidth > 0) {
        const deltaX = event.clientX - drag.startClientX
        if (!drag.started && Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
          drag.started = true
          onSlideStart?.(drag.selectedIds)
        }

        if (!drag.started) {
          return
        }

        const maxFrame = Math.max(1, metrics.contentFrameMax - 1)
        const deltaFrames = Math.round((deltaX / metrics.usableTrackWidth) * maxFrame)
        onSlideChange?.(deltaFrames, drag.selectedIds)
        return
      }

      const marquee = marqueeState
      if (!marquee || marquee.pointerId !== event.pointerId) {
        return
      }

      marquee.currentClientX = event.clientX
      if (!marquee.started && Math.abs(event.clientX - marquee.startClientX) > DRAG_THRESHOLD_PX) {
        marquee.started = true
      }

      if (!marquee.started) {
        return
      }

      updateMarqueeSelection(marquee)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragState
      if (drag && drag.pointerId === event.pointerId) {
        dragState = null
        if (drag.started) {
          onSlideEnd?.(drag.selectedIds)
        }
        return
      }

      const marquee = marqueeState
      if (!marquee || marquee.pointerId !== event.pointerId) {
        return
      }

      if (!marquee.started && marquee.mode === 'replace') {
        onSelectionChange?.(new Set())
      }

      marqueeState = null
      marqueeRange = null
    }

    const handlePointerCancel = (event: PointerEvent) => {
      const drag = dragState
      if (drag?.pointerId === event.pointerId) {
        dragState = null
        if (drag.started) onSlideCancel?.(drag.selectedIds)
      }

      const marquee = marqueeState
      if (marquee?.pointerId === event.pointerId) {
        marqueeState = null
        marqueeRange = null
      }
    }

    return addWindowPointerListeners(handlePointerMove, handlePointerUp, handlePointerCancel)
  })
</script>

<div class="h-4 border-t border-border/60 bg-background/90 px-2 py-0.5">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    data-testid="keyframe-timing-strip-track"
    class={cn('relative h-full rounded-sm bg-secondary/35', disabled && 'opacity-50')}
    onpointerdown={handleTrackPointerDown}
  >
    <div
      class="pointer-events-none absolute inset-y-[1px] rounded-sm bg-muted-foreground/10"
      style:left="{metrics.thumbLeft}px"
      style:width="{metrics.thumbWidth}px"
    ></div>
    {#if marqueeRange}
      <div
        class="pointer-events-none absolute inset-y-0 rounded-sm bg-primary/20"
        style:left="{marqueeRange.left}px"
        style:width="{marqueeRange.width}px"
      ></div>
    {/if}

    {#each renderedMarkers as marker (marker.id)}
      {@const left = getMarkerLeft(marker.frame, metrics)}
      {@const label = getMarkerLabel(marker, marker.frame)}
      <button
        type="button"
        data-testid="keyframe-timing-strip-marker-{marker.id}"
        class={cn(
          'absolute -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]',
          disabled ? 'cursor-default' : marker.draggable ? 'cursor-ew-resize' : 'cursor-pointer',
          marker.selected
            ? 'h-3 w-3 rounded-[2px] border border-blue-200/70 bg-blue-500 rotate-45'
            : 'h-2 w-2 rounded-full border border-muted-foreground/60 bg-muted-foreground/70',
        )}
        style:left="{left}px"
        style:top="50%"
        onpointerdown={(event) => handleMarkerPointerDown(marker.id, marker.selected, event)}
        title={label}
        aria-label={label}
      >
        <span class="sr-only">{label}</span>
      </button>
    {/each}
  </div>
</div>
