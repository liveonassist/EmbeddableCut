<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import {
    getNavigatorResizeDragResult,
    getNavigatorThumbMetrics,
  } from './timeline-navigator-utils'

  type DragTarget = 'thumb' | 'left' | 'right' | null

  interface NavigatorDragSnapshot {
    startX: number
    lastX: number
    thumbLeft: number
    thumbWidth: number
    trackWidth: number
    timelineWidth: number
    scrollLeft: number
    maxScrollLeft: number
    thumbTravel: number
  }

  interface NavigatorDragPreview {
    timelineWidth: number
    scrollLeft: number
    thumbLeft: number
    thumbWidth: number
    zoom?: number
  }

  interface NavigatorViewHandoff {
    from: Pick<NavigatorDragPreview, 'timelineWidth' | 'scrollLeft'>
    to: Pick<NavigatorDragPreview, 'timelineWidth' | 'scrollLeft'>
    thumbLeft: number
    thumbWidth: number
  }

  interface NavigatorDragPreviewInput {
    dragTarget: Exclude<DragTarget, null>
    snapshot: NavigatorDragSnapshot
    deltaX: number
    viewportWidth: number
    contentDuration: number
  }

  function shouldRebaseDrag(snapshot: NavigatorDragSnapshot, nextTrackWidth: number): boolean {
    return nextTrackWidth > 0 && Math.abs(nextTrackWidth - snapshot.trackWidth) >= 0.5
  }

  function getDragView(
    snapshot: NavigatorDragSnapshot,
    preview: NavigatorDragPreview | null,
  ): Pick<NavigatorDragPreview, 'timelineWidth' | 'scrollLeft'> {
    if (preview) {
      return { timelineWidth: preview.timelineWidth, scrollLeft: preview.scrollLeft }
    }
    return { timelineWidth: snapshot.timelineWidth, scrollLeft: snapshot.scrollLeft }
  }

  function updateNavigatorThumb(
    thumb: HTMLDivElement | null,
    metrics: Pick<NavigatorDragPreview, 'thumbLeft' | 'thumbWidth'>,
  ): void {
    if (!thumb) return
    thumb.style.left = `${metrics.thumbLeft}px`
    thumb.style.width = `${metrics.thumbWidth}px`
  }

  function getNavigatorDragPreview({
    dragTarget,
    snapshot,
    deltaX,
    viewportWidth,
    contentDuration,
  }: NavigatorDragPreviewInput): NavigatorDragPreview | null {
    if (dragTarget === 'thumb') {
      if (snapshot.thumbTravel <= 0 || snapshot.maxScrollLeft <= 0) return null
      const nextThumbLeft = Math.max(
        0,
        Math.min(snapshot.thumbTravel, snapshot.thumbLeft + deltaX),
      )
      return {
        timelineWidth: snapshot.timelineWidth,
        scrollLeft: (nextThumbLeft / snapshot.thumbTravel) * snapshot.maxScrollLeft,
        thumbLeft: nextThumbLeft,
        thumbWidth: snapshot.thumbWidth,
      }
    }

    if (contentDuration <= 0) return null
    const result = getNavigatorResizeDragResult({
      dragTarget,
      deltaX,
      dragStartThumbLeft: snapshot.thumbLeft,
      dragStartThumbWidth: snapshot.thumbWidth,
      trackWidth: snapshot.trackWidth,
      viewportWidth,
      contentDuration,
    })
    const previewMetrics = getNavigatorThumbMetrics({
      timelineWidth: result.nextTimelineWidth,
      viewportWidth,
      trackWidth: snapshot.trackWidth,
      scrollLeft: result.nextScrollLeft,
    })
    return {
      timelineWidth: result.nextTimelineWidth,
      scrollLeft: result.nextScrollLeft,
      thumbLeft: previewMetrics.thumbLeft,
      thumbWidth: previewMetrics.thumbWidth,
      zoom: result.nextZoom,
    }
  }

  function isSameNavigatorView(
    timelineWidth: number,
    scrollLeft: number,
    view: Pick<NavigatorDragPreview, 'timelineWidth' | 'scrollLeft'>,
  ): boolean {
    return (
      Math.abs(timelineWidth - view.timelineWidth) < 0.5 &&
      Math.abs(scrollLeft - view.scrollLeft) < 0.5
    )
  }

  function isNavigatorViewHandoffState(
    timelineWidth: number,
    scrollLeft: number,
    handoff: NavigatorViewHandoff,
  ): boolean {
    const timelineWidthIsExpected =
      Math.abs(timelineWidth - handoff.from.timelineWidth) < 0.5 ||
      Math.abs(timelineWidth - handoff.to.timelineWidth) < 0.5
    const scrollLeftIsExpected =
      Math.abs(scrollLeft - handoff.from.scrollLeft) < 0.5 ||
      Math.abs(scrollLeft - handoff.to.scrollLeft) < 0.5
    return timelineWidthIsExpected && scrollLeftIsExpected
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { notifyTimelineLiveScroll } from '@/shared/timeline/live-scroll-sync'
  import { getTimelineWidth } from '@/features/timeline/utils/timeline-layout'
  import { cn } from '@/shared/ui/cn'
  import { attachWindowDragListeners } from '@/shared/utils/window-drag-listeners'

  interface TimelineNavigatorProps {
    actualDuration: number
    scrollContainer: HTMLDivElement | null
  }

  let { actualDuration, scrollContainer }: TimelineNavigatorProps = $props()

  let track = $state<HTMLDivElement | null>(null)
  let thumb = $state<HTMLDivElement | null>(null)
  // Mutable refs, read and written outside rendering like React's refs.
  const dragRaf: { current: number | null } = { current: null }
  const refs: {
    releaseScrollRaf: number | null
    dragSnapshot: NavigatorDragSnapshot | null
    pendingPreview: NavigatorDragPreview | null
    latestPreview: NavigatorDragPreview | null
    viewHandoff: NavigatorViewHandoff | null
    livePixelsPerSecond: number
    liveScrollLeft: number
  } = {
    releaseScrollRaf: null,
    dragSnapshot: null,
    pendingPreview: null,
    latestPreview: null,
    viewHandoff: null,
    livePixelsPerSecond: useZoomStore.getState().pixelsPerSecond,
    liveScrollLeft: useTimelineViewportStore.getState().scrollLeft,
  }
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const viewportWidth = select(useTimelineViewportStore, (s) => s.viewportWidth)

  let trackWidth = $state(0)
  let dragTarget = $state<DragTarget>(null)

  const maxFrame = select(useItemsStore, (s) => s.maxItemEndFrame)

  const contentDuration = $derived.by(() => {
    const furthestEndSeconds = maxFrame.current / fps.current
    return Math.max(actualDuration, furthestEndSeconds, 10)
  })

  // The timeline content deliberately defers its expensive settled geometry
  // while wheel zoom is active. The navigator is lightweight and should mirror
  // the live geometry so its thumb does not jump only after input settles.
  // Like React's render, this reads the live refs only when one of the
  // reactive inputs changes; scroll and zoom move the thumb imperatively.
  const renderedView = $derived.by(() => {
    void [trackWidth, dragTarget, scrollContainer]
    const currentViewportWidth = viewportWidth.current
    const duration = contentDuration
    return untrack(() => {
      const navigatorTimelineWidth = getTimelineWidth({
        contentWidth: duration * refs.livePixelsPerSecond,
        viewportWidth: currentViewportWidth,
      })
      const navigatorScrollLeft = refs.liveScrollLeft

      const currentMetrics = getNavigatorThumbMetrics({
        timelineWidth: navigatorTimelineWidth,
        viewportWidth: currentViewportWidth,
        trackWidth,
        scrollLeft: navigatorScrollLeft,
      })
      const handoff = refs.viewHandoff
      const renderedMetrics = refs.latestPreview
        ? {
            thumbLeft: refs.latestPreview.thumbLeft,
            thumbWidth: refs.latestPreview.thumbWidth,
          }
        : handoff &&
            isNavigatorViewHandoffState(navigatorTimelineWidth, navigatorScrollLeft, handoff)
          ? { thumbLeft: handoff.thumbLeft, thumbWidth: handoff.thumbWidth }
          : currentMetrics
      return {
        navigatorTimelineWidth,
        navigatorScrollLeft,
        thumbLeft: renderedMetrics.thumbLeft,
        thumbWidth: renderedMetrics.thumbWidth,
      }
    })
  })
  const navigatorTimelineWidth = $derived(renderedView.navigatorTimelineWidth)
  const navigatorScrollLeft = $derived(renderedView.navigatorScrollLeft)
  const thumbLeft = $derived(renderedView.thumbLeft)
  const thumbWidth = $derived(renderedView.thumbWidth)

  const setScrollLeftOnContainer = (nextScrollLeft: number) => {
    const node = scrollContainer
    if (!node) return
    node.scrollLeft = nextScrollLeft
    refs.liveScrollLeft = node.scrollLeft
    // The Edit keyframe lane lives outside this native scroller. Publish the
    // navigator's zoom/pan geometry in the same RAF as the DOM write so it can
    // update its compositor transform before paint instead of waiting for the
    // browser's later native scroll event. This is intentionally imperative:
    // no store update is added to the pointer hot path.
    notifyTimelineLiveScroll(node)
  }

  const getLiveNavigatorMetrics = () => {
    const nextTrackWidth = track?.clientWidth ?? trackWidth
    const nextPixelsPerSecond = useZoomStore.getState().pixelsPerSecond
    const nextScrollLeft = scrollContainer?.scrollLeft ?? refs.liveScrollLeft
    const nextTimelineWidth = getTimelineWidth({
      contentWidth: contentDuration * nextPixelsPerSecond,
      viewportWidth: viewportWidth.current,
    })

    refs.livePixelsPerSecond = nextPixelsPerSecond
    refs.liveScrollLeft = nextScrollLeft
    return {
      timelineWidth: nextTimelineWidth,
      scrollLeft: nextScrollLeft,
      metrics: getNavigatorThumbMetrics({
        timelineWidth: nextTimelineWidth,
        viewportWidth: viewportWidth.current,
        trackWidth: nextTrackWidth,
        scrollLeft: nextScrollLeft,
      }),
    }
  }

  const syncThumbToLiveGeometry = () => {
    if (refs.dragSnapshot || !thumb) return
    const live = getLiveNavigatorMetrics()
    updateNavigatorThumb(thumb, live.metrics)
  }

  const rebaseActiveDragToTrackWidth = (nextTrackWidth: number) => {
    const snapshot = refs.dragSnapshot
    if (!snapshot) return
    if (!shouldRebaseDrag(snapshot, nextTrackWidth)) return

    const preview = refs.latestPreview
    const { timelineWidth: nextTimelineWidth, scrollLeft: nextScrollLeft } = getDragView(
      snapshot,
      preview,
    )
    const nextMetrics = getNavigatorThumbMetrics({
      timelineWidth: nextTimelineWidth,
      viewportWidth: viewportWidth.current,
      trackWidth: nextTrackWidth,
      scrollLeft: nextScrollLeft,
    })

    refs.dragSnapshot = {
      ...snapshot,
      startX: snapshot.lastX,
      thumbLeft: nextMetrics.thumbLeft,
      thumbWidth: nextMetrics.thumbWidth,
      trackWidth: nextTrackWidth,
      timelineWidth: nextTimelineWidth,
      scrollLeft: nextScrollLeft,
      maxScrollLeft: nextMetrics.maxScrollLeft,
      thumbTravel: nextMetrics.thumbTravel,
    }

    if (!preview) return
    const rebasedPreview = {
      ...preview,
      thumbLeft: nextMetrics.thumbLeft,
      thumbWidth: nextMetrics.thumbWidth,
    }
    refs.latestPreview = rebasedPreview
    if (refs.pendingPreview) refs.pendingPreview = rebasedPreview
    updateNavigatorThumb(thumb, nextMetrics)
  }

  const handleMouseDown = (event: MouseEvent, target: Exclude<DragTarget, null>) => {
    event.preventDefault()
    event.stopPropagation()
    if (refs.releaseScrollRaf !== null) {
      cancelAnimationFrame(refs.releaseScrollRaf)
      refs.releaseScrollRaf = null
    }
    const live = getLiveNavigatorMetrics()
    refs.dragSnapshot = {
      startX: event.clientX,
      lastX: event.clientX,
      thumbLeft: live.metrics.thumbLeft,
      thumbWidth: live.metrics.thumbWidth,
      trackWidth: track?.clientWidth ?? trackWidth,
      timelineWidth: live.timelineWidth,
      scrollLeft: live.scrollLeft,
      maxScrollLeft: live.metrics.maxScrollLeft,
      thumbTravel: live.metrics.thumbTravel,
    }
    refs.latestPreview = null
    refs.pendingPreview = null
    refs.viewHandoff = null
    dragTarget = target
  }

  const handleTrackClick = (event: MouseEvent) => {
    const live = getLiveNavigatorMetrics()
    if (
      !track ||
      dragTarget ||
      live.metrics.maxScrollLeft <= 0 ||
      live.metrics.thumbTravel <= 0
    ) {
      return
    }

    const rect = track.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const desiredThumbLeft = Math.max(
      0,
      Math.min(live.metrics.thumbTravel, clickX - live.metrics.thumbWidth / 2),
    )
    const nextScrollLeft =
      (desiredThumbLeft / live.metrics.thumbTravel) * live.metrics.maxScrollLeft
    setScrollLeftOnContainer(nextScrollLeft)
  }

  $effect(() => {
    const element = track
    void viewportWidth.current
    if (!element) return

    return untrack(() => {
      trackWidth = element.clientWidth

      if (typeof ResizeObserver === 'undefined') {
        return
      }

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          const nextTrackWidth = entry.contentRect.width
          rebaseActiveDragToTrackWidth(nextTrackWidth)
          trackWidth = nextTrackWidth
        }
      })

      observer.observe(element)

      return () => {
        observer.disconnect()
      }
    })
  })

  $effect(() => {
    const node = scrollContainer
    let microtaskQueued = false
    let disposed = false
    const scheduleSynchronizedUpdate = () => {
      if (microtaskQueued) return
      microtaskQueued = true
      queueMicrotask(() => {
        microtaskQueued = false
        if (!disposed) syncThumbToLiveGeometry()
      })
    }
    const handleScroll = () => syncThumbToLiveGeometry()
    const unsubscribeZoom = useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond !== previousState.pixelsPerSecond) {
        scheduleSynchronizedUpdate()
      }
    })

    node?.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      disposed = true
      unsubscribeZoom()
      node?.removeEventListener('scroll', handleScroll)
    }
  })

  $effect(() => {
    const activeDragTarget = dragTarget
    const timelineWidth = navigatorTimelineWidth
    const scrollLeft = navigatorScrollLeft
    const left = thumbLeft
    const width = thumbWidth
    const element = thumb
    untrack(() => {
      const nextHandoff = refs.viewHandoff
      if (
        nextHandoff &&
        (isSameNavigatorView(timelineWidth, scrollLeft, nextHandoff.to) ||
          !isNavigatorViewHandoffState(timelineWidth, scrollLeft, nextHandoff))
      ) {
        refs.viewHandoff = null
      }
      if (activeDragTarget || !element) return
      element.style.left = `${left}px`
      element.style.width = `${width}px`
    })
  })

  $effect(() => {
    return () => {
      if (dragRaf.current !== null) {
        cancelAnimationFrame(dragRaf.current)
      }
      if (refs.releaseScrollRaf !== null) {
        cancelAnimationFrame(refs.releaseScrollRaf)
      }
    }
  })

  $effect(() => {
    const activeDragTarget = dragTarget
    void [contentDuration, viewportWidth.current, scrollContainer]
    if (!activeDragTarget) return

    return untrack(() => {
      const flush = () => {
        dragRaf.current = null
        const preview = refs.pendingPreview
        refs.pendingPreview = null
        if (!preview) return
        if (preview.zoom !== undefined) useZoomStore.getState().setZoomLevelImmediate(preview.zoom)
        setScrollLeftOnContainer(preview.scrollLeft)
      }

      const handleMouseMove = (event: MouseEvent) => {
        const measuredTrackWidth = track?.clientWidth
        if (measuredTrackWidth !== undefined) {
          rebaseActiveDragToTrackWidth(measuredTrackWidth)
        }
        const snapshot = refs.dragSnapshot
        if (!snapshot || snapshot.trackWidth <= 0) return

        const deltaX = event.clientX - snapshot.startX
        const preview = getNavigatorDragPreview({
          dragTarget: activeDragTarget,
          snapshot,
          deltaX,
          viewportWidth: viewportWidth.current,
          contentDuration,
        })
        if (!preview) return

        refs.latestPreview = preview
        refs.pendingPreview = preview
        refs.dragSnapshot = { ...snapshot, lastX: event.clientX }
        updateNavigatorThumb(thumb, preview)
        if (dragRaf.current !== null) return
        dragRaf.current = requestAnimationFrame(flush)
      }

      const handleMouseUp = () => {
        const measuredTrackWidth = track?.clientWidth
        if (measuredTrackWidth !== undefined) {
          rebaseActiveDragToTrackWidth(measuredTrackWidth)
        }
        if (dragRaf.current !== null) {
          cancelAnimationFrame(dragRaf.current)
          dragRaf.current = null
        }
        flush()
        const snapshot = refs.dragSnapshot
        const finalPreview = refs.latestPreview
        if (finalPreview?.zoom !== undefined) {
          // The live resize uses deferred content geometry for responsiveness.
          // Settle that geometry before the final scroll write so a later width
          // commit cannot clamp the old scroll position and move the navigator
          // after the pointer has already been released.
          useZoomStore.getState().setZoomLevelSynchronized(finalPreview.zoom)
          setScrollLeftOnContainer(finalPreview.scrollLeft)
          refs.releaseScrollRaf = requestAnimationFrame(() => {
            refs.releaseScrollRaf = null
            setScrollLeftOnContainer(finalPreview.scrollLeft)
          })
        }
        refs.viewHandoff =
          snapshot && finalPreview
            ? {
                from: {
                  timelineWidth: snapshot.timelineWidth,
                  scrollLeft: snapshot.scrollLeft,
                },
                to: {
                  timelineWidth: finalPreview.timelineWidth,
                  scrollLeft: finalPreview.scrollLeft,
                },
                thumbLeft: finalPreview.thumbLeft,
                thumbWidth: finalPreview.thumbWidth,
              }
            : null
        refs.latestPreview = null
        refs.dragSnapshot = null
        dragTarget = null
      }

      const detachWindowDragListeners = attachWindowDragListeners(
        handleMouseMove,
        handleMouseUp,
        dragRaf,
      )

      return () => {
        detachWindowDragListeners()
        refs.pendingPreview = null
      }
    })
  })
