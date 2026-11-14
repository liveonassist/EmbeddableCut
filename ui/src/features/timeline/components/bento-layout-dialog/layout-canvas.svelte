<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { computeLayout } from '@/features/timeline/utils/bento-layout'
  import type { BentoLayoutItem, LayoutConfig } from '@/features/timeline/utils/bento-layout'
  import type { TimelineItem } from '@/types/timeline'
  import CanvasItem from './canvas-item.svelte'
  import type { CanvasItemRect } from './bento-layout-dialog-model'

  interface Props {
    /** Ordered chains — each chain is a group of item IDs sharing one layout cell */
    chainOrder: string[][]
    onSwap: (fromIndex: number, toIndex: number) => void
    canvasWidth: number
    canvasHeight: number
    config: LayoutConfig
    itemsLookup: Map<string, TimelineItem>
  }

  let { chainOrder, onSwap, canvasWidth, canvasHeight, config, itemsLookup }: Props = $props()

  let container = $state<HTMLDivElement | null>(null)
  let containerWidth = $state(0)

  // Measure container width
  $effect(() => {
    const el = container
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth = entry.contentRect.width
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  })

  // Compute display scale (guard against zero/missing canvas dimensions)
  const safeCanvasWidth = $derived(canvasWidth > 0 ? canvasWidth : 1920)
  const safeCanvasHeight = $derived(canvasHeight > 0 ? canvasHeight : 1080)
  const aspectRatio = $derived(safeCanvasWidth / safeCanvasHeight)
  const displayWidth = $derived(containerWidth)
  const displayHeight = $derived(containerWidth > 0 ? displayWidth / aspectRatio : 200)
  const scale = $derived(containerWidth > 0 ? displayWidth / safeCanvasWidth : 1)

  // Build one layout item per chain (representative = first item in chain)
  const layoutItems: BentoLayoutItem[] = $derived(
    chainOrder.map((chain) => {
      const repId = chain[0]!
      const item = itemsLookup.get(repId)
      const sw =
        item && 'sourceWidth' in item && item.sourceWidth ? item.sourceWidth : safeCanvasWidth
      const sh =
        item && 'sourceHeight' in item && item.sourceHeight ? item.sourceHeight : safeCanvasHeight
      return { id: repId, sourceWidth: sw, sourceHeight: sh }
    }),
  )

  const transformsMap = $derived.by(() => {
    if (layoutItems.length === 0)
      return new Map<string, { x?: number; y?: number; width?: number; height?: number }>()
    return computeLayout(layoutItems, safeCanvasWidth, safeCanvasHeight, config)
  })

  // Convert center-relative coords to absolute top-left, then scale — one rect per chain
  const canvasRects: CanvasItemRect[] = $derived.by(() => {
    const cx = safeCanvasWidth / 2
    const cy = safeCanvasHeight / 2
    return chainOrder.map((chain) => {
      const repId = chain[0]!
      const transform = transformsMap.get(repId)
      const item = itemsLookup.get(repId)
      const w = transform?.width ?? safeCanvasWidth
      const h = transform?.height ?? safeCanvasHeight
      const absLeft = cx + (transform?.x ?? 0) - w / 2
      const absTop = cy + (transform?.y ?? 0) - h / 2
      // Build label: show all item labels in the chain
      const label =
        chain.length === 1
          ? (item?.label ?? repId.slice(0, 6))
          : chain.map((id) => itemsLookup.get(id)?.label ?? id.slice(0, 4)).join(' → ')
      return {
        id: repId,
        label,
        type: item?.type ?? 'video',
        left: absLeft * scale,
        top: absTop * scale,
        width: w * scale,
        height: h * scale,
      }
    })
  })

  // Drag state
  let dragIndex = $state<number | null>(null)
  let dragOffset = $state<{ x: number; y: number } | null>(null)
  let dropTargetIndex = $state<number | null>(null)
  let dragStartPos: { x: number; y: number } | null = null

  // Hit-test: find which canvas rect the cursor is over
  function hitTest(clientX: number, clientY: number): number | null {
    const el = container
    if (!el) return null
    const bounds = el.getBoundingClientRect()
    const px = clientX - bounds.left
    const py = clientY - bounds.top
    for (let i = 0; i < canvasRects.length; i++) {
      const r = canvasRects[i]!
      if (px >= r.left && px <= r.left + r.width && py >= r.top && py <= r.top + r.height) {
        return i
      }
    }
    return null
  }

  // Window-level mouse handlers for drag. They read the drop target and rects
  // when each event arrives, so they need re-attaching only per drag.
  $effect(() => {
    const activeDragIndex = dragIndex
    if (activeDragIndex === null) return

    return untrack(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!dragStartPos) return
        dragOffset = {
          x: e.clientX - dragStartPos.x,
          y: e.clientY - dragStartPos.y,
        }
        const target = hitTest(e.clientX, e.clientY)
        dropTargetIndex = target !== null && target !== activeDragIndex ? target : null
      }

      const handleMouseUp = () => {
        if (dropTargetIndex !== null && dropTargetIndex !== activeDragIndex) {
          onSwap(activeDragIndex, dropTargetIndex)
        }
        dragIndex = null
        dragOffset = null
        dropTargetIndex = null
        dragStartPos = null
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    })
  })

  function handleItemMouseDown(index: number, e: MouseEvent) {
    e.preventDefault()
    dragIndex = index
    dragStartPos = { x: e.clientX, y: e.clientY }
    dragOffset = { x: 0, y: 0 }
  }
</script>

<div
  bind:this={container}
  class="relative w-full rounded-md border border-border bg-muted/30 overflow-hidden"
  style:height="{displayHeight > 0 ? displayHeight : 200}px"
>
  {#each canvasRects as rect, i (rect.id)}
    <CanvasItem
      {rect}
      isDragging={dragIndex === i}
      isDropTarget={dropTargetIndex === i}
      dragOffset={dragIndex === i ? dragOffset : null}
      onMouseDown={(e) => handleItemMouseDown(i, e)}
    />
  {/each}
  {#if canvasRects.length === 0}
    <div class="flex items-center justify-center h-full text-xs text-muted-foreground">
      {t('timeline.bento.noItemsToArrange')}
    </div>
  {/if}
</div>
