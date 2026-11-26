<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import {
    TRANSITION_DRAG_MIME,
    useTransitionDragStore,
    type DraggedTransitionDescriptor,
  } from '@/shared/state/transition-drag'
  import {
    getTransitionBridgeBounds,
    type PreviewGeometry,
  } from '@/features/timeline/utils/transition-preview-geometry'

  /**
   * Transition Item Component
   *
   * Renders a cut-centered transition bridge overlay between adjacent clips.
   * The clips keep their full visual width under the bridge, similar to DaVinci.
   */
  const BRIDGE_SELECT_SIDE_INSET = 6
  const CUT_PASS_THROUGH_ZONE = 24

  interface TransitionPositionInputs {
    leftClip: PreviewGeometry
    rightClip: PreviewGeometry
    previewDuration: number
    alignment: number | undefined
    fps: number
  }

  interface TransitionPixelPosition {
    left: number
    width: number
    cutOffset: number
  }

  function frameToPixelsAtScale(frame: number, fps: number, pixelsPerSecond: number): number {
    return fps > 0 ? (frame / fps) * pixelsPerSecond : 0
  }

  function getTransitionPixelPosition(
    inputs: TransitionPositionInputs,
    pixelsPerSecond: number,
  ): TransitionPixelPosition {
    const { leftClip, rightClip, previewDuration, alignment, fps } = inputs
    const bridge = getTransitionBridgeBounds(
      leftClip.from,
      leftClip.durationInFrames,
      rightClip.from,
      previewDuration,
      alignment,
    )
    const bridgeRight = frameToPixelsAtScale(bridge.rightFrame, fps, pixelsPerSecond)
    const bridgeLeft = frameToPixelsAtScale(bridge.leftFrame, fps, pixelsPerSecond)
    const naturalWidth = bridgeRight - bridgeLeft
    const leftEnd = leftClip.from + leftClip.durationInFrames
    const leftClipStart = Math.round(frameToPixelsAtScale(leftClip.from, fps, pixelsPerSecond))
    const rightClipEnd = Math.round(
      frameToPixelsAtScale(rightClip.from + rightClip.durationInFrames, fps, pixelsPerSecond),
    )
    const cutFrame = Math.abs(leftEnd - rightClip.from) <= 1 ? rightClip.from : leftEnd
    const cutPx = Math.round(frameToPixelsAtScale(cutFrame, fps, pixelsPerSecond))

    const minWidth = 10
    const maxVisualWidth = Math.max(naturalWidth, rightClipEnd - leftClipStart)
    const effectiveWidth = Math.min(Math.max(naturalWidth, minWidth), maxVisualWidth)
    const centeredLeft =
      naturalWidth >= effectiveWidth
        ? bridgeLeft
        : Math.round((bridgeLeft + bridgeRight) / 2 - effectiveWidth / 2)
    const left = Math.min(Math.max(centeredLeft, leftClipStart), rightClipEnd - effectiveWidth)

    return {
      left,
      width: effectiveWidth,
      cutOffset: cutPx - left,
    }
  }

  function getTransitionSelectGeometry(position: TransitionPixelPosition) {
    const leftSelectWidth = Math.max(
      0,
      position.cutOffset - CUT_PASS_THROUGH_ZONE / 2 - BRIDGE_SELECT_SIDE_INSET,
    )
    const rightSelectLeft = Math.min(
      position.width - BRIDGE_SELECT_SIDE_INSET,
      position.cutOffset + CUT_PASS_THROUGH_ZONE / 2,
    )
    const rightSelectWidth = Math.max(
      0,
      position.width - BRIDGE_SELECT_SIDE_INSET - rightSelectLeft,
    )
    return { leftSelectWidth, rightSelectLeft, rightSelectWidth }
  }

  function applyTransitionPixelPosition(
    container: HTMLDivElement,
    position: TransitionPixelPosition,
  ) {
    const selectGeometry = getTransitionSelectGeometry(position)
    container.style.left = `${position.left}px`
    container.style.width = `${position.width}px`
    container.style.setProperty(
      '--transition-left-select-width',
      `${selectGeometry.leftSelectWidth}px`,
    )
    container.style.setProperty(
      '--transition-right-select-left',
      `${selectGeometry.rightSelectLeft}px`,
    )
    container.style.setProperty(
      '--transition-right-select-width',
      `${selectGeometry.rightSelectWidth}px`,
    )
  }

  function readDraggedTransitionDescriptor(event: DragEvent): DraggedTransitionDescriptor | null {
    const cached = useTransitionDragStore.getState().draggedTransition
    if (cached) return cached

    const raw = event.dataTransfer?.getData(TRANSITION_DRAG_MIME)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as Partial<DraggedTransitionDescriptor>
      if (typeof parsed.presentation !== 'string') return null
      return {
        presentation: parsed.presentation,
        direction: parsed.direction,
      }
    } catch {
      return null
    }
  }
