<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { withPerfMeasure } from '@/shared/logging/perf-marks'
  import { setGlobalCursorStyle } from '../../utils/global-cursor-roots'
  import type { TrackScrollbarSection } from './types'

  interface TrackSectionScrollbarOverlayProps {
    section: TrackScrollbarSection
    height: number
    scroll?: HTMLDivElement | null
  }

  /**
   * Scrollbar that tracks scroll position imperatively via DOM manipulation.
   * No reactive state for scrollTop — thumb updates bypass the update cycle.
   */
  let { section, height, scroll }: TrackSectionScrollbarOverlayProps = $props()

  let railEl = $state<HTMLDivElement | null>(null)
  let thumbEl = $state<HTMLDivElement | null>(null)
  let dragOffset = 0
  let detachDragListeners: (() => void) | null = null
  // Cache layout-derived values so drag/scroll handlers use current values
  // without needing updates
  let layout = { railHeight: 0, thumbHeight: 0, maxThumbTravel: 0, overflowHeight: 0 }
  const railInset = 4

  // Compute layout metrics and update thumb size/position imperatively
  function updateThumbLayout() {
    const element = scroll
    const thumb = thumbEl
    if (!element || !thumb) return

    const clientHeight = element.clientHeight
    const scrollHeight = element.scrollHeight
    const overflowHeight = scrollHeight - clientHeight
    const railHeight = Math.max(0, (railEl?.clientHeight ?? height) - railInset * 2)
    const thumbHeight =
      overflowHeight > 0
        ? Math.min(railHeight, Math.max(24, (clientHeight / scrollHeight) * railHeight))
        : 0
    const maxThumbTravel = Math.max(0, railHeight - thumbHeight)
    const scrollTop = element.scrollTop
    const thumbTop = overflowHeight > 0 ? (scrollTop / overflowHeight) * maxThumbTravel : 0

    layout = { railHeight, thumbHeight, maxThumbTravel, overflowHeight }

    thumb.style.height = `${thumbHeight}px`
    thumb.style.top = `${railInset + thumbTop}px`
    thumb.style.display = thumbHeight > 0 ? '' : 'none'
  }

  // Update thumb position only (cheaper — called on scroll)
  function updateThumbPosition() {
    const element = scroll
    const thumb = thumbEl
    if (!element || !thumb) return

    const { maxThumbTravel, overflowHeight } = layout
    if (overflowHeight <= 0 || maxThumbTravel <= 0) return

    const thumbTop = (element.scrollTop / overflowHeight) * maxThumbTravel
    thumb.style.top = `${railInset + thumbTop}px`
  }

  // Listen for scroll + resize, update thumb imperatively (no state)
  $effect(() => {
    const element = scroll
    void thumbEl
    if (!element) return

    return untrack(() => {
      let scrollFrameId = 0
      const scheduleThumbUpdate = () => {
        if (scrollFrameId !== 0) return
        scrollFrameId = window.requestAnimationFrame(() => {
          scrollFrameId = 0
          withPerfMeasure('tl.raf.scrollThumb', updateThumbPosition)
        })
      }

      // Full layout recalc on resize
      const resizeObserver = new ResizeObserver(() => {
        updateThumbLayout()
      })
      resizeObserver.observe(element)
      const contentElement = element.firstElementChild
      if (contentElement instanceof HTMLElement) {
        resizeObserver.observe(contentElement)
      }

      element.addEventListener('scroll', scheduleThumbUpdate, { passive: true })

      // Initial layout
      updateThumbLayout()

      return () => {
        if (scrollFrameId !== 0) cancelAnimationFrame(scrollFrameId)
        element.removeEventListener('scroll', scheduleThumbUpdate)
        resizeObserver.disconnect()
      }
    })
  })

  // Also recalc on height prop change
  $effect(() => {
    void height
    untrack(updateThumbLayout)
  })

  function syncScrollFromClientY(clientY: number) {
    const rail = railEl
    const scrollElement = scroll
    const { maxThumbTravel, overflowHeight } = layout
    if (!rail || !scrollElement || maxThumbTravel <= 0 || overflowHeight <= 0) return

    const railRect = rail.getBoundingClientRect()
    const nextThumbTop = Math.max(
      0,
      Math.min(maxThumbTravel, clientY - railRect.top - dragOffset),
    )

    scrollElement.scrollTop = (nextThumbTop / maxThumbTravel) * overflowHeight
  }

  function stopDragging() {
    if (detachDragListeners) {
      detachDragListeners()
      detachDragListeners = null
    }
    setGlobalCursorStyle('userSelect', '')
  }

  $effect(() => stopDragging)

  function handlePointerDown(event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()

    const thumbRect = thumbEl?.getBoundingClientRect()
    const pointerStartedOnThumb =
      !!thumbRect && event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom

    dragOffset =
      pointerStartedOnThumb && thumbRect ? event.clientY - thumbRect.top : layout.thumbHeight / 2

    syncScrollFromClientY(event.clientY)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      syncScrollFromClientY(moveEvent.clientY)
    }

    const handlePointerUp = () => {
      stopDragging()
    }

    setGlobalCursorStyle('userSelect', 'none')
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('pointercancel', handlePointerUp, { passive: true })

    detachDragListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }
</script>

{#if height > 0}
  <!-- FreeCut's scrollbar is pointer-driven and carries no aria-valuenow. -->
  <!-- svelte-ignore a11y_role_has_required_aria_props -->
  <div
    class="relative shrink-0"
    style:height={section === 'single'
      ? `${height}px`
      : `var(--timeline-${section}-pane-height, ${height}px)`}
    role="scrollbar"
    aria-label="{section} track section scrollbar"
    aria-controls="timeline-track-sections"
    aria-orientation="vertical"
    aria-valuemin={0}
    aria-valuemax={100}
    tabindex={-1}
    onpointerdown={handlePointerDown}
  >
    <div bind:this={railEl} class="absolute inset-y-1 inset-x-0.5 rounded-sm bg-secondary/70">
      <div
        bind:this={thumbEl}
        class="absolute inset-x-0 rounded-sm bg-muted-foreground/55 hover:bg-muted-foreground/70 transition-colors cursor-grab active:cursor-grabbing active:bg-muted-foreground/75"
      ></div>
    </div>
  </div>
{/if}
