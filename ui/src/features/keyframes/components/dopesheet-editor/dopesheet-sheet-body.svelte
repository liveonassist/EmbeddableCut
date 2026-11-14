<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { KeyframeMarqueeOverlay } from '../keyframe-marquee'
  import VerticalScrollbarOverlay from '@/shared/ui/vertical-scrollbar-overlay.svelte'
  import { PROPERTY_COLUMN_WIDTH, RULER_HEIGHT } from './dopesheet-constants'
  import DopesheetEmptyState from './dopesheet-empty-state.svelte'
  import type { Ref } from '../ref-state.svelte'

  interface DopesheetSheetBodyProps {
    scrollAreaRef: Ref<HTMLDivElement | null>
    hasRows: boolean
    emptyStateMessage: string
    showEmptyGuidance: boolean
    proceduralHint?: string
    rowElements: Snippet
    marqueeOverlayRef: Ref<HTMLDivElement | null>
    propertyColumnWidth?: number
    subtractRulerHeight?: boolean
    onTimelineBackgroundPointerDown: (
      event: PointerEvent & { currentTarget: HTMLDivElement },
    ) => void
  }

  interface MiddleRowPanState {
    startClientY: number
    startScrollTop: number
  }

  let {
    scrollAreaRef,
    hasRows,
    emptyStateMessage,
    showEmptyGuidance,
    proceduralHint,
    rowElements,
    marqueeOverlayRef,
    propertyColumnWidth = PROPERTY_COLUMN_WIDTH,
    subtractRulerHeight = true,
    onTimelineBackgroundPointerDown,
  }: DopesheetSheetBodyProps = $props()

  let middlePan: MiddleRowPanState | null = null

  $effect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    const finishMiddlePan = () => {
      if (!middlePan) return
      middlePan = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    const beginMiddlePan = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (middlePan) return

      middlePan = {
        startClientY: event.clientY,
        startScrollTop: scrollArea.scrollTop,
      }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }

    const moveMiddlePan = (event: MouseEvent | PointerEvent) => {
      const pan = middlePan
      if (!pan) return
      event.preventDefault()
      event.stopPropagation()
      scrollArea.scrollTop = pan.startScrollTop - (event.clientY - pan.startClientY)
    }

    const preventMiddleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
    }

    scrollArea.addEventListener('pointerdown', beginMiddlePan, { capture: true })
    scrollArea.addEventListener('mousedown', beginMiddlePan, { capture: true })
    scrollArea.addEventListener('auxclick', preventMiddleAuxClick, { capture: true })
    window.addEventListener('pointermove', moveMiddlePan, { capture: true })
    window.addEventListener('mousemove', moveMiddlePan, { capture: true })
    window.addEventListener('pointerup', finishMiddlePan, { capture: true })
    window.addEventListener('pointercancel', finishMiddlePan, { capture: true })
    window.addEventListener('mouseup', finishMiddlePan, { capture: true })
    return () => {
      finishMiddlePan()
      scrollArea.removeEventListener('pointerdown', beginMiddlePan, { capture: true })
      scrollArea.removeEventListener('mousedown', beginMiddlePan, { capture: true })
      scrollArea.removeEventListener('auxclick', preventMiddleAuxClick, { capture: true })
      window.removeEventListener('pointermove', moveMiddlePan, { capture: true })
      window.removeEventListener('mousemove', moveMiddlePan, { capture: true })
      window.removeEventListener('pointerup', finishMiddlePan, { capture: true })
      window.removeEventListener('pointercancel', finishMiddlePan, { capture: true })
      window.removeEventListener('mouseup', finishMiddlePan, { capture: true })
    }
  })
</script>

<div
  data-testid="dopesheet-scroll-shell"
  class="relative"
  style:height={subtractRulerHeight ? `calc(100% - ${RULER_HEIGHT}px)` : '100%'}
>
  <div
    bind:this={scrollAreaRef.current}
    data-testid="dopesheet-scroll-area"
    data-dopesheet-scroll-viewport
    class={subtractRulerHeight ? 'absolute inset-y-0 left-0 overflow-auto' : 'overflow-hidden'}
    style:right="{subtractRulerHeight ? 12 : 0}px"
    style:height={subtractRulerHeight ? undefined : '100%'}
    style:scrollbar-width={subtractRulerHeight ? 'none' : undefined}
  >
    {#if !hasRows}
      <DopesheetEmptyState
        showGuidance={showEmptyGuidance}
        fallbackMessage={emptyStateMessage}
        {proceduralHint}
      />
    {:else}
      <div class="relative min-h-full">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          data-testid="dopesheet-selection-surface"
          class="absolute inset-y-0 right-0 z-0"
          style:left="{propertyColumnWidth}px"
          onpointerdown={onTimelineBackgroundPointerDown}
        ></div>
        <div class="relative z-10">{@render rowElements()}</div>
        <div
          class="pointer-events-none absolute inset-y-0 right-0 z-20"
          style:left="{propertyColumnWidth}px"
        >
          <KeyframeMarqueeOverlay bind:ref={marqueeOverlayRef.current} rect={null} persistent />
        </div>
      </div>
    {/if}
  </div>
  {#if subtractRulerHeight}
    <VerticalScrollbarOverlay
      scroll={scrollAreaRef.current}
      ariaLabel="Keyframe timeline scrollbar"
      class="absolute inset-y-0 right-0 w-3 bg-background/80"
      testId="dopesheet-scrollbar"
    />
  {/if}
</div>
