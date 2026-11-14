<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type {
    KeyframeNavigatorDragTarget,
    KeyframeNavigatorViewport,
  } from './compact-navigator-utils'

  type DragTarget = 'thumb' | KeyframeNavigatorDragTarget | null

  interface NavigatorViewportHandoff {
    from: KeyframeNavigatorViewport
    to: KeyframeNavigatorViewport
  }

  function isSameViewport(a: KeyframeNavigatorViewport, b: KeyframeNavigatorViewport): boolean {
    return a.startFrame === b.startFrame && a.endFrame === b.endFrame
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { attachWindowDragListeners } from '@/shared/utils/window-drag-listeners'

  import {
    getKeyframeNavigatorResizeDragResult,
    getKeyframeNavigatorThumbMetrics,
    getStartFrameFromNavigatorThumbLeft,
  } from './compact-navigator-utils'

  interface CompactNavigatorProps {
    viewport: KeyframeNavigatorViewport
    currentFrame: number
    contentFrameMax: number
    minVisibleFrames: number
    disabled?: boolean
    onViewportChange: (viewport: KeyframeNavigatorViewport) => void
    onViewportPreviewStart?: () => void
    onViewportPreview?: (viewport: KeyframeNavigatorViewport | null) => void
  }

  interface NavigatorDragSnapshot {
    startX: number
    thumbLeft: number
    thumbWidth: number
    trackWidth: number
    viewport: KeyframeNavigatorViewport
    metrics: ReturnType<typeof getKeyframeNavigatorThumbMetrics>
  }

  let {
    viewport,
    currentFrame,
    contentFrameMax,
    minVisibleFrames,
    disabled = false,
    onViewportChange,
    onViewportPreviewStart,
    onViewportPreview,
  }: CompactNavigatorProps = $props()

  let track = $state<HTMLDivElement | null>(null)
  let thumb: HTMLDivElement | null = null
  let trackWidth = $state(0)
  let dragTarget = $state<DragTarget>(null)
  // Drag bookkeeping stays out of reactivity: the thumb is moved imperatively
  // during a drag, and these are only read when something else re-renders.
  let dragSnapshot: NavigatorDragSnapshot | null = null
  let latestPreviewViewport: KeyframeNavigatorViewport | null = null
  let viewportHandoff: NavigatorViewportHandoff | null = null
  let pendingPreviewViewport: KeyframeNavigatorViewport | null = null
  const previewAnimationFrameRef: { current: number | null } = { current: null }

  const renderedViewport = $derived.by(() => {
    // Re-read the drag bookkeeping whenever a drag starts or ends.
    void dragTarget
    const settledViewport =
      viewportHandoff && isSameViewport(viewport, viewportHandoff.from)
        ? viewportHandoff.to
        : viewport
    return latestPreviewViewport ?? settledViewport
  })

  const metrics = $derived(
    getKeyframeNavigatorThumbMetrics({
      viewport: renderedViewport,
      contentFrameMax,
      trackWidth,
    }),
  )

  const playheadLeft = $derived(
    trackWidth > 0
      ? Math.max(
          metrics.edgeInset,
          Math.min(
            metrics.edgeInset + metrics.usableTrackWidth,
            metrics.edgeInset +
              (Math.max(0, Math.min(metrics.contentFrameMax, currentFrame)) /
                metrics.contentFrameMax) *
                metrics.usableTrackWidth,
          ),
        )
      : 0,
  )

  function handleMouseDown(event: MouseEvent, target: Exclude<DragTarget, null>) {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    const nextTrackWidth = track?.clientWidth ?? trackWidth
    const startMetrics = getKeyframeNavigatorThumbMetrics({
      viewport: renderedViewport,
      contentFrameMax,
      trackWidth: nextTrackWidth,
    })
    dragSnapshot = {
      startX: event.clientX,
      thumbLeft: startMetrics.thumbLeft,
      thumbWidth: startMetrics.thumbWidth,
      trackWidth: nextTrackWidth,
      viewport: renderedViewport,
      metrics: startMetrics,
    }
    viewportHandoff = null
    latestPreviewViewport = null
    onViewportPreviewStart?.()
    dragTarget = target
  }

  function handleTrackClick(event: MouseEvent) {
    if (
      disabled ||
      !track ||
      dragTarget ||
      metrics.maxStartFrame <= 0 ||
      metrics.thumbTravel <= 0
    ) {
      return
    }

    const rect = track.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const desiredThumbLeft = Math.max(
      metrics.edgeInset,
      Math.min(metrics.edgeInset + metrics.thumbTravel, clickX - metrics.thumbWidth / 2),
    )
    const nextStartFrame = getStartFrameFromNavigatorThumbLeft(desiredThumbLeft, metrics)
    onViewportChange({
      startFrame: nextStartFrame,
      endFrame: nextStartFrame + metrics.visibleFrameRange,
    })
  }

  $effect.pre(() => {
    const currentViewport = viewport
    const activeDrag = dragTarget
    const { thumbLeft, thumbWidth } = metrics
    const handoff = viewportHandoff
    if (
      handoff &&
      (isSameViewport(currentViewport, handoff.to) ||
        !isSameViewport(currentViewport, handoff.from))
    ) {
      viewportHandoff = null
    }
    if (activeDrag || !thumb) return
    thumb.style.left = `${thumbLeft}px`
    thumb.style.width = `${thumbWidth}px`
  })

  $effect(() => {
    const node = track
    if (!node) return

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
    const activeDrag = dragTarget
    if (!activeDrag || disabled) return

    const handleMouseMove = (event: MouseEvent) => {
      const snapshot = dragSnapshot
      if (!snapshot || snapshot.trackWidth <= 0) return

      const deltaX = event.clientX - snapshot.startX
      let nextViewport: KeyframeNavigatorViewport

      if (activeDrag === 'thumb') {
        if (snapshot.metrics.thumbTravel <= 0 || snapshot.metrics.maxStartFrame <= 0) return
        const nextThumbLeft = Math.max(
          snapshot.metrics.edgeInset,
          Math.min(
            snapshot.metrics.edgeInset + snapshot.metrics.thumbTravel,
            snapshot.thumbLeft + deltaX,
          ),
        )
        const nextStartFrame = getStartFrameFromNavigatorThumbLeft(nextThumbLeft, snapshot.metrics)
        nextViewport = {
          startFrame: nextStartFrame,
          endFrame: nextStartFrame + snapshot.metrics.visibleFrameRange,
        }
      } else {
        nextViewport = getKeyframeNavigatorResizeDragResult({
          dragTarget: activeDrag,
          deltaX,
          dragStartThumbWidth: snapshot.thumbWidth,
          trackWidth: snapshot.trackWidth,
          viewport: snapshot.viewport,
          contentFrameMax,
          minVisibleFrames,
        })
      }

      latestPreviewViewport = nextViewport
      const previewMetrics = getKeyframeNavigatorThumbMetrics({
        viewport: nextViewport,
        contentFrameMax,
        trackWidth: snapshot.trackWidth,
      })
      if (thumb) {
        thumb.style.left = `${previewMetrics.thumbLeft}px`
        thumb.style.width = `${previewMetrics.thumbWidth}px`
      }
      pendingPreviewViewport = nextViewport
      if (previewAnimationFrameRef.current === null) {
        previewAnimationFrameRef.current = requestAnimationFrame(() => {
          previewAnimationFrameRef.current = null
          const pendingViewport = pendingPreviewViewport
          pendingPreviewViewport = null
          if (!pendingViewport) return
          if (onViewportPreview) onViewportPreview(pendingViewport)
          else onViewportChange(pendingViewport)
        })
      }
    }

    const handleMouseUp = () => {
      if (previewAnimationFrameRef.current !== null) {
        cancelAnimationFrame(previewAnimationFrameRef.current)
        previewAnimationFrameRef.current = null
      }
      pendingPreviewViewport = null
      const finalViewport = latestPreviewViewport
      if (finalViewport) {
        const dragStartViewport = dragSnapshot?.viewport
        viewportHandoff =
          dragStartViewport && !isSameViewport(dragStartViewport, finalViewport)
            ? { from: dragStartViewport, to: finalViewport }
            : null
        onViewportPreview?.(finalViewport)
        onViewportChange(finalViewport)
      }
      onViewportPreview?.(null)
      latestPreviewViewport = null
      dragSnapshot = null
      dragTarget = null
    }

    const detachWindowDragListeners = attachWindowDragListeners(
      handleMouseMove,
      handleMouseUp,
      previewAnimationFrameRef,
    )

    return () => {
      detachWindowDragListeners()
      pendingPreviewViewport = null
      if (dragSnapshot) onViewportPreview?.(null)
    }
  })
</script>

<div class="h-5 border-t border-border bg-background/80 px-2 py-1">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    class={cn('relative h-full rounded-sm bg-secondary/70', disabled && 'opacity-50')}
    onclick={handleTrackClick}
  >
    <div
      class="pointer-events-none absolute inset-y-0 w-px bg-primary/70"
      style:left="{playheadLeft}px"
    ></div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      bind:this={thumb}
      class={cn(
        'absolute top-0 flex h-full items-center justify-between rounded-sm bg-muted-foreground/55 transition-colors',
        disabled
          ? 'cursor-default'
          : dragTarget
            ? 'cursor-grabbing bg-muted-foreground/75'
            : 'cursor-grab hover:bg-muted-foreground/70',
      )}
      style:left="{metrics.thumbLeft}px"
      style:width="{metrics.thumbWidth}px"
      onmousedown={disabled ? undefined : (event) => handleMouseDown(event, 'thumb')}
      onclick={(event) => event.stopPropagation()}
      data-testid="keyframe-navigator-thumb"
    >
      <div
        data-testid="keyframe-navigator-left-handle"
        class={cn(
          'flex h-full w-2 items-center justify-center',
          disabled ? 'cursor-default' : 'cursor-ew-resize',
        )}
        onmousedown={disabled ? undefined : (event) => handleMouseDown(event, 'left')}
      >
        <div class="h-1.5 w-0.5 rounded-full bg-background/90"></div>
      </div>
      <div class="h-1.5 w-5 rounded-full bg-background/25"></div>
      <div
        data-testid="keyframe-navigator-right-handle"
        class={cn(
          'flex h-full w-2 items-center justify-center',
          disabled ? 'cursor-default' : 'cursor-ew-resize',
        )}
        onmousedown={disabled ? undefined : (event) => handleMouseDown(event, 'right')}
      >
        <div class="h-1.5 w-0.5 rounded-full bg-background/90"></div>
      </div>
    </div>
  </div>
</div>
