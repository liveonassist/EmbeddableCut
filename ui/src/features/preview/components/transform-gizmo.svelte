<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import type { TimelineItem } from '@/types/timeline'
  import type { CropSettings } from '@/types/transform'
  import type { GizmoHandle, Transform, CoordinateParams } from '@/features/preview/types/gizmo'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import { useItemGizmoPreview } from '../stores/use-item-gizmo-preview.svelte'
  import { resolveAnimatedCrop } from '@/features/preview/deps/keyframes'
  import { useAnimatedTransform } from '@/features/preview/deps/keyframes-ui'
  import { useKeyframesStore } from '@/features/preview/deps/timeline-store'
  import { useEscapeCancel } from '../hooks/use-drag-interaction.svelte'
  import GizmoHandles from './gizmo-handles.svelte'
  import { getEffectiveScale, transformToScreenBounds, screenToCanvas, getScaleCursor, getScreenTransformOrigin } from '@/features/preview/utils/coordinate-transform'
  import { attachWindowTransformInteraction, suppressReleaseClick } from '@/features/preview/utils/gizmo-transform-interaction'
  import { notifyOnBlockedMouseDragIntent } from '@/features/preview/utils/mouse-drag-intent'
  import { getSourceDimensions, hasCornerPin } from '@/features/preview/deps/composition-runtime'
  import { expandTextTransformForPreview } from '@/features/preview/utils/text-layout'
  import { calculateMediaCropLayout, resolveCropSettings } from '@/shared/utils/media-crop'
  import { calculateCropFromDrag, type CropEdge } from '@/features/preview/utils/crop-gizmo'
  import { attachWindowAnchorInteraction } from '@/features/preview/utils/anchor-gizmo'
  import { prepareScaleStartTransform } from '@/features/preview/utils/transform-calculations'

  interface TransformGizmoProps {
    item: TimelineItem
    coordParams: CoordinateParams
    onTransformStart: () => void
    onTransformEnd: (
      transform: Transform,
      operation: 'move' | 'resize' | 'rotate' | 'anchor',
    ) => void
    onCropEnd: (edge: CropEdge, ratio: number) => void
    /** Whether video is currently playing - gizmo shows at lower opacity during playback */
    isPlaying?: boolean
    /** Position is driven by a property link, so direct translation is rejected. */
    translateBlocked?: boolean
    translateBlockedLabel?: string
    onTranslateBlocked?: () => void
  }

  let { item, coordParams, onTransformStart, onTransformEnd, onCropEnd, isPlaying = false, translateBlocked = false, translateBlockedLabel, onTranslateBlocked }: TransformGizmoProps = $props()
  const itemGizmoPreview = useItemGizmoPreview(() => item.id, () => ({
    imperativeTranslate: true,
  }))
  const { activeGizmo, previewTransform, itemPreview } = $derived(itemGizmoPreview)
  const startTranslate = useGizmoStore.getState().startTranslate
  const startScale = useGizmoStore.getState().startScale
  const startRotate = useGizmoStore.getState().startRotate
  const updateInteraction = useGizmoStore.getState().updateInteraction
  const endInteraction = useGizmoStore.getState().endInteraction
  const clearInteraction = useGizmoStore.getState().clearInteraction
  const cancelInteraction = useGizmoStore.getState().cancelInteraction
  const setPropertiesPreviewNew = useGizmoStore.getState().setPropertiesPreviewNew
  const setTransformPreview = useGizmoStore.getState().setTransformPreview
  const replaceItemPreview = useGizmoStore.getState().replaceItemPreview
  let activeCropEdge = $state.raw<CropEdge | null>(null)
  const setActiveCropEdge = (next: CropEdge | null | ((prev: CropEdge | null) => CropEdge | null)) => {
    activeCropEdge = typeof next === 'function' ? (next as (prev: CropEdge | null) => CropEdge | null)(untrack(() => activeCropEdge)) : next
  }
  let isAnchorDragging = $state.raw(false)
  const setIsAnchorDragging = (next: typeof isAnchorDragging | ((prev: typeof isAnchorDragging) => typeof isAnchorDragging)) => {
    isAnchorDragging = typeof next === 'function' ? (next as (prev: typeof isAnchorDragging) => typeof isAnchorDragging)(untrack(() => isAnchorDragging)) : next
  }
  const cancelCropInteractionRef: { current: (() => void) | null } = { current: null }
  const cancelAnchorInteractionRef: { current: (() => void) | null } = { current: null }
  const transformNodeRef: { current: HTMLDivElement | null } = { current: null }
  const acknowledgedHandoffRef: { current: number | null } = { current: null }

  const isTransformInteracting = $derived(activeGizmo?.itemId === item.id)
  const isInteracting = $derived(isTransformInteracting || activeCropEdge !== null || isAnchorDragging)

  // Get animated transform using centralized hook
  const animatedTransformResult = useAnimatedTransform(() => item, () => coordParams.projectSize)
  const { transform: animatedTransform, relativeFrame } = $derived(animatedTransformResult)
  const itemKeyframes = selectDerived(useKeyframesStore, (state) => state.keyframesByItemId[item.id])

  // Get current transform (use preview during interaction, or properties panel preview)
  const currentTransform = $derived.by((): Transform => {
    // If gizmo is being dragged, use its preview
    if (isTransformInteracting && previewTransform) {
      return previewTransform
    }

    let baseTransform: Transform = {
      x: animatedTransform.x,
      y: animatedTransform.y,
      width: animatedTransform.width,
      height: animatedTransform.height,
      anchorX: animatedTransform.anchorX,
      anchorY: animatedTransform.anchorY,
      rotation: animatedTransform.rotation,
      opacity: animatedTransform.opacity,
      cornerRadius: animatedTransform.cornerRadius,
    }

    if (item.type === 'text' && itemPreview?.properties && !hasCornerPin(item.cornerPin)) {
      baseTransform = expandTextTransformForPreview(
        item,
        {
          ...baseTransform,
          anchorX: baseTransform.anchorX ?? baseTransform.width / 2,
          anchorY: baseTransform.anchorY ?? baseTransform.height / 2,
          cornerRadius: baseTransform.cornerRadius ?? 0,
        },
        itemPreview?.properties,
      )
    }

    // If properties panel is previewing this item's transform, merge its values
    const transformPreview = itemPreview?.transform
    if (transformPreview) {
      return { ...baseTransform, ...transformPreview }
    }

    return baseTransform
  })
  const renderedTransformRef = { current: currentTransform }

  const syncTranslatePresentation = (state: ReturnType<typeof useGizmoStore.getState>) => {
      const transformNode = transformNodeRef.current
      if (!transformNode) return

      const active = state.activeGizmo
      const handoff = state.presentationHandoff
      const liveTransform =
        active?.itemId === item.id && active.mode === 'translate'
          ? state.previewTransform
          : null
      const settlingTransform =
        !liveTransform && handoff?.itemId === item.id && handoff.mode === 'translate'
          ? handoff.finalTransform
          : null
      const interactionId = liveTransform
        ? active!.interactionId
        : settlingTransform
          ? handoff!.interactionId
          : null

      if (
        interactionId === null ||
        (!liveTransform && acknowledgedHandoffRef.current === interactionId)
      ) {
        transformNode.style.removeProperty('translate')
        return
      }
      if (liveTransform) acknowledgedHandoffRef.current = null

      const target = liveTransform ?? settlingTransform!
      const scale = getEffectiveScale(coordParams)
      const x = (target.x - renderedTransformRef.current.x) * scale
      const y = (target.y - renderedTransformRef.current.y) * scale
      if (!liveTransform && Math.abs(x) < 0.01 && Math.abs(y) < 0.01) {
        acknowledgedHandoffRef.current = interactionId
        transformNode.style.removeProperty('translate')
        requestAnimationFrame(() =>
          useGizmoStore.getState().completePresentationHandoff(interactionId),
        )
        return
      }
      transformNode.style.setProperty('translate', `${x}px ${y}px`)
    }

  $effect(() => {
    renderedTransformRef.current = currentTransform
    syncTranslatePresentation(useGizmoStore.getState())
  })

  $effect(() => useGizmoStore.subscribe(syncTranslatePresentation))

  const sourceDimensions = $derived.by(() => {
    if (item.type !== 'video' && item.type !== 'composition') return null
    return (
      getSourceDimensions(item) ?? {
        width: Math.max(1, currentTransform.width),
        height: Math.max(1, currentTransform.height),
      }
    )
  })

  const animatedCrop = $derived.by(() => {
    if (!sourceDimensions) return undefined
    return resolveAnimatedCrop(item.crop, itemKeyframes.current, relativeFrame, sourceDimensions)
  })

  const currentCrop = $derived(itemPreview?.properties?.crop ?? animatedCrop)

  const cropLayout = $derived.by(() => {
    if (!sourceDimensions || hasCornerPin(item.cornerPin)) return null
    return calculateMediaCropLayout(
      sourceDimensions.width,
      sourceDimensions.height,
      currentTransform.width,
      currentTransform.height,
      currentCrop,
      item.type === 'composition' ? 'fill' : 'contain',
    )
  })

  // Convert to screen bounds, expanding for stroke width on shapes
  const screenBounds = $derived.by(() => {
    const bounds = transformToScreenBounds(currentTransform, coordParams)

    // Expand bounds for stroke width on shape items
    if (item.type === 'shape') {
      // Get stroke width from unified preview or item
      const previewStroke = itemPreview?.properties?.strokeWidth
      const strokeWidth = previewStroke ?? item.strokeWidth ?? 0

      if (strokeWidth > 0) {
        // Scale stroke width to screen space
        const scale = coordParams.playerSize.width / coordParams.projectSize.width
        const screenStroke = strokeWidth * scale

        // Expand bounds by half stroke on each side (stroke is centered on path)
        bounds.left -= screenStroke / 2
        bounds.top -= screenStroke / 2
        bounds.width += screenStroke
        bounds.height += screenStroke
      }
    }

    return bounds
  })

  const transformOrigin = $derived.by(() => {
    return getScreenTransformOrigin(currentTransform, coordParams)
  })

  // Helper to convert screen position to canvas position
  const toCanvasPoint = (e: MouseEvent | MouseEvent) => {
      return screenToCanvas(e.clientX, e.clientY, coordParams)
    }

  // Get stroke width for shapes (used in snapping)
  const strokeWidth = $derived(item.type === 'shape' ? (item.strokeWidth ?? 0) : 0)

  // Mouse event handlers
  const handleTranslateStart = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (translateBlocked) {
        if (onTranslateBlocked) {
          notifyOnBlockedMouseDragIntent(e, onTranslateBlocked)
        }
        return
      }
      const point = toCanvasPoint(e)
      const startTransformSnapshot = { ...currentTransform }
      const interactionId = startTranslate(
        item.id,
        point,
        currentTransform,
        strokeWidth,
        item.type,
      )
      onTransformStart()
      document.body.style.cursor = 'move'

      attachWindowTransformInteraction({
        toCanvasPoint,
        updateInteraction,
        startTransform: startTransformSnapshot,
        endInteraction,
        onTransformEnd,
        operation: 'move',
        afterFinish: () => {
          clearInteraction(interactionId)
        },
      })
    }

  const handleScaleStart = (handle: GizmoHandle, e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const point = toCanvasPoint(e)
      const scaleStartTransform = prepareScaleStartTransform(
        currentTransform,
        item,
        itemKeyframes.current,
        itemPreview?.transform,
      )
      const startTransformSnapshot = { ...scaleStartTransform }
      const interactionId = startScale(
        item.id,
        handle,
        point,
        scaleStartTransform,
        item.type,
        item.transform?.aspectRatioLocked,
        strokeWidth,
      )
      onTransformStart()
      document.body.style.cursor = getScaleCursor(handle, currentTransform.rotation)

      attachWindowTransformInteraction({
        toCanvasPoint,
        updateInteraction,
        startTransform: startTransformSnapshot,
        endInteraction,
        onTransformEnd,
        operation: 'resize',
        afterFinish: () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              clearInteraction(interactionId)
            })
          })
        },
      })
    }

  const handleRotateStart = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const point = toCanvasPoint(e)
      const startTransformSnapshot = { ...currentTransform }
      const interactionId = startRotate(
        item.id,
        point,
        currentTransform,
        strokeWidth,
        item.type,
      )
      onTransformStart()
      document.body.style.cursor = 'crosshair'

      attachWindowTransformInteraction({
        toCanvasPoint,
        updateInteraction,
        startTransform: startTransformSnapshot,
        endInteraction,
        onTransformEnd,
        operation: 'rotate',
        afterFinish: () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              clearInteraction(interactionId)
            })
          })
        },
      })
    }

  const handleCropStart = (edge: CropEdge, e: MouseEvent) => {
      if (!cropLayout || !sourceDimensions) return
      e.stopPropagation()
      e.preventDefault()

      const startPoint = toCanvasPoint(e)
      const startCrop = resolveCropSettings(currentCrop)
      const previousPreview = useGizmoStore.getState().preview?.[item.id] ?? null
      let latestCrop: CropSettings = startCrop
      let latestMouseEvent: MouseEvent | null = null
      let animationFrame: number | null = null
      let finished = false

      const restorePreview = (deferred: boolean) => {
        const restore = () => replaceItemPreview(item.id, previousPreview)
        if (!deferred) {
          restore()
          return
        }
        requestAnimationFrame(() => requestAnimationFrame(restore))
      }

      const updateFromEvent = (moveEvent: MouseEvent) => {
        latestCrop = calculateCropFromDrag({
          edge,
          startCrop,
          startPoint,
          currentPoint: toCanvasPoint(moveEvent),
          rotation: currentTransform.rotation,
          mediaRect: cropLayout.mediaRect,
          sourceDimension:
            edge === 'left' || edge === 'right' ? sourceDimensions.width : sourceDimensions.height,
        })
        setPropertiesPreviewNew({ [item.id]: { crop: latestCrop } })
      }

      const flushLatestEvent = () => {
        if (animationFrame !== null) {
          cancelAnimationFrame(animationFrame)
          animationFrame = null
        }
        if (latestMouseEvent) {
          updateFromEvent(latestMouseEvent)
          latestMouseEvent = null
        }
      }

      const removeListeners = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        cancelCropInteractionRef.current = null
      }

      const finish = (commit: boolean) => {
        if (finished) return
        finished = true
        if (commit) {
          flushLatestEvent()
          suppressReleaseClick()
        } else if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        removeListeners()
        document.body.style.cursor = ''
        setActiveCropEdge(null)

        if (commit && Math.abs(latestCrop[edge]! - startCrop[edge]) > 0.000001) {
          onCropEnd(edge, latestCrop[edge]!)
          restorePreview(true)
        } else {
          restorePreview(false)
        }
      }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        latestMouseEvent = moveEvent
        if (animationFrame !== null) return
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null
          if (!latestMouseEvent) return
          const eventToApply = latestMouseEvent
          latestMouseEvent = null
          updateFromEvent(eventToApply)
        })
      }
      const handleMouseUp = (upEvent: MouseEvent) => {
        latestMouseEvent = upEvent
        finish(true)
      }

      cancelCropInteractionRef.current = () => finish(false)
      setActiveCropEdge(edge)
      onTransformStart()
      document.body.style.cursor = getScaleCursor(
        edge === 'left' ? 'w' : edge === 'right' ? 'e' : edge === 'top' ? 'n' : 's',
        currentTransform.rotation,
      )
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

  const handleAnchorStart = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()

      const startPoint = toCanvasPoint(event)
      const startTransform = { ...currentTransform }
      const previousPreview = useGizmoStore.getState().preview?.[item.id] ?? null

      const restorePreview = (deferred: boolean) => {
        const restore = () => replaceItemPreview(item.id, previousPreview)
        if (deferred) requestAnimationFrame(() => requestAnimationFrame(restore))
        else restore()
      }

      setIsAnchorDragging(true)
      onTransformStart()
      document.body.style.cursor = 'move'
      cancelAnchorInteractionRef.current = attachWindowAnchorInteraction({
        startTransform,
        startPoint,
        toCanvasPoint,
        setPreview: (transform) => setTransformPreview({ [item.id]: transform }),
        restorePreview,
        onCommit: (transform) => onTransformEnd(transform, 'anchor'),
        onFinish: () => {
          cancelAnchorInteractionRef.current = null
          document.body.style.cursor = ''
          setIsAnchorDragging(false)
        },
      })
    }

  $effect(() => untrack(() => () => {
      cancelCropInteractionRef.current?.()
      cancelAnchorInteractionRef.current?.()
    }))

  // Handle escape key to cancel interaction
  useEscapeCancel(() => isInteracting, () => () => {
      if (cancelCropInteractionRef.current) {
        cancelCropInteractionRef.current()
        return
      }
      if (cancelAnchorInteractionRef.current) {
        cancelAnchorInteractionRef.current()
        return
      }
      cancelInteraction()
      document.body.style.cursor = ''
    })