</script>

<div class="h-5 border-t border-border bg-background/80 px-2 py-1">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    class="relative h-full rounded-sm bg-secondary/70"
    onclick={handleTrackClick}
  >
    <div
      bind:this={thumb}
      class={cn(
        'absolute top-0 flex h-full items-center justify-between rounded-sm bg-muted-foreground/55 transition-colors',
        dragTarget
          ? 'cursor-grabbing bg-muted-foreground/75'
          : 'cursor-grab hover:bg-muted-foreground/70',
      )}
      style:left="{thumbLeft}px"
      style:width="{thumbWidth}px"
      onmousedown={(event) => handleMouseDown(event, 'thumb')}
      onclick={(event) => event.stopPropagation()}
      data-testid="timeline-navigator-thumb"
    >
      <div
        data-testid="timeline-navigator-left-handle"
        class="flex h-full w-3 items-center justify-center cursor-ew-resize"
        onmousedown={(event) => handleMouseDown(event, 'left')}
      >
        <div class="h-1.5 w-1.5 rounded-full bg-background/90"></div>
      </div>
      <div class="h-2 w-8 rounded-full bg-background/20"></div>
      <div
        data-testid="timeline-navigator-right-handle"
        class="flex h-full w-3 items-center justify-center cursor-ew-resize"
        onmousedown={(event) => handleMouseDown(event, 'right')}
      >
        <div class="h-1.5 w-1.5 rounded-full bg-background/90"></div>
      </div>
    </div>
  </div>
</div>
