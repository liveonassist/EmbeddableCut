<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { useCornerPinStore, type CornerPinHandle, type CornerPinValues } from '@/features/preview/stores/corner-pin-store'
  import { resolveCornerPinTargetRect, resolveCornerPinForSize, withCornerPinReferenceSize } from '@/features/preview/deps/composition-runtime'
  import { updateItem, useItemsStore } from '@/features/preview/deps/timeline-store'
  import type { CoordinateParams, Transform } from '@/features/preview/types/gizmo'
  import { getEffectiveScale } from '@/features/preview/utils/coordinate-transform'

  interface CornerPinOverlayProps {
    coordParams: CoordinateParams
    playerSize: { width: number; height: number }
    itemTransform: Transform
  }

  const HANDLE_RADIUS = 6

  const HIT_RADIUS = 12

  const PADDING = 20

  const CORNER_KEYS: CornerPinHandle[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

  const DEFAULT_PIN: CornerPinValues = {
    topLeft: [0, 0],
    topRight: [0, 0],
    bottomRight: [0, 0],
    bottomLeft: [0, 0],
  }
</script>

<script lang="ts">
  let { coordParams, playerSize, itemTransform }: CornerPinOverlayProps = $props()
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const isDraggingRef = { current: false }
  const dragHandleRef: { current: CornerPinHandle | null } = { current: null }
  const dragStartPinRef: { current: CornerPinValues } = { current: DEFAULT_PIN }

  const editingItemId = select(useCornerPinStore, (s) => s.editingItemId)
  const draggingHandle = select(useCornerPinStore, (s) => s.draggingHandle)
  const hoveredHandle = select(useCornerPinStore, (s) => s.hoveredHandle)
  const previewCornerPin = select(useCornerPinStore, (s) => s.previewCornerPin)
  const setHovered = useCornerPinStore.getState().setHovered

  const item = selectDerived(useItemsStore, (s) => (editingItemId.current ? s.itemById[editingItemId.current] : undefined))
  const cornerPinTargetRect = (transform: Transform) =>
      resolveCornerPinTargetRect(
        transform.width,
        transform.height,
        item.current?.type === 'video' || item.current?.type === 'image'
          ? {
              sourceWidth: item.current.sourceWidth,
              sourceHeight: item.current.sourceHeight,
              crop: item.current.crop,
            }
          : undefined,
      )
  const resolvedBaseCornerPin = $derived.by(() => {
    if (!item.current) return DEFAULT_PIN
    const targetRect = cornerPinTargetRect(itemTransform)
    return (
      resolveCornerPinForSize(item.current.cornerPin, targetRect.width, targetRect.height) ?? DEFAULT_PIN
    )
  })
  const cornerPin = $derived(previewCornerPin.current ?? resolvedBaseCornerPin)

  const scale = $derived(getEffectiveScale(coordParams))

  // Keep refs current for use inside pointer event handlers
  const coordParamsRef = { current: coordParams }
  $effect.pre(() => {
    coordParamsRef.current = coordParams
  })
  const itemTransformRef = { current: itemTransform }
  $effect.pre(() => {
    itemTransformRef.current = itemTransform
  })
  const scaleRef = { current: scale }
  $effect.pre(() => {
    scaleRef.current = scale
  })
  const editingItemIdRef = { current: editingItemId.current }
  $effect.pre(() => {
    editingItemIdRef.current = editingItemId.current
  })
  const baseCornerPinRef = { current: resolvedBaseCornerPin }
  $effect.pre(() => {
    baseCornerPinRef.current = resolvedBaseCornerPin
  })

  // Convert item-local corner position to canvas draw coordinates (with padding offset)
  const cornerToCanvas = (corner: CornerPinHandle): [number, number] => {
      const { projectSize } = coordParams
      const targetRect = cornerPinTargetRect(itemTransform)

      const itemLeft =
        projectSize.width / 2 + itemTransform.x - itemTransform.width / 2 + targetRect.x
      const itemTop =
        projectSize.height / 2 + itemTransform.y - itemTransform.height / 2 + targetRect.y

      let cx: number, cy: number
      const pin = cornerPin[corner]
      switch (corner) {
        case 'topLeft':
          cx = itemLeft + pin[0]
          cy = itemTop + pin[1]
          break
        case 'topRight':
          cx = itemLeft + targetRect.width + pin[0]
          cy = itemTop + pin[1]
          break
        case 'bottomRight':
          cx = itemLeft + targetRect.width + pin[0]
          cy = itemTop + targetRect.height + pin[1]
          break
        case 'bottomLeft':
          cx = itemLeft + pin[0]
          cy = itemTop + targetRect.height + pin[1]
          break
      }

      if (itemTransform.rotation !== 0) {
        const itemBoxLeft = projectSize.width / 2 + itemTransform.x - itemTransform.width / 2
        const itemBoxTop = projectSize.height / 2 + itemTransform.y - itemTransform.height / 2
        const centerX = itemBoxLeft + (itemTransform.anchorX ?? itemTransform.width / 2)
        const centerY = itemBoxTop + (itemTransform.anchorY ?? itemTransform.height / 2)
        const rad = (itemTransform.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const dx = cx - centerX
        const dy = cy - centerY
        cx = centerX + dx * cos - dy * sin
        cy = centerY + dx * sin + dy * cos
      }

      return [cx * scale + PADDING, cy * scale + PADDING]
    }

  // Convert pointer position (relative to canvas element) to item-local offset
  const pointerToCornerOffset = (corner: CornerPinHandle, px: number, py: number): [number, number] => {
      const it = itemTransformRef.current
      const sc = scaleRef.current
      const { projectSize } = coordParamsRef.current
      const targetRect = cornerPinTargetRect(it)

      // Remove padding, then convert from screen to project space
      let canvasX = (px - PADDING) / sc
      let canvasY = (py - PADDING) / sc

      if (it.rotation !== 0) {
        const itemLeft = projectSize.width / 2 + it.x - it.width / 2
        const itemTop = projectSize.height / 2 + it.y - it.height / 2
        const centerX = itemLeft + (it.anchorX ?? it.width / 2)
        const centerY = itemTop + (it.anchorY ?? it.height / 2)
        const rad = (-it.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const dx = canvasX - centerX
        const dy = canvasY - centerY
        canvasX = centerX + dx * cos - dy * sin
        canvasY = centerY + dx * sin + dy * cos
      }

      const itemLeft = projectSize.width / 2 + it.x - it.width / 2 + targetRect.x
      const itemTop = projectSize.height / 2 + it.y - it.height / 2 + targetRect.y

      switch (corner) {
        case 'topLeft':
          return [canvasX - itemLeft, canvasY - itemTop]
        case 'topRight':
          return [canvasX - (itemLeft + targetRect.width), canvasY - itemTop]
        case 'bottomRight':
          return [canvasX - (itemLeft + targetRect.width), canvasY - (itemTop + targetRect.height)]
        case 'bottomLeft':
          return [canvasX - itemLeft, canvasY - (itemTop + targetRect.height)]
      }
    }

  // Draw the overlay
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const corners = CORNER_KEYS.map((key) => cornerToCanvas(key))

    // Quad outline
    ctx.beginPath()
    ctx.moveTo(corners[0]![0], corners[0]![1])
    ctx.lineTo(corners[1]![0], corners[1]![1])
    ctx.lineTo(corners[2]![0], corners[2]![1])
    ctx.lineTo(corners[3]![0], corners[3]![1])
    ctx.closePath()
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Diagonals
    ctx.beginPath()
    ctx.moveTo(corners[0]![0], corners[0]![1])
    ctx.lineTo(corners[2]![0], corners[2]![1])
    ctx.moveTo(corners[1]![0], corners[1]![1])
    ctx.lineTo(corners[3]![0], corners[3]![1])
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Corner handles
    const labels = ['TL', 'TR', 'BR', 'BL']
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i]!
      const key = CORNER_KEYS[i]!
      const isActive = draggingHandle.current === key
      const isHov = hoveredHandle.current === key
      const radius = isActive || isHov ? HANDLE_RADIUS + 2 : HANDLE_RADIUS

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? '#22d3ee' : isHov ? 'rgba(34, 211, 238, 0.8)' : 'white'
      ctx.fill()
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = isActive ? 'white' : '#22d3ee'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(labels[i]!, cx, cy - radius - 4)
    }
  }

  // Hit test: returns corner key if pointer is near a handle
  const hitTestXY = (px: number, py: number): CornerPinHandle | null => {
      for (const key of CORNER_KEYS) {
        const [cx, cy] = cornerToCanvas(key)
        const dx = px - cx
        const dy = py - cy
        if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
          return key
        }
      }
      return null
    }

  // --- Pointer-capture based drag ---
  const handlePointerDown = (e: PointerEvent) => {
      if (isDraggingRef.current) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const hit = hitTestXY(px, py)
      if (!hit || !editingItemIdRef.current) return

      e.stopPropagation()
      e.preventDefault()
      canvasRef.current!.setPointerCapture(e.pointerId)

      isDraggingRef.current = true
      dragHandleRef.current = hit
      dragStartPinRef.current = { ...baseCornerPinRef.current }

      useCornerPinStore.getState().setDragging(hit)
    }

  const handlePointerMove = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      if (isDraggingRef.current && dragHandleRef.current) {
        const offset = pointerToCornerOffset(dragHandleRef.current, px, py)
        const rounded: [number, number] = [
          Math.round(offset[0] * 10) / 10,
          Math.round(offset[1] * 10) / 10,
        ]
        useCornerPinStore.getState().setPreview({
          ...dragStartPinRef.current,
          [dragHandleRef.current]: rounded,
        })
        return
      }

      // Hover detection
      const hit = hitTestXY(px, py)
      setHovered(hit)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.style.cursor = hit ? 'move' : 'default'
      }
    }

  const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      e.stopPropagation()
      e.preventDefault()
      canvasRef.current?.releasePointerCapture(e.pointerId)

      isDraggingRef.current = false
      const handle = dragHandleRef.current
      dragHandleRef.current = null

      // Commit final preview value to timeline store
      const finalPreview = useCornerPinStore.getState().previewCornerPin
      const itemId = editingItemIdRef.current
      if (finalPreview && itemId && handle) {
        const targetRect = cornerPinTargetRect(itemTransformRef.current)
        updateItem(itemId, {
          cornerPin: withCornerPinReferenceSize(finalPreview, targetRect.width, targetRect.height),
        })
      }

      // Wait 2 animation frames before clearing preview to ensure React has
      // processed the timeline store update and re-rendered with new item values.
      // (Same pattern as transform-gizmo.tsx to prevent snap-back.)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          useCornerPinStore.getState().clearPreview()
        })
      })
    }

  // Resize canvas to match player size (with padding), then redraw
  $effect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = (playerSize.width + PADDING * 2) * dpr
    const h = (playerSize.height + PADDING * 2) * dpr
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    draw()
  })
</script>

<canvas
  bind:this={canvasRef.current}
  class="absolute z-20"
  style:top="{-PADDING}px"
  style:left="{-PADDING}px"
  style:width="{playerSize.width + PADDING * 2}px"
  style:height="{playerSize.height + PADDING * 2}px"
  style:pointer-events="auto"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onclick={(e) => e.stopPropagation()}
></canvas>