</script>

<div
  bind:this={transformNodeRef.current}
  class="absolute transition-opacity duration-150"
  style:left="{screenBounds.left}px"
  style:top="{screenBounds.top}px"
  style:width="{screenBounds.width}px"
  style:height="{screenBounds.height}px"
  style:transform={`rotate(${currentTransform.rotation}deg)`}
  style:transform-origin={transformOrigin}
  style:opacity={isPlaying ? 0 : 1}
  style:z-index="100"
  style:pointer-events="auto"
  onmousedown={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  {#if item.type === 'controller'}
    <div
      class="pointer-events-none absolute inset-0"
      data-testid="null-controller-gizmo"
    >
      <div
        class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/70"
      ></div>
      <div
        class="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-primary/70"
      ></div>
      <div
        class="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary bg-background/80"
      ></div>
    </div>
  {/if}
  <GizmoHandles
    bounds={screenBounds}
    rotation={currentTransform.rotation}
    isInteracting={isInteracting}
    isMask={item.type === 'shape' && item.isMask}
    onTranslateStart={handleTranslateStart}
    translateBlocked={translateBlocked}
    translateBlockedLabel={translateBlockedLabel}
    onScaleStart={handleScaleStart}
    onRotateStart={handleRotateStart}
    cropRect={cropLayout
      ? {
          left: cropLayout.cropViewportRect.x * getEffectiveScale(coordParams),
          top: cropLayout.cropViewportRect.y * getEffectiveScale(coordParams),
          width: cropLayout.cropViewportRect.width * getEffectiveScale(coordParams),
          height: cropLayout.cropViewportRect.height * getEffectiveScale(coordParams),
        }
      : undefined}
    onCropStart={cropLayout ? handleCropStart : undefined}
   />
  <button
    type="button"
    aria-label="Move anchor point"
    title="Move anchor point"
    data-testid="anchor-point-handle"
    class="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-primary bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
    style:left="{(screenBounds.width - currentTransform.width * getEffectiveScale(coordParams)) / 2 +
            (currentTransform.anchorX ?? currentTransform.width / 2) *
              getEffectiveScale(coordParams)}px"
    style:top="{(screenBounds.height - currentTransform.height * getEffectiveScale(coordParams)) / 2 +
            (currentTransform.anchorY ?? currentTransform.height / 2) *
              getEffectiveScale(coordParams)}px"
    onmousedown={handleAnchorStart}
  >
    <span
      class="pointer-events-none absolute left-1/2 top-[-3px] h-[16px] w-px -translate-x-1/2 bg-primary"
    ></span>
    <span
      class="pointer-events-none absolute left-[-3px] top-1/2 h-px w-[16px] -translate-y-1/2 bg-primary"
    ></span>
  </button>
</div>
