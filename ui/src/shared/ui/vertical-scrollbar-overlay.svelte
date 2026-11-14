<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  interface VerticalScrollbarOverlayProps {
    /** The scrolling element this rail drives. */
    scroll?: HTMLDivElement | null
    ariaLabel: string
    ariaControls?: string
    class?: string
    style?: string
    layoutDependency?: unknown
    testId?: string
  }

  const railInset = 4
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { withPerfMeasure } from '@/shared/logging/perf-marks'

  /** Shared imperative scrollbar used by timeline surfaces with hidden native rails. */
  let {
    scroll,
    ariaLabel,
    ariaControls,
    class: className,
    style,
    layoutDependency,
    testId,
  }: VerticalScrollbarOverlayProps = $props()

  let rail = $state<HTMLDivElement | null>(null)
  let thumb = $state<HTMLDivElement | null>(null)
  let dragOffset = 0
  let detachDragListeners: (() => void) | null = null
  let layout = { thumbHeight: 0, maxThumbTravel: 0, overflowHeight: 0 }

  const updateThumbLayout = () =>
    untrack(() => {
      const element = scroll
      if (!element || !rail || !thumb) return

      const clientHeight = element.clientHeight
      const scrollHeight = element.scrollHeight
      const overflowHeight = scrollHeight - clientHeight
      const railHeight = Math.max(0, rail.clientHeight - railInset * 2)
      const thumbHeight =
        overflowHeight > 0
          ? Math.min(railHeight, Math.max(24, (clientHeight / scrollHeight) * railHeight))
          : 0
      const maxThumbTravel = Math.max(0, railHeight - thumbHeight)
      const thumbTop =
        overflowHeight > 0 ? (element.scrollTop / overflowHeight) * maxThumbTravel : 0

      layout = { thumbHeight, maxThumbTravel, overflowHeight }
      thumb.style.height = `${thumbHeight}px`
      thumb.style.top = `${railInset + thumbTop}px`
      thumb.style.display = thumbHeight > 0 ? '' : 'none'
    })

  const updateThumbPosition = () =>
    untrack(() => {
      const element = scroll
      if (!element || !thumb) return

      const { maxThumbTravel, overflowHeight } = layout
      if (overflowHeight <= 0 || maxThumbTravel <= 0) return
      thumb.style.top = `${railInset + (element.scrollTop / overflowHeight) * maxThumbTravel}px`
    })

  $effect(() => {
    const element = scroll
    void [rail, thumb]
    if (!element) return

    let scrollFrameId = 0
    const scheduleThumbUpdate = () => {
      if (scrollFrameId !== 0) return
      scrollFrameId = window.requestAnimationFrame(() => {
        scrollFrameId = 0
        withPerfMeasure('tl.raf.scrollThumb', updateThumbPosition)
      })
    }
    const resizeObserver = new ResizeObserver(updateThumbLayout)
    resizeObserver.observe(element)
    const contentElement = element.firstElementChild
    if (contentElement instanceof HTMLElement) resizeObserver.observe(contentElement)
    element.addEventListener('scroll', scheduleThumbUpdate, { passive: true })
    updateThumbLayout()

    return () => {
      if (scrollFrameId !== 0) cancelAnimationFrame(scrollFrameId)
      element.removeEventListener('scroll', scheduleThumbUpdate)
      resizeObserver.disconnect()
    }
  })

  $effect(() => {
    void layoutDependency
    updateThumbLayout()
  })

  const syncScrollFromClientY = (clientY: number) => {
    const element = scroll
    const { maxThumbTravel, overflowHeight } = layout
    if (!rail || !element || maxThumbTravel <= 0 || overflowHeight <= 0) return
    const railRect = rail.getBoundingClientRect()
    const nextThumbTop = Math.max(
      0,
      Math.min(maxThumbTravel, clientY - railRect.top - dragOffset),
    )
    element.scrollTop = (nextThumbTop / maxThumbTravel) * overflowHeight
  }

  const stopDragging = () => {
    detachDragListeners?.()
    detachDragListeners = null
    document.body.style.userSelect = ''
  }

  $effect(() => stopDragging)

  const handlePointerDown = (event: PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const thumbRect = thumb?.getBoundingClientRect()
    const startedOnThumb =
      !!thumbRect && event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom
    dragOffset =
      startedOnThumb && thumbRect ? event.clientY - thumbRect.top : layout.thumbHeight / 2
    syncScrollFromClientY(event.clientY)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      syncScrollFromClientY(moveEvent.clientY)
    }
    const handlePointerUp = () => stopDragging()
    document.body.style.userSelect = 'none'
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

<!-- svelte-ignore a11y_role_has_required_aria_props -->
<div
  data-testid={testId}
  class={className}
  {style}
  role="scrollbar"
  aria-label={ariaLabel}
  aria-controls={ariaControls}
  aria-orientation="vertical"
  aria-valuemin={0}
  aria-valuemax={100}
  tabindex={-1}
  onpointerdown={handlePointerDown}
>
  <div bind:this={rail} class="absolute inset-y-1 inset-x-0.5 rounded-sm bg-secondary/70">
    <div
      bind:this={thumb}
      class="absolute inset-x-0 cursor-grab rounded-sm bg-muted-foreground/55 transition-colors hover:bg-muted-foreground/70 active:cursor-grabbing active:bg-muted-foreground/75"
    ></div>
  </div>
</div>