</script>

<script lang="ts">
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import type { Transition } from '@/types/transition'
  import { select, shallow } from '$lib/store.svelte'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { removeTransition, updateTransition } from '@/features/timeline/stores/timeline-actions'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useRollingEditPreviewStore } from '@/features/timeline/stores/rolling-edit-preview-store'
  import { useRippleEditPreviewStore } from '@/features/timeline/stores/ripple-edit-preview-store'
  import { useSlideEditPreviewStore } from '@/features/timeline/stores/slide-edit-preview-store'
  import { useTransitionBreakPreviewStore } from '@/features/timeline/stores/transition-break-preview-store'
  import { useTrackPushPreviewStore } from '@/features/timeline/stores/track-push-preview-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import type { SelectionState, SelectionActions } from '@/shared/state/selection'
  import { useTimelineCommittedZoomContext } from '../contexts/timeline-zoom-context.svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { useTransitionResize } from '../hooks/use-transition-resize.svelte'
  import { dragOffsetRef } from '../hooks/use-timeline-drag.svelte'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import { cn } from '@/shared/ui/cn'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { applyPreviewGeometryToClip } from '@/features/timeline/utils/transition-preview-geometry'
  import { useLinkedEditPreviewStore } from '@/features/timeline/stores/linked-edit-preview-store'

  interface TransitionItemProps {
    transition: Transition
    trackHidden?: boolean
  }

  let { transition, trackHidden = false }: TransitionItemProps = $props()

  // Transition controls stay on settled geometry. The bridge shell samples live
  // zoom imperatively below, so it stays pinned to clip edges without
  // re-rendering the surrounding context-menu tree every wheel frame.
  const zoom = useTimelineCommittedZoomContext()
  const fps = select(useTimelineSettingsStore, (s) => s.fps)

  // Get the clips involved in this transition
  const leftClip = $derived(select(useItemsStore, (s) => s.itemById[transition.leftClipId]))
  const rightClip = $derived(select(useItemsStore, (s) => s.itemById[transition.rightClipId]))

  // Check if transition is selected
  const isSelected = $derived(
    select(useSelectionStore, (s: SelectionState) => s.selectedTransitionId === transition.id),
  )
  const selectTransition = select(useSelectionStore, (s: SelectionActions) => s.selectTransition)

  // Resize functionality
  const resize = useTransitionResize(() => transition)

  // Rolling preview (only when this transition's clips are involved)
  const rollingPreview = $derived(
    select(
      useRollingEditPreviewStore,
      (s) => {
        const touches =
          s.trimmedItemId === transition.leftClipId ||
          s.trimmedItemId === transition.rightClipId ||
          s.neighborItemId === transition.leftClipId ||
          s.neighborItemId === transition.rightClipId

        if (!touches) {
          return {
            trimmedItemId: null as string | null,
            neighborItemId: null as string | null,
            handle: null as 'start' | 'end' | null,
            delta: 0,
          }
        }

        return {
          trimmedItemId: s.trimmedItemId,
          neighborItemId: s.neighborItemId,
          handle: s.handle,
          delta: s.neighborDelta,
        }
      },
      shallow,
    ),
  )

  // Slide preview (only when this transition's clips are involved)
  const slidePreview = $derived(
    select(
      useSlideEditPreviewStore,
      (s) => {
        const touches =
          s.itemId === transition.leftClipId ||
          s.itemId === transition.rightClipId ||
          s.leftNeighborId === transition.leftClipId ||
          s.leftNeighborId === transition.rightClipId ||
          s.rightNeighborId === transition.leftClipId ||
          s.rightNeighborId === transition.rightClipId

        if (!touches) {
          return {
            itemId: null as string | null,
            leftNeighborId: null as string | null,
            rightNeighborId: null as string | null,
            delta: 0,
          }
        }

        return {
          itemId: s.itemId,
          leftNeighborId: s.leftNeighborId,
          rightNeighborId: s.rightNeighborId,
          delta: s.slideDelta,
        }
      },
      shallow,
    ),
  )

  // Ripple preview (trimmed item + downstream shifts)
  const ripplePreview = $derived(
    select(
      useRippleEditPreviewStore,
      (s) => {
        const leftDownstream = s.downstreamItemIds.has(transition.leftClipId)
        const rightDownstream = s.downstreamItemIds.has(transition.rightClipId)
        const touches =
          s.trimmedItemId === transition.leftClipId ||
          s.trimmedItemId === transition.rightClipId ||
          leftDownstream ||
          rightDownstream

        if (!touches) {
          return {
            trimmedItemId: null as string | null,
            delta: 0,
            leftDownstream: false,
            rightDownstream: false,
          }
        }

        return {
          trimmedItemId: s.trimmedItemId,
          delta: s.delta,
          leftDownstream,
          rightDownstream,
        }
      },
      shallow,
    ),
  )

  const isHiddenForBreakPreview = $derived(
    select(
      useTransitionBreakPreviewStore,
      (s) =>
        (s.itemId === transition.leftClipId && s.handle === 'end') ||
        (s.itemId === transition.rightClipId && s.handle === 'start'),
    ),
  )

  // Linked edit preview (rate stretch ripple and other generic previews)
  // Extract only the geometry fields the bridge needs, compared shallowly so the
  // bridge doesn't update when the store rebuilds objects with identical values.
  const leftLinkedEditPreview = $derived(
    select(
      useLinkedEditPreviewStore,
      (s) => {
        const update = s.updatesById[transition.leftClipId]
        if (!update) return null
        return {
          from: update.from,
          durationInFrames: update.durationInFrames,
          hidden: update.hidden,
        }
      },
      shallow,
    ),
  )
  const rightLinkedEditPreview = $derived(
    select(
      useLinkedEditPreviewStore,
      (s) => {
        const update = s.updatesById[transition.rightClipId]
        if (!update) return null
        return {
          from: update.from,
          durationInFrames: update.durationInFrames,
          hidden: update.hidden,
        }
      },
      shallow,
    ),
  )

  // Track push preview: only subscribe to delta when this clip is shifted.
  // Return undefined for non-shifted clips so they skip updates entirely.
  const trackPushLeft = $derived(
    select(
      useTrackPushPreviewStore,
      (s) =>
        s.shiftedItemIds.has(transition.leftClipId)
          ? { delta: s.delta, isShifted: true as const }
          : undefined,
      shallow,
    ),
  )
  const trackPushRight = $derived(
    select(
      useTrackPushPreviewStore,
      (s) =>
        s.shiftedItemIds.has(transition.rightClipId)
          ? { delta: s.delta, isShifted: true as const }
          : undefined,
      shallow,
    ),
  )

  // Track hovered edge for showing resize handles
  let hoveredEdge = $state<'left' | 'right' | null>(null)
  let isBridgeHovered = $state(false)

  // Element for applying the live drag offset to the bridge so it follows whichever
  // of its clips is being dragged — instead of staying frozen at the old cut until
  // release. `draggedSide` is the dragged clip we anchor to ('left'/'right'/null).
  let container = $state<HTMLDivElement | null>(null)
  let rafId: number | null = null
  const draggedSide = $derived(
    select(useSelectionStore, (state: SelectionState): 'left' | 'right' | null => {
      if (!state.dragState?.isDragging) {
        return null
      }

      const draggedItemIdSet =
        state.dragState.draggedItemIdSet ?? new Set(state.dragState.draggedItemIds)
      if (draggedItemIdSet.has(transition.leftClipId)) return 'left'
      if (draggedItemIdSet.has(transition.rightClipId)) return 'right'
      return null
    }),
  )

  // Horizontal pixels the bridge's computed position has ALREADY shifted because
  // the linked-move preview moved the dragged clip's geometry (only happens for
  // clips that have a linked companion). The RAF subtracts this so we don't double
  // the horizontal motion — for a linked clip it cancels offset.x to ~0 (position
  // handles X) leaving only the vertical follow; for an unlinked clip it's 0 so the
  // full offset applies. Either way the bridge stays pinned to the dragged clip,
  // including when it moves to another lane (the vertical axis the position never
  // tracks). Read live in the RAF.
  const positionShiftX = $derived.by(() => {
    const side = draggedSide.current
    const left = leftClip.current
    const right = rightClip.current
    const leftPreview = leftLinkedEditPreview.current
    const rightPreview = rightLinkedEditPreview.current
    return side === 'left' && left && leftPreview?.from != null
      ? frameToPixelsAtScale(leftPreview.from - left.from, fps.current, zoom.pixelsPerSecond)
      : side === 'right' && right && rightPreview?.from != null
        ? frameToPixelsAtScale(rightPreview.from - right.from, fps.current, zoom.pixelsPerSecond)
        : 0
  })

  /*
   * This effect subscribes to a small enum derived from selection state instead
   * of the full drag payload. Per-frame movement still comes directly from
   * dragOffsetRef in RAF so the bridge follows the dragged clip without waking
   * every transition instance on each selection-store drag UI churn.
   */
  $effect(() => {
    const el = container
    const side = draggedSide.current
    const updateDragOffset = () => {
      if (!el) return
      const offset = dragOffsetRef.current
      const x = offset.x - positionShiftX
      el.style.transform = `translate(${x}px, ${offset.y}px)`
      rafId = requestAnimationFrame(updateDragOffset)
    }

    if (!side) {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (el) {
        el.style.transform = ''
      }
      return
    }

    rafId = requestAnimationFrame(updateDragOffset)

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (el) {
        el.style.transform = ''
      }
    }
  })

  // Calculate position and size for the transition indicator.
  // The bridge covers the actual overlap region: from (leftEnd - duration) to leftEnd.
  // The right edge is anchored at leftEnd (the left clip's end); the left edge moves
  // as the duration changes. The left handle tracks the cursor 1:1.
  const effectiveLeftClip = $derived.by(() => {
    const clip = leftClip.current
    const linkedEdit = leftLinkedEditPreview.current
    if (!clip) return null
    if (linkedEdit?.hidden) return null
    const ripple = ripplePreview.current
    return applyPreviewGeometryToClip(clip.id, clip.from, clip.durationInFrames, {
      rolling: rollingPreview.current,
      slide: slidePreview.current,
      ripple: {
        trimmedItemId: ripple.trimmedItemId,
        delta: ripple.delta,
        isDownstream: ripple.leftDownstream,
      },
      linkedEdit,
      trackPush: trackPushLeft.current,
    })
  })

  const effectiveRightClip = $derived.by(() => {
    const clip = rightClip.current
    const linkedEdit = rightLinkedEditPreview.current
    if (!clip) return null
    if (linkedEdit?.hidden) return null
    const ripple = ripplePreview.current
    return applyPreviewGeometryToClip(clip.id, clip.from, clip.durationInFrames, {
      rolling: rollingPreview.current,
      slide: slidePreview.current,
      ripple: {
        trimmedItemId: ripple.trimmedItemId,
        delta: ripple.delta,
        isDownstream: ripple.rightDownstream,
      },
      linkedEdit,
      trackPush: trackPushRight.current,
    })
  })

  const positionInputs = $derived.by<TransitionPositionInputs | null>(() => {
    if (!effectiveLeftClip || !effectiveRightClip) return null
    return {
      leftClip: effectiveLeftClip,
      rightClip: effectiveRightClip,
      previewDuration: resize.previewDuration,
      alignment: transition.alignment,
      fps: fps.current,
    }
  })
  const position = $derived(
    positionInputs ? getTransitionPixelPosition(positionInputs, zoom.pixelsPerSecond) : null,
  )
  let committedPositionInputs: TransitionPositionInputs | null = null

  // Runs after the template applied the settled geometry: re-sample it at the live
  // zoom so the bridge stays pinned to its clips mid-gesture.
  $effect(() => {
    const inputs = positionInputs
    committedPositionInputs = inputs
    const el = container
    if (!el || !inputs) return
    applyTransitionPixelPosition(
      el,
      getTransitionPixelPosition(inputs, useZoomStore.getState().pixelsPerSecond),
    )
  })

  $effect(() => {
    return useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond === previousState.pixelsPerSecond) return
      const el = container
      const inputs = committedPositionInputs
      if (!el || !inputs) return
      applyTransitionPixelPosition(el, getTransitionPixelPosition(inputs, state.pixelsPerSecond))
    })
  })

  // Duration in seconds for display (use previewDuration for visual feedback)
  const durationSec = $derived((resize.previewDuration / fps.current).toFixed(1))
  const draggedTransition = select(useTransitionDragStore, (s) => s.draggedTransition)
  const dragPreviewMatches = $derived(
    select(useTransitionDragStore, (s) => s.preview?.existingTransitionId === transition.id),
  )

  // Handle click to select (only if not resizing)
  function handleClick(e: MouseEvent) {
    e.stopPropagation()
    // Don't select if we just finished resizing
    if (!resize.isResizing) {
      selectTransition.current(transition.id)
    }
  }

  // Stop all events on resize handles from bubbling
  function stopEvent(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Handle mousedown on main container - stop propagation when on resize edge
  function handleMouseDown(e: MouseEvent) {
    // Always stop propagation to prevent timeline drag
    e.stopPropagation()
  }

  function handleResizeMouseDown(e: MouseEvent, handle: 'left' | 'right') {
    selectTransition.current(transition.id)
    resize.handleResizeStart(e, handle)
  }

  // Handle delete
  function handleDelete() {
    removeTransition(transition.id)
  }

  function handleDragOver(e: DragEvent) {
    const dragDescriptor = readDraggedTransitionDescriptor(e)
    if (!dragDescriptor || !draggedTransition.current) return

    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    const dragState = useTransitionDragStore.getState()
    dragState.setInvalidHint(null)
    dragState.setPreview({
      leftClipId: transition.leftClipId,
      rightClipId: transition.rightClipId,
      durationInFrames: transition.durationInFrames,
      alignment: transition.alignment ?? 0.5,
      existingTransitionId: transition.id,
    })
  }

  function handleDragLeave() {
    const dragState = useTransitionDragStore.getState()
    if (dragState.preview?.existingTransitionId === transition.id) {
      dragState.clearPreview()
    }
    dragState.setInvalidHint(null)
  }

  function handleDrop(e: DragEvent) {
    const dragDescriptor = readDraggedTransitionDescriptor(e)
    if (!dragDescriptor) return

    e.preventDefault()
    e.stopPropagation()
    updateTransition(transition.id, {
      presentation: dragDescriptor.presentation,
      direction: dragDescriptor.direction,
    })
    useTransitionDragStore.getState().clearDrag()
  }

  const presentationLabel = $derived(
    transition.presentation?.charAt(0).toUpperCase() + transition.presentation?.slice(1) ||
      'Fade',
  )

  // Determine cursor based on hover state
  const cursor = $derived(hoveredEdge ? 'ew-resize' : 'pointer')
  const showOrangeBridge = $derived(
    isSelected.current || isBridgeHovered || hoveredEdge !== null,
  )
  // Persisted alignment can drift outside [0,1] — sanitize before deciding
  // which resize handles to expose so a bad value never hides both handles
  // or shows a handle that has no slack to drag.
  const alignment = $derived.by(() => {
    const rawAlignment = transition.alignment
    return typeof rawAlignment === 'number' && Number.isFinite(rawAlignment)
      ? Math.max(0, Math.min(1, rawAlignment))
      : 0.5
  })
  const showLeftResizeHandle = $derived(alignment > 0)
  const showRightResizeHandle = $derived(alignment < 1)
  const selectGeometry = $derived(position ? getTransitionSelectGeometry(position) : null)
  const isRendered = $derived(
    !!effectiveLeftClip && !!effectiveRightClip && !isHiddenForBreakPreview.current,
  )
</script>

{#if isRendered && position && selectGeometry}
  <ContextMenu>
    <ContextMenuTrigger>
      {#snippet child({ props })}
        <div
          {...props}
          bind:this={container}
          data-transition-id={transition.id}
          class={cn(
            'absolute inset-y-0 overflow-visible rounded-sm pointer-events-none',
            isSelected.current && 'ring-2 ring-inset ring-primary',
            dragPreviewMatches.current && 'ring-2 ring-inset ring-amber-300',
            resize.isResizing && 'ring-2 ring-inset ring-purple-400',
          )}
          style:left="{position.left}px"
          style:width="{position.width}px"
          style:--transition-left-select-width="{selectGeometry.leftSelectWidth}px"
          style:--transition-right-select-left="{selectGeometry.rightSelectLeft}px"
          style:--transition-right-select-width="{selectGeometry.rightSelectWidth}px"
          style:top="calc({EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight} + 1px)"
          style:bottom="1px"
          style:z-index={resize.isResizing ? 50 : 10}
          style:opacity={trackHidden ? 0.3 : undefined}
          style:cursor={resize.isResizing ? 'ew-resize' : undefined}
          title="{presentationLabel} ({durationSec}s)"
        >
          <div
            class={cn(
              'pointer-events-none relative h-full w-full rounded-sm border transition-colors',
              showOrangeBridge
                ? 'border-primary/90 bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]'
                : 'border-slate-100/80 shadow-[0_0_0_1px_rgba(248,250,252,0.1)]',
            )}
          >
            <div class="absolute inset-x-0 top-0 h-px bg-slate-50/70"></div>
            <div class="absolute inset-x-0 bottom-0 h-px bg-slate-900/15"></div>
          </div>

          {#if selectGeometry.leftSelectWidth > 0}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
              class="absolute inset-y-0 pointer-events-auto"
              style:left="{BRIDGE_SELECT_SIDE_INSET}px"
              style:width="var(--transition-left-select-width)"
              style:cursor={resize.isResizing ? 'ew-resize' : cursor}
              onmouseenter={() => (isBridgeHovered = true)}
              onmouseleave={() => (isBridgeHovered = false)}
              onmousedown={handleMouseDown}
              onclick={handleClick}
              ondragover={handleDragOver}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
            ></div>
          {/if}

          {#if selectGeometry.rightSelectWidth > 0}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
              class="absolute inset-y-0 pointer-events-auto"
              style:left="var(--transition-right-select-left)"
              style:width="var(--transition-right-select-width)"
              style:cursor={resize.isResizing ? 'ew-resize' : cursor}
              onmouseenter={() => (isBridgeHovered = true)}
              onmouseleave={() => (isBridgeHovered = false)}
              onmousedown={handleMouseDown}
              onclick={handleClick}
              ondragover={handleDragOver}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
            ></div>
          {/if}

          {#if draggedTransition.current}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute inset-0 pointer-events-auto"
              data-transition-hit-zone="bridge-drop"
              style:cursor="copy"
              onmouseenter={() => (isBridgeHovered = true)}
              onmouseleave={() => (isBridgeHovered = false)}
              ondragover={handleDragOver}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
            ></div>
          {/if}

          {#if showLeftResizeHandle}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
              class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l pointer-events-auto"
              data-transition-hit-zone="left-edge"
              onmouseenter={() => {
                hoveredEdge = 'left'
                isBridgeHovered = true
              }}
              onmouseleave={() => {
                if (!resize.isResizing) hoveredEdge = null
                isBridgeHovered = false
              }}
              onmousedown={(e) => handleResizeMouseDown(e, 'left')}
              onmouseup={stopEvent}
              onclick={stopEvent}
            ></div>
          {/if}

          {#if showRightResizeHandle}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
              class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r pointer-events-auto"
              data-transition-hit-zone="right-edge"
              onmouseenter={() => {
                hoveredEdge = 'right'
                isBridgeHovered = true
              }}
              onmouseleave={() => {
                if (!resize.isResizing) hoveredEdge = null
                isBridgeHovered = false
              }}
              onmousedown={(e) => handleResizeMouseDown(e, 'right')}
              onmouseup={stopEvent}
              onclick={stopEvent}
            ></div>
          {/if}
        </div>
      {/snippet}
    </ContextMenuTrigger>

    <ContextMenuContent>
      <ContextMenuItem onclick={handleDelete} class="text-destructive">
        <Trash2 class="w-4 h-4 mr-2" />
        Remove Transition
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
{/if}
