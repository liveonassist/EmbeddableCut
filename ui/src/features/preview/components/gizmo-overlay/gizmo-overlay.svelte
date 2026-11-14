<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { untrack } from 'svelte'
  import { select, shallow } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { toast } from 'svelte-sonner'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useSettingsStore } from '@/features/preview/deps/settings'
  import { applyAutoKeyframeOperations, updateItem, updateItemsTransformMap, updateItemTransform, updateVectorKeyframe, useItemsStore, useKeyframesStore, useTimelineSettingsStore } from '@/features/preview/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { getResolvedPlaybackFrame } from '@/shared/state/playback/frame-resolution'
  import { useGizmoStore, type ItemPreview } from '@/features/preview/stores/gizmo-store'
  import { useExclusiveCanvasEditor } from '../../hooks/use-exclusive-canvas-editor.svelte'
  import TransformGizmo from '../transform-gizmo.svelte'
  import GroupGizmo from '../group-gizmo.svelte'
  import SelectableItem from '../selectable-item.svelte'
  import MotionPathOverlay from '../motion-path-overlay.svelte'
  import { getEffectiveScale, getScreenTransformOrigin, screenToCanvas, transformToScreenBounds } from '@/features/preview/utils/coordinate-transform'
  import { attachWindowTransformInteraction } from '@/features/preview/utils/gizmo-transform-interaction'
  import { computeItemAabb } from '@/features/preview/utils/canvas-snap-utils'
  import { useMarqueeSelection, isMarqueeJustFinished, type Rect } from '@/shared/marquee/use-marquee-selection.svelte'
  import MarqueeOverlay from '@/shared/marquee/marquee-overlay.svelte'
  import { useVisualTransforms } from '../../hooks/use-visual-transform.svelte'
  import { useCanvasMediaDrop } from '../../hooks/use-canvas-media-drop.svelte'
  import { buildMotionPathPoints, canvasPointToMotionPathScreenPoint, type MotionPathScreenPoint } from '@/features/preview/utils/motion-path'
  import { buildDefaultSpatialTangents, updateSpatialTangent, worldPointToPositionKeyframeValue } from '@/features/preview/utils/motion-path-edit'
  import { attachWindowMotionPathPointerInteraction } from '@/features/preview/utils/motion-path-pointer-interaction'
  import { getAutoKeyframeOperation, type AutoKeyframeOperation } from '@/features/preview/deps/keyframes'
  import type { ItemKeyframes, SpatialBezierTangents } from '@/types/keyframe'
  import type { TimelineItem } from '@/types/timeline'
  import type { BoundingBox, CoordinateParams, Transform, Point } from '@/features/preview/types/gizmo'
  import type { ResolvedTransform, TransformProperties } from '@/types/transform'
  import { normalizeCropSettings } from '@/shared/utils/media-crop'
  import { getSourceDimensions, resolveTransform } from '@/features/preview/deps/composition-runtime'
  import { buildGizmoAnchorCommit, buildGizmoTransformCommit, resolveEditableGizmoTransform, resolveGizmoCommitParentWorld } from '@/features/preview/utils/gizmo-transform-commit'
  import { buildGroupTextScaleCommit, type GroupScaledTextProperties } from '@/features/preview/utils/group-text-scale'
  import { CROP_EDGE_PROPERTY, type CropEdge } from '@/features/preview/utils/crop-gizmo'
  import { MARQUEE_CANDIDATE_ATTRIBUTE, updateMarqueeCandidateElements } from '@/features/preview/utils/marquee-candidate-preview'
  import { getPositionLinkOwner } from '@/features/preview/utils/position-link-ownership'
  import LiveSnapGuides from './live-snap-guides.svelte'
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'

  interface GizmoOverlayProps {
    itemsSnapshot: TimelineItem[]
    containerRect: DOMRect | null
    playerSize: { width: number; height: number }
    projectSize: { width: number; height: number }
    zoom: number
    /** The hit area element for marquee bounds checking (React's `hitAreaRef`) */
    hitArea?: HTMLDivElement | null
    /** Padding around player for marquee display when starting from outside */
    overlayPadding?: number
  }

  interface MotionPathEditPreview {
    itemId: string
    keyframeId: string
    frame: number
    x: number
    y: number
    spatial?: SpatialBezierTangents
  }

  function getEditablePositionKeyframe(itemId: string, keyframeId: string) {
    const position = useKeyframesStore
      .getState()
      .keyframesByItemId[itemId]?.vectorProperties?.find(
        (property) => property.property === 'position',
      )
    const keyframe = position?.keyframes.find((candidate) => candidate.id === keyframeId)
    return position && keyframe ? { position, keyframe } : null
  }

  function toResolvedTransform(transform: Transform): ResolvedTransform {
    return {
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      anchorX: transform.anchorX ?? transform.width / 2,
      anchorY: transform.anchorY ?? transform.height / 2,
      rotation: transform.rotation,
      opacity: transform.opacity,
      cornerRadius: transform.cornerRadius ?? 0,
    }
  }
</script>

<script lang="ts">
  let { itemsSnapshot, containerRect, playerSize, projectSize, zoom, hitArea, overlayPadding = 100 }: GizmoOverlayProps = $props()
  // The context menu portals inside the editor, never into the host page's body.
  const contextMenuPortalTarget = portalTarget()
  const overlayRef: { current: HTMLDivElement | null } = { current: null }

  // The marquee portals into the full preview background once the parent binds it.
  const marqueePortalTarget = $derived(hitArea ?? null)
  const getResolvedFrameForPlaybackState = (
      playbackState: ReturnType<typeof usePlaybackStore.getState>,
      displayedFrame = usePreviewBridgeStore.getState().displayedFrame,
    ) =>
      getResolvedPlaybackFrame({
        ...playbackState,
        displayedFrame,
      })

  // Context menu state for selecting from overlapping items
  let contextMenu = $state.raw<{
    x: number
    y: number
    items: TimelineItem[]
  } | null>(null)
  const setContextMenu = (next: {
    x: number
    y: number
    items: TimelineItem[]
  } | null | ((prev: {
    x: number
    y: number
    items: TimelineItem[]
  } | null) => {
    x: number
    y: number
    items: TimelineItem[]
  } | null)) => {
    contextMenu = typeof next === 'function' ? (next as (prev: {
    x: number
    y: number
    items: TimelineItem[]
  } | null) => {
    x: number
    y: number
    items: TimelineItem[]
  } | null)(untrack(() => contextMenu)) : next
  }

  // Selection state
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const selectItems = select(useSelectionStore, (s) => s.selectItems)

  // Create Set for O(1) lookups instead of O(n) includes()
  const selectedItemIdsSet = $derived.by(() => new Set(selectedItemIds.current))
  const marqueeCandidateElementsRef: { current: Map<string, HTMLElement> } = { current: new Map() }
  const marqueeCandidateIdsRef: { current: Set<string> } = { current: new Set() }
  const bindMarqueeCandidateElement = (itemId: string, element: HTMLDivElement | null) => {
      if (!element) {
        marqueeCandidateElementsRef.current.delete(itemId)
        return
      }
      marqueeCandidateElementsRef.current.set(itemId, element)
      if (marqueeCandidateIdsRef.current.has(itemId)) {
        element.setAttribute(MARQUEE_CANDIDATE_ATTRIBUTE, 'true')
      }
    }
  const updateMarqueeCandidatePreview = (ids: string[]) => {
    marqueeCandidateIdsRef.current = updateMarqueeCandidateElements(
      marqueeCandidateElementsRef.current,
      marqueeCandidateIdsRef.current,
      ids,
    )
  }
  const clearMarqueeCandidatePreview = () => {
    updateMarqueeCandidatePreview([])
  }

  const liveTransforms = selectDerived(useItemsStore, (state) =>
          itemsSnapshot.map((item) => {
            const liveItem = state.itemById[item.id]
            if (liveItem && 'transform' in liveItem) return liveItem.transform
            return 'transform' in item ? item.transform : undefined
          }), shallow)
  const itemsWithLiveTransforms = $derived.by(() =>
      itemsSnapshot.map((item, index) => {
        const liveTransform = liveTransforms.current[index]
        if (
          !liveTransform ||
          !('transform' in item) ||
          Object.is(liveTransform, item.transform)
        ) {
          return item
        }
        return { ...item, transform: liveTransform } as TimelineItem
      }))

  // Stay on VideoPreview's transform-stable scene membership while merging
  // current transforms locally. A transform commit updates this overlay and
  // its hit targets without invalidating VideoPreview/MainComposition.
  const visualItems = $derived.by(() =>
      itemsWithLiveTransforms.filter(
        (item) => item.type !== 'audio' && item.type !== 'adjustment',
      ))
  const tracks = select(useItemsStore, (s) => s.tracks)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const canvasSnapEnabled = select(useSettingsStore, (s) => s.canvasSnapEnabled)

  // Ref to track if we just finished a drag (to prevent background click from deselecting)
  const justFinishedDragRef = { current: false }

  // Playback state - only subscribe to isPlaying to avoid re-renders during playback
  // Read currentFrame directly from store when needed (not during playback)
  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)

  // Track the "frozen" frame when playback starts - gizmos stay at this frame during playback
  // This prevents re-renders during playback while maintaining accuracy when paused/skimming
  const initialPlaybackState = {
    ...usePlaybackStore.getState(),
    displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
  }
  const frozenFrameRef: { current: number } = { current: getResolvedPlaybackFrame(initialPlaybackState) }

  // Update frozen frame when playback stops or when paused/skimming frame changes
  $effect(() => {
    if (!isPlaying.current) {
      // When paused/skimming, sync to the effective preview frame
      const nextFrame = getResolvedFrameForPlaybackState(usePlaybackStore.getState())
      if (frozenFrameRef.current !== nextFrame) {
        frozenFrameRef.current = nextFrame
        setForceUpdate((n) => n + 1)
      }
    }
  })

  // Subscribe to frame changes - always update when paused/skimming, or at clip boundaries during playback
  // NOTE: Reads items on-demand inside subscribe callback to avoid re-rendering on items change
  $effect(() => {
    let prevFrame = usePlaybackStore.getState().currentFrame
    const updatePausedFrame = (
      nextPlaybackState: ReturnType<typeof usePlaybackStore.getState>,
      prevPlaybackState: ReturnType<typeof usePlaybackStore.getState>,
      nextDisplayedFrame = usePreviewBridgeStore.getState().displayedFrame,
      prevDisplayedFrame = nextDisplayedFrame,
    ) => {
      const effectiveFrame = getResolvedFrameForPlaybackState(nextPlaybackState, nextDisplayedFrame)
      const prevEffectiveFrame = getResolvedFrameForPlaybackState(
        prevPlaybackState,
        prevDisplayedFrame,
      )
      if (effectiveFrame !== prevEffectiveFrame) {
        frozenFrameRef.current = effectiveFrame
        setForceUpdate((n) => n + 1)
      }
    }

    const unsubscribePlayback = usePlaybackStore.subscribe((state, prevState) => {
      const currentFrame = state.currentFrame

      if (!state.isPlaying) {
        // When paused/skimming, follow whichever source was updated most recently.
        updatePausedFrame(state, prevState)
      } else {
        // During playback, only update when crossing a clip boundary
        // Read items on-demand for fresh clip edges (avoids re-subscribing on items change)
        const currentItems = useItemsStore.getState().items
        const minFrame = Math.min(prevFrame, currentFrame)
        const maxFrame = Math.max(prevFrame, currentFrame)

        for (const item of currentItems) {
          const start = item.from
          const end = item.from + item.durationInFrames
          // Check if we crossed this item's start or end
          if ((start > minFrame && start <= maxFrame) || (end > minFrame && end <= maxFrame)) {
            // Crossed a clip boundary - update frozen frame
            frozenFrameRef.current = currentFrame
            setForceUpdate((n) => n + 1)
            break
          }
        }
      }

      prevFrame = currentFrame
    })
    const unsubscribeBridge = usePreviewBridgeStore.subscribe((bridgeState, prevBridgeState) => {
      const playbackState = usePlaybackStore.getState()
      if (playbackState.isPlaying) return
      updatePausedFrame(
        playbackState,
        playbackState,
        bridgeState.displayedFrame,
        prevBridgeState.displayedFrame,
      )
    })

    return () => {
      unsubscribePlayback()
      unsubscribeBridge()
    }
  })

  // Reads items on-demand from stores

  // Force update state to trigger re-render and useMemo recalculation when frame changes while paused/skimming
  let frameUpdateKey = $state.raw(0)
  const setForceUpdate = (next: typeof frameUpdateKey | ((prev: typeof frameUpdateKey) => typeof frameUpdateKey)) => {
    frameUpdateKey = typeof next === 'function' ? (next as (prev: typeof frameUpdateKey) => typeof frameUpdateKey)(untrack(() => frameUpdateKey)) : next
  }

  // Gizmo store
  const setCanvasSize = useGizmoStore.getState().setCanvasSize
  const setCanvasScale = useGizmoStore.getState().setCanvasScale
  const setSnappingEnabled = useGizmoStore.getState().setSnappingEnabled
  const setOtherItemBounds = useGizmoStore.getState().setOtherItemBounds
  const exclusiveCanvasEditor = useExclusiveCanvasEditor()
  const {
    cornerPin: isCornerPinEditing,
    mask: isMaskEditing,
    powerWindow: isPowerWindowEditing,
    spatialEffect: isSpatialEffectEditing,
    active: isExclusiveCanvasEditorActive,
  } = $derived(exclusiveCanvasEditor)
  const startTranslate = useGizmoStore.getState().startTranslate
  const updateInteraction = useGizmoStore.getState().updateInteraction
  const endInteraction = useGizmoStore.getState().endInteraction
  const clearInteraction = useGizmoStore.getState().clearInteraction
  const cancelInteraction = useGizmoStore.getState().cancelInteraction
  const setTransformPreview = useGizmoStore.getState().setTransformPreview
  const replaceItemPreview = useGizmoStore.getState().replaceItemPreview
  let motionPathEditPreview = $state.raw<MotionPathEditPreview | null>(null)
  const setMotionPathEditPreview = (next: MotionPathEditPreview | null | ((prev: MotionPathEditPreview | null) => MotionPathEditPreview | null)) => {
    motionPathEditPreview = typeof next === 'function' ? (next as (prev: MotionPathEditPreview | null) => MotionPathEditPreview | null)(untrack(() => motionPathEditPreview)) : next
  }
  const cancelMotionPathInteractionRef: { current: (() => void) | null } = { current: null }

  $effect(() => untrack(() => () => {
      cancelMotionPathInteractionRef.current?.()
    }))

  // Update canvas size in gizmo store when project size changes
  $effect(() => {
    setCanvasSize(projectSize.width, projectSize.height)
  })

  $effect(() => {
    setSnappingEnabled(canvasSnapEnabled.current)
  })

  // Get visual items visible at current frame (excluding hidden tracks and locked tracks)
  // Sorted by track order: items on top tracks (lower order) come LAST for proper stacking/click priority
  // Uses frozenFrameRef to avoid re-renders during playback - only updates when paused
  const visibleItems = $derived.by(() => {
    void frameUpdateKey
    void isPlaying.current
    // Read the frozen frame (updated via effect when paused)
    const frame = frozenFrameRef.current

    // Create maps for track properties
    const trackVisible = new Map<string, boolean>()
    const trackLocked = new Map<string, boolean>()
    const trackOrder = new Map<string, number>()
    for (const track of tracks.current) {
      trackVisible.set(track.id, track.visible)
      trackLocked.set(track.id, track.locked)
      trackOrder.set(track.id, track.order)
    }

    // visualItems already excludes audio and adjustment (filtered in selector)
    return (
      visualItems
        .filter((item) => {
          // Check if item's track is visible
          if (!trackVisible.get(item.trackId)) return false
          // Check if item's track is locked (locked items can't be selected)
          if (trackLocked.get(item.trackId)) return false
          // Check if item is visible at current frame
          const itemEnd = item.from + item.durationInFrames
          return frame >= item.from && frame < itemEnd
        })
        // Sort by track order descending: higher order (bottom tracks) first, lower order (top tracks) last
        // This ensures top track items render last (on top) and get click priority (toSorted for immutability)
        .toSorted((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0))
    )
  })

  // Get selected items visible on the current preview frame.
  const selectedItems = $derived.by(() => {
    return visibleItems.filter((item) => selectedItemIdsSet.has(item.id))
  })
  const selectedVisibleItemIds = $derived.by(() => selectedItems.map((item) => item.id))
  const selectedItemKeyframes = selectDerived(useKeyframesStore, (s) => selectedVisibleItemIds.map((itemId) => s.keyframesByItemId[itemId] ?? null), shallow)
  const keyframesByItemId = select(useKeyframesStore, (s) => s.keyframesByItemId)
  const itemLabelById = $derived.by(() =>
      new Map(
        itemsSnapshot.map((item) => [
          item.id,
          item.label || item.type || 'the source layer',
        ]),
      ))
  const positionLinkByItemId = $derived.by(() => {
    const links = new Map<string, ReturnType<typeof getPositionLinkOwner>>()
    for (const item of visibleItems) {
      const link = getPositionLinkOwner(keyframesByItemId.current[item.id])
      if (link) links.set(item.id, link)
    }
    return links
  })
  const getPositionLinkFeedback = (itemId: string) => {
      const link = positionLinkByItemId.get(itemId)
      if (!link) return null
      const sourceLabel = itemLabelById.get(link.sourceItemId) ?? 'the source layer'
      return {
        label: `Position is linked to ${sourceLabel}. Select ${sourceLabel} in Layers to move it, or use Position's link control to unlink.`,
      }
    }
  const showPositionLinkFeedback = (itemId: string) => {
      const feedback = getPositionLinkFeedback(itemId)
      if (!feedback) return
      toast.warning(feedback.label, {
        id: `canvas-position-link-guidance-${itemId}`,
      })
    }

  // Associate keyframes with items by id rather than array position so
  // consumers stay correct if the selection ordering changes.
  const selectedItemKeyframesById = $derived.by(() => {
    const map = new Map<string, ItemKeyframes | null>()
    selectedVisibleItemIds.forEach((itemId, index) => {
      map.set(itemId, selectedItemKeyframes.current[index] ?? null)
    })
    return map
  })

  // Get unselected visible items (for click-to-select, use Set for O(1) lookups)
  const unselectedItems = $derived.by(() => {
    return visibleItems.filter((item) => !selectedItemIdsSet.has(item.id))
  })

  // Coordinate params for gizmo positioning
  const coordParams: CoordinateParams | null = $derived.by(() => {
    if (!containerRect) return null

    return {
      containerRect,
      playerSize,
      projectSize,
      zoom,
    }
  })

  // Publish the effective preview scale so snap thresholds (authored in
  // screen pixels) convert to the correct canvas-pixel distance at any zoom.
  $effect(() => {
    if (!coordParams) return
    setCanvasScale(getEffectiveScale(coordParams))
  })

  const canvasMediaDrop = useCanvasMediaDrop(() => ({
      coordParams,
      projectSize,
    }))
  const { dropState, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = $derived(canvasMediaDrop)

  const focusMotionPathFrame = (frame: number) => {
    const playback = usePlaybackStore.getState()
    if (playback.previewFrame !== null) playback.setPreviewFrame(null)
    if (playback.currentFrame !== frame) playback.setCurrentFrame(frame)
    usePreviewBridgeStore.getState().setDisplayedFrame(frame)
    frozenFrameRef.current = frame
    setForceUpdate((value) => value + 1)
  }

  const markMotionPathInteractionFinished = () => {
    justFinishedDragRef.current = true
    setTimeout(() => {
      justFinishedDragRef.current = false
    }, 100)
  }

  const handleMotionPathKeyframePointerDown = (itemId: string, point: MotionPathScreenPoint, event: PointerEvent & { currentTarget: SVGCircleElement }) => {
      if (event.button !== 0 || !coordParams || !point.keyframeId) return
      const editable = getEditablePositionKeyframe(itemId, point.keyframeId)
      if (!editable) return

      event.preventDefault()
      focusMotionPathFrame(point.frame)
      cancelMotionPathInteractionRef.current?.()

      const { keyframe } = editable
      const item = visualItems.find((candidate) => candidate.id === itemId)
      const itemKeyframes = keyframesByItemId.current[itemId]
      if (!item || !itemKeyframes) return
      const canvas = { width: projectSize.width, height: projectSize.height, fps: fps.current }
      const itemsById = new Map(visualItems.map((candidate) => [candidate.id, candidate]))
      const previousPreview: ItemPreview | undefined = useGizmoStore.getState().preview?.[itemId]
      let latestValue = keyframe.value
      let cleanup = () => {}
      let finished = false

      const previewAtPointer = (pointerEvent: PointerEvent) => {
        const canvasPoint = screenToCanvas(pointerEvent.clientX, pointerEvent.clientY, coordParams)
        latestValue = worldPointToPositionKeyframeValue({
          item,
          itemKeyframes,
          frame: point.frame,
          worldPoint: {
            x: canvasPoint.x - projectSize.width / 2,
            y: canvasPoint.y - projectSize.height / 2,
          },
          currentValue: keyframe.value,
          canvas,
          getItem: (candidateId) => itemsById.get(candidateId),
          getKeyframes: (candidateId) => keyframesByItemId.current[candidateId],
        })
        setMotionPathEditPreview({
          itemId,
          keyframeId: keyframe.id,
          frame: keyframe.frame,
          x: latestValue.x,
          y: latestValue.y,
          spatial: keyframe.spatial,
        })
        // The timeline stays untouched during the gesture, while the preview
        // renderer and transform gizmo still show the pending position.
        setTransformPreview({ [itemId]: latestValue })
      }

      const restoreLivePreview = () => {
        replaceItemPreview(itemId, previousPreview ?? null)
        setMotionPathEditPreview(null)
      }

      const cancel = () => {
        if (finished) return
        finished = true
        cleanup()
        cancelMotionPathInteractionRef.current = null
        restoreLivePreview()
      }

      cleanup = attachWindowMotionPathPointerInteraction({
        pointerId: event.pointerId,
        onMove: previewAtPointer,
        onCommit: (pointerEvent) => {
          if (finished) return
          finished = true
          previewAtPointer(pointerEvent)
          cancelMotionPathInteractionRef.current = null
          if (latestValue.x !== keyframe.value.x || latestValue.y !== keyframe.value.y) {
            updateVectorKeyframe(itemId, 'position', keyframe.id, { value: latestValue })
          }
          restoreLivePreview()
          markMotionPathInteractionFinished()
        },
        onCancel: cancel,
      })
      cancelMotionPathInteractionRef.current = cancel
    }

  const handleMotionPathTangentPointerDown = (
      itemId: string,
      point: MotionPathScreenPoint,
      handle: 'in' | 'out',
      event: PointerEvent & { currentTarget: SVGCircleElement },
    ) => {
      if (event.button !== 0 || !coordParams || !point.keyframeId) return
      const editable = getEditablePositionKeyframe(itemId, point.keyframeId)
      if (!editable?.keyframe.spatial) return

      event.preventDefault()
      focusMotionPathFrame(point.frame)
      cancelMotionPathInteractionRef.current?.()

      const { keyframe } = editable
      const item = visualItems.find((candidate) => candidate.id === itemId)
      const itemKeyframes = keyframesByItemId.current[itemId]
      if (!item || !itemKeyframes) return
      const canvas = { width: projectSize.width, height: projectSize.height, fps: fps.current }
      const itemsById = new Map(visualItems.map((candidate) => [candidate.id, candidate]))
      let latestSpatial = keyframe.spatial
      let cleanup = () => {}
      let finished = false

      const previewAtPointer = (pointerEvent: PointerEvent) => {
        const canvasPoint = screenToCanvas(pointerEvent.clientX, pointerEvent.clientY, coordParams)
        const endpoint = worldPointToPositionKeyframeValue({
          item,
          itemKeyframes,
          frame: point.frame,
          worldPoint: {
            x: canvasPoint.x - projectSize.width / 2,
            y: canvasPoint.y - projectSize.height / 2,
          },
          currentValue: keyframe.value,
          canvas,
          getItem: (candidateId) => itemsById.get(candidateId),
          getKeyframes: (candidateId) => keyframesByItemId.current[candidateId],
        })
        latestSpatial = updateSpatialTangent(keyframe.spatial!, handle, {
          x: endpoint.x - keyframe.value.x,
          y: endpoint.y - keyframe.value.y,
        })
        setMotionPathEditPreview({
          itemId,
          keyframeId: keyframe.id,
          frame: keyframe.frame,
          x: keyframe.value.x,
          y: keyframe.value.y,
          spatial: latestSpatial,
        })
      }

      const cancel = () => {
        if (finished) return
        finished = true
        cleanup()
        cancelMotionPathInteractionRef.current = null
        setMotionPathEditPreview(null)
      }

      cleanup = attachWindowMotionPathPointerInteraction({
        pointerId: event.pointerId,
        onMove: previewAtPointer,
        onCommit: (pointerEvent) => {
          if (finished) return
          finished = true
          previewAtPointer(pointerEvent)
          cancelMotionPathInteractionRef.current = null
          updateVectorKeyframe(itemId, 'position', keyframe.id, { spatial: latestSpatial })
          setMotionPathEditPreview(null)
          markMotionPathInteractionFinished()
        },
        onCancel: cancel,
      })
      cancelMotionPathInteractionRef.current = cancel
    }

  const handleCreateSpatialTangents = (itemId: string, point: MotionPathScreenPoint) => {
      if (!point.keyframeId) return
      const editable = getEditablePositionKeyframe(itemId, point.keyframeId)
      if (!editable || editable.keyframe.spatial) return
      const spatial = buildDefaultSpatialTangents(editable.position.keyframes, point.keyframeId)
      if (!spatial) return
      focusMotionPathFrame(point.frame)
      updateVectorKeyframe(itemId, 'position', point.keyframeId, { spatial })
    }

  // Motion paths describe the whole clip and are independent of the current
  // preview frame, but `selectedItems` gets a fresh array identity on every
  // paused/skimming frame. Derive a stable signature from only the fields
  // `buildMotionPathPoints` actually reads (id, from, durationInFrames,
  // transform, motionModifiers) so the expensive rebuild runs only when those
  // change. The items themselves are read via ref to avoid the identity churn.
  const motionPathSignature = $derived.by(() =>
      selectedItems
        .map(
          (item) =>
            `${item.id}:${item.from}:${item.durationInFrames}:${JSON.stringify(
              item.transform ?? null,
            )}:${JSON.stringify(item.transformParent ?? null)}:${JSON.stringify(
              item.motionModifiers ?? null,
            )}:${JSON.stringify(item.motionLayers ?? null)}`,
        )
        .join('|'))
  const selectedItemsRef = { current: selectedItems }
  $effect.pre(() => {
    selectedItemsRef.current = selectedItems
  })

  const motionPaths = $derived.by(() => {
    void motionPathSignature
    if (
      !coordParams ||
      isCornerPinEditing ||
      isMaskEditing ||
      isPowerWindowEditing ||
      isSpatialEffectEditing
    )
      return []
    const canvas = { width: projectSize.width, height: projectSize.height, fps: fps.current }
    const itemsById = new Map(visualItems.map((item) => [item.id, item]))
    return selectedItemsRef.current.flatMap((item) => {
      const directEdit = motionPathEditPreview?.itemId === item.id ? motionPathEditPreview : null
      const points = buildMotionPathPoints({
        item,
        itemKeyframes: selectedItemKeyframesById.get(item.id) ?? undefined,
        canvas,
        getItem: (itemId) => itemsById.get(itemId),
        getKeyframes: (itemId) => keyframesByItemId.current[itemId],
        preview: directEdit
          ? {
              frame: directEdit.frame,
              x: directEdit.x,
              y: directEdit.y,
              keyframeId: directEdit.keyframeId,
              spatial: directEdit.spatial,
            }
          : undefined,
      })
      if (points.length === 0) return []
      return [
        {
          itemId: item.id,
          points: points.map((point) => canvasPointToMotionPathScreenPoint(point, coordParams)),
        },
      ]
    })
    // `selectedItemsRef` is intentionally read via ref; `motionPathSignature`
    // captures the item fields that affect the result so the rebuild still
    // reruns when the selection's motion data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  // Get visual transforms for all visible items (base + keyframes + preview).
  const visualTransformsMap = useVisualTransforms(() => visibleItems, () => projectSize, () => itemsWithLiveTransforms, () => frozenFrameRef.current)

  // Create marquee items with pre-computed bounding rects for collision detection
  // Rects are calculated once when items/coords change, not on every mouse move
  const marqueeItems = $derived.by(() => {
    if (!coordParams || !containerRect) return []
    return visibleItems.map((item) => {
      // Get pre-computed visual transform from the hook
      const resolved = visualTransformsMap.current.get(item.id)
      if (!resolved)
        return {
          id: item.id,
          getBoundingRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        }

      const screenBounds = transformToScreenBounds(
        {
          x: resolved.x,
          y: resolved.y,
          width: resolved.width,
          height: resolved.height,
          rotation: resolved.rotation,
          opacity: resolved.opacity,
          cornerRadius: resolved.cornerRadius,
        },
        coordParams,
      )
      const rect: Rect = {
        left: containerRect.left + screenBounds.left,
        top: containerRect.top + screenBounds.top,
        right: containerRect.left + screenBounds.left + screenBounds.width,
        bottom: containerRect.top + screenBounds.top + screenBounds.height,
        width: screenBounds.width,
        height: screenBounds.height,
      }
      return {
        id: item.id,
        getBoundingRect: () => rect,
      }
    })
  })

  // Marquee selection hook
  // Use the full preview background as both the hit area and the coordinate
  // space so drag-started-outside-the-player positions don't get clipped to a
  // smaller overlay, which previously produced a phantom marquee pinned to the
  // overlay's edge.

  const marqueeSelection = useMarqueeSelection(() => ({
    container: hitArea ?? overlayRef.current,
    items: marqueeItems,
    enabled: !isExclusiveCanvasEditorActive,
    onSelectionChange: (ids: string[]) => {
        selectItems.current(ids)
      },
    onPreviewSelectionChange: updateMarqueeCandidatePreview,
    onGestureEnd: clearMarqueeCandidatePreview,
    commitSelectionOnMouseUp: true,
    threshold: 5,
  }))
  const { marquee } = $derived(marqueeSelection)

  $effect(() => {
    if (!isExclusiveCanvasEditorActive) return
    cancelInteraction()
    setOtherItemBounds([])
    setContextMenu(null)
    document.body.style.cursor = ''
  })

  const handleTransformStart = () => {
    const playback = usePlaybackStore.getState()
    if (playback.previewFrame !== null) {
      if (playback.currentFrame !== playback.previewFrame) {
        playback.setCurrentFrame(playback.previewFrame)
      }
      playback.setPreviewFrame(null)
    }

    // Collect AABBs of non-selected visible items so snap can align to them.
    // Snapshot at drag start — other items don't move during the drag.
    const bounds: BoundingBox[] = []
    for (const item of unselectedItems) {
      const resolved = visualTransformsMap.current.get(item.id)
      if (!resolved) continue
      const strokeExpansion =
        item.type === 'shape' && typeof item.strokeWidth === 'number' ? item.strokeWidth : 0
      bounds.push(
        computeItemAabb(
          {
            x: resolved.x,
            y: resolved.y,
            width: resolved.width,
            height: resolved.height,
            rotation: resolved.rotation,
            opacity: resolved.opacity,
          },
          projectSize.width,
          projectSize.height,
          strokeExpansion,
        ),
      )
    }
    setOtherItemBounds(bounds)
  }

  // Handle transform end - commit the transform to the timeline with auto-keyframing
  const handleTransformEnd = (
      itemId: string,
      transform: Transform,
      operation: 'move' | 'resize' | 'rotate' | 'anchor' = 'move',
    ) => {
      const currentFrame = usePlaybackStore.getState().currentFrame
      const item = visualItems.find((i) => i.id === itemId)
      if (!item) return
      const itemsById = new Map(visualItems.map((candidate) => [candidate.id, candidate]))
      const editableTransform = resolveEditableGizmoTransform({
        item,
        visualTransform: toResolvedTransform(transform),
        parentVisualTransform: resolveGizmoCommitParentWorld({
          item,
          canvas: { width: projectSize.width, height: projectSize.height, fps: fps.current },
          frame: currentFrame,
          getItem: (candidateId) => itemsById.get(candidateId),
          getKeyframes: (candidateId) => keyframesByItemId.current[candidateId],
        }),
        relativeFrame: currentFrame - item.from,
        fps: fps.current,
        frameWidth: projectSize.width,
        frameHeight: projectSize.height,
      })
      const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[itemId]
      const commit = buildGizmoTransformCommit({
        item,
        itemKeyframes,
        transform: editableTransform,
        baseTransform: resolveTransform(
          item,
          { width: projectSize.width, height: projectSize.height, fps: fps.current },
          getSourceDimensions(item),
        ),
        currentFrame,
      })
      const anchorCommit =
        operation === 'anchor'
          ? buildGizmoAnchorCommit({
              item,
              itemKeyframes,
              transform: editableTransform,
              currentFrame,
            })
          : null
      const transformProps = anchorCommit
        ? anchorCommit.transformProps
        : commit.shouldUpdateBase
          ? commit.transformProps
          : {}
      updateItemTransform(itemId, transformProps, {
        operation: operation === 'anchor' ? 'transform' : operation,
        autoKeyframeOperations: anchorCommit?.autoOps ?? commit.autoOps,
      })

      // Prevent background click from deselecting after drag
      justFinishedDragRef.current = true
      setTimeout(() => {
        justFinishedDragRef.current = false
      }, 100)
      setOtherItemBounds([])
      // Sync the resolved frame the gizmo/overlay reads to the current (paused)
      // frame. Otherwise a stale `displayedFrame` (left over from skimming) keeps
      // resolving the transform at the wrong frame, so the gizmo/motion-path sit
      // at a different point on the path than the rendered shape until the next
      // scrub. Then force a recompute of the selection.
      if (!usePlaybackStore.getState().isPlaying) {
        usePreviewBridgeStore.getState().setDisplayedFrame(usePlaybackStore.getState().currentFrame)
      }
      setForceUpdate((n) => n + 1)
    }

  const handleCropEnd = (itemId: string, edge: CropEdge, ratio: number) => {
      const item = visualItems.find((candidate) => candidate.id === itemId)
      if (!item || (item.type !== 'video' && item.type !== 'composition')) return

      const currentFrame = usePlaybackStore.getState().currentFrame
      const sourceDimensions = getSourceDimensions(item) ?? {
        width: Math.max(1, item.transform?.width ?? projectSize.width),
        height: Math.max(1, item.transform?.height ?? projectSize.height),
      }
      const sourceDimension =
        edge === 'left' || edge === 'right' ? sourceDimensions.width : sourceDimensions.height
      const sourcePixels = Math.round(ratio * sourceDimension)
      const operation = getAutoKeyframeOperation(
        item,
        useKeyframesStore.getState().keyframesByItemId[itemId],
        CROP_EDGE_PROPERTY[edge],
        sourcePixels,
        currentFrame,
      )

      if (operation) {
        applyAutoKeyframeOperations([operation])
      } else {
        updateItem(itemId, {
          crop: normalizeCropSettings({ ...item.crop, [edge]: sourcePixels / sourceDimension }),
        })
      }

      justFinishedDragRef.current = true
      setTimeout(() => {
        justFinishedDragRef.current = false
      }, 100)
      setOtherItemBounds([])
      if (!usePlaybackStore.getState().isPlaying) {
        usePreviewBridgeStore.getState().setDisplayedFrame(usePlaybackStore.getState().currentFrame)
      }
      setForceUpdate((value) => value + 1)
    }

  // Handle group transform end - commit transforms for all items as a single undo operation
  const handleGroupTransformEnd = (
      transforms: Map<string, Transform>,
      operation: 'move' | 'resize' | 'rotate',
      textUpdates?: ReadonlyMap<string, GroupScaledTextProperties>,
    ) => {
      const currentFrame = usePlaybackStore.getState().currentFrame
      // Convert Transform to TransformProperties for the batch update
      const transformsMap = new Map<string, Partial<TransformProperties>>()
      const autoKeyframeOperations: AutoKeyframeOperation[] = []
      const itemUpdates = new Map<string, Partial<TimelineItem>>()
      const itemsById = new Map(visualItems.map((candidate) => [candidate.id, candidate]))
      for (const [itemId, transform] of transforms) {
        const item = visualItems.find((candidate) => candidate.id === itemId)
        if (!item) continue
        const parentId = item.transformParent?.parentItemId
        const parentTransform = parentId ? transforms.get(parentId) : undefined
        const parentWorld = parentTransform
          ? toResolvedTransform(parentTransform)
          : resolveGizmoCommitParentWorld({
              item,
              canvas: { width: projectSize.width, height: projectSize.height, fps: fps.current },
              frame: currentFrame,
              getItem: (candidateId) => itemsById.get(candidateId),
              getKeyframes: (candidateId) => keyframesByItemId.current[candidateId],
            })
        const editableTransform = resolveEditableGizmoTransform({
          item,
          visualTransform: toResolvedTransform(transform),
          parentVisualTransform: parentWorld,
          relativeFrame: currentFrame - item.from,
          fps: fps.current,
          frameWidth: projectSize.width,
          frameHeight: projectSize.height,
        })
        const commit = buildGizmoTransformCommit({
          item,
          itemKeyframes: useKeyframesStore.getState().keyframesByItemId[itemId],
          transform: editableTransform,
          baseTransform: resolveTransform(
            item,
            { width: projectSize.width, height: projectSize.height, fps: fps.current },
            getSourceDimensions(item),
          ),
          currentFrame,
        })
        autoKeyframeOperations.push(...commit.autoOps)
        if (commit.shouldUpdateBase) transformsMap.set(itemId, commit.transformProps)

        const textUpdate = textUpdates?.get(itemId)
        if (item.type === 'text' && textUpdate) {
          const hasFrameScopedScale = commit.autoOps.some(
            (autoOperation) =>
              autoOperation.property === 'scale' ||
              autoOperation.property === 'width' ||
              autoOperation.property === 'height',
          )
          const textCommit = buildGroupTextScaleCommit(
            item,
            useKeyframesStore.getState().keyframesByItemId[itemId],
            textUpdate,
            currentFrame,
            hasFrameScopedScale,
          )
          autoKeyframeOperations.push(...textCommit.autoKeyframeOperations)
          if (Object.keys(textCommit.itemUpdates).length > 0) {
            itemUpdates.set(itemId, textCommit.itemUpdates)
          }
        }
      }
      // Use batch update for single undo operation
      updateItemsTransformMap(transformsMap, {
        operation,
        autoKeyframeOperations,
        itemUpdates,
      })

      // Prevent background click from deselecting after drag
      // Use setTimeout instead of requestAnimationFrame because click events
      // may fire after the next animation frame
      justFinishedDragRef.current = true
      setTimeout(() => {
        justFinishedDragRef.current = false
      }, 100)
      setOtherItemBounds([])
    }

  // Handle click on overlay background to deselect
  const handleBackgroundClick = (e: MouseEvent) => {
      if (isExclusiveCanvasEditorActive) return
      // Don't deselect if we just finished a drag or marquee operation
      if (justFinishedDragRef.current || isMarqueeJustFinished()) {
        return
      }
      // Don't clear if clicking on gizmo elements
      const target = e.target as HTMLElement
      if (target.closest('[data-gizmo]')) return

      // Stop propagation so video-preview doesn't also clear
      e.stopPropagation()
      useSelectionStore.getState().clearItemSelection()
    }

  // Handle clicking an item to select it
  // For unselected items: select that item (or add to selection with shift)
  // For selected items in a group: select just that item (break group selection)
  const handleItemClick = (itemId: string, e: MouseEvent) => {
      if (isExclusiveCanvasEditorActive) return
      e.stopPropagation()
      // A crop handle moves away from the pointer as it is dragged inward.
      // Suppress the click synthesized after mouseup so it cannot select a
      // different item that is now underneath the pointer.
      if (justFinishedDragRef.current) return
      const isSelected = selectedItemIdsSet.has(itemId)
      const isGroupSelection = selectedItemIds.current.length > 1

      if (e.shiftKey) {
        // Shift+click: toggle in selection
        if (isSelected) {
          selectItems.current(selectedItemIds.current.filter((id) => id !== itemId))
        } else {
          selectItems.current([...selectedItemIds.current, itemId])
        }
      } else if (isSelected && isGroupSelection) {
        // Clicking on a selected item in a group: select just that item
        selectItems.current([itemId])
      } else if (!isSelected) {
        // Clicking on an unselected item: select it
        selectItems.current([itemId])
      }
      // If single selected item is clicked again, do nothing (keeps selection)
    }

  // Helper to find all items at a canvas point (for context menu)
  const findAllItemsAtPoint = (canvasPoint: Point): TimelineItem[] => {
      const canvasCenterX = projectSize.width / 2
      const canvasCenterY = projectSize.height / 2
      const result: TimelineItem[] = []

      for (const item of visibleItems) {
        // Get visual transform from the pre-computed map
        const resolved = visualTransformsMap.current.get(item.id)
        if (!resolved) continue

        // Convert transform position to absolute canvas coordinates
        const itemCenterX = canvasCenterX + resolved.x
        const itemCenterY = canvasCenterY + resolved.y

        // AABB check
        const left = itemCenterX - resolved.width / 2
        const right = itemCenterX + resolved.width / 2
        const top = itemCenterY - resolved.height / 2
        const bottom = itemCenterY + resolved.height / 2

        if (
          canvasPoint.x >= left &&
          canvasPoint.x <= right &&
          canvasPoint.y >= top &&
          canvasPoint.y <= bottom
        ) {
          result.push(item)
        }
      }

      return result
    }

  // Handle right-click to show context menu for overlapping items
  const handleContextMenu = (e: MouseEvent) => {
      if (!coordParams || isExclusiveCanvasEditorActive) return

      e.preventDefault()
      e.stopPropagation()

      const canvasPoint = screenToCanvas(e.clientX, e.clientY, coordParams)
      const itemsAtPoint = findAllItemsAtPoint(canvasPoint)

      // Only show menu if there are multiple overlapping items
      if (itemsAtPoint.length > 1) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: itemsAtPoint,
        })
      } else if (itemsAtPoint.length === 1) {
        // Single item: just select it
        selectItems.current([itemsAtPoint[0]!.id])
      }
    }

  // Handle selecting an item from context menu
  const handleContextMenuSelect = (itemId: string) => {
      selectItems.current([itemId])
      setContextMenu(null)
    }

  // Close context menu when clicking elsewhere
  $effect(() => {
    if (!contextMenu) return

    const handleClickOutside = () => setContextMenu(null)
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('contextmenu', handleClickOutside)

    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('contextmenu', handleClickOutside)
    }
  })

  // Handle drag start from SelectableItem - select and start dragging in one motion
  const handleItemDragStart = (itemId: string, e: MouseEvent, transform: Transform) => {
      if (!coordParams || isExclusiveCanvasEditorActive) return

      const startTransformSnapshot = { ...transform }
      const point = screenToCanvas(e.clientX, e.clientY, coordParams)

      const itemType = visibleItems.find((item) => item.id === itemId)?.type
      const interactionId = startTranslate(itemId, point, transform, undefined, itemType)
      document.body.style.cursor = 'move'

      attachWindowTransformInteraction({
        toCanvasPoint: (moveEvent) =>
          screenToCanvas(moveEvent.clientX, moveEvent.clientY, coordParams),
        updateInteraction,
        startTransform: startTransformSnapshot,
        endInteraction,
        onTransformEnd: (finalTransform, operation) => {
          handleTransformEnd(itemId, finalTransform, operation)
        },
        operation: 'move',
        afterFinish: () => {
          clearInteraction(interactionId)
        },
      })
    }
</script>

{#if coordParams}
  <div
    bind:this={overlayRef.current}
    class="absolute z-40"
    style:top="{-overlayPadding}px"
    style:left="{-overlayPadding}px"
    style:width="{playerSize.width + overlayPadding * 2}px"
    style:height="{playerSize.height + overlayPadding * 2}px"
    style:pointer-events="none"
    ondblclick={(e) => e.stopPropagation()}
  >
    <!-- Marquee selection rectangle — portaled into the preview background so it renders in the same coordinate space the marquee hook tracks. Hidden during corner pin / mask editing. -->
    {#if !isExclusiveCanvasEditorActive && marqueePortalTarget}
      <Portal to={marqueePortalTarget}>
        <MarqueeOverlay {marquee} />
      </Portal>
    {/if}
    <!-- Player area - receives clicks for deselection and contains gizmos -->
    <!-- Disabled while any exclusive editor owns canvas input. -->
    <div
      class="absolute"
      style:top="{overlayPadding}px"
      style:left="{overlayPadding}px"
      style:width="{playerSize.width}px"
      style:height="{playerSize.height}px"
      style:pointer-events={isExclusiveCanvasEditorActive ? 'none' : 'auto'}
      onclick={handleBackgroundClick}
      oncontextmenu={handleContextMenu}
      ondragenter={isExclusiveCanvasEditorActive ? undefined : handleDragEnter}
      ondragover={isExclusiveCanvasEditorActive ? undefined : handleDragOver}
      ondragleave={isExclusiveCanvasEditorActive ? undefined : handleDragLeave}
      ondrop={isExclusiveCanvasEditorActive ? undefined : handleDrop}
    >
      {#if !isExclusiveCanvasEditorActive && dropState}
        <div
          class={`absolute inset-0 pointer-events-none z-20 flex items-center justify-center border-2 border-dashed ${
            dropState.allowed
              ? 'border-primary/70 bg-primary/10'
              : 'border-destructive/60 bg-destructive/10'
          }`}
        >
          <div
            class="rounded-lg border border-border/70 bg-background/90 px-4 py-3 text-center shadow-lg backdrop-blur-sm"
          >
            <p
              class={`text-sm font-semibold ${dropState.allowed ? 'text-primary' : 'text-destructive'}`}
            >
              {dropState.title}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {dropState.description}
            </p>
          </div>
        </div>
      {/if}
      <!-- Hide the motion path during playback — it clutters the frame and the moving object already conveys the motion. -->
      {#if !isPlaying.current && !isPowerWindowEditing && !isSpatialEffectEditing}
        <MotionPathOverlay
          paths={motionPaths}
          width={playerSize.width}
          height={playerSize.height}
          activeFrame={frozenFrameRef.current}
          onKeyframePointerDown={handleMotionPathKeyframePointerDown}
          onTangentPointerDown={handleMotionPathTangentPointerDown}
          onCreateSpatialTangents={handleCreateSpatialTangents}
         />
      {/if}
      <!-- Candidate membership changes imperatively during marquee drag. This keeps the committed selection and gizmo stable while avoiding a selection-dependent React render for every item intersection. -->
      {#if !isExclusiveCanvasEditorActive}
        {#each visibleItems as item (`marquee-candidate-${item.id}`)}
          {@const resolved = visualTransformsMap.current.get(item.id)}
          {#if resolved}
          {@const transform: Transform = {
              x: resolved.x,
              y: resolved.y,
              width: resolved.width,
              height: resolved.height,
              anchorX: resolved.anchorX,
              anchorY: resolved.anchorY,
              rotation: resolved.rotation,
              opacity: resolved.opacity,
              cornerRadius: resolved.cornerRadius,
            }}
          {@const bounds = transformToScreenBounds(transform, coordParams)}
          <div
            {@attach (node: HTMLDivElement) => {
              bindMarqueeCandidateElement(item.id, node)
              return () => bindMarqueeCandidateElement(item.id, null)
            }}
            data-marquee-candidate-item-id={item.id}
            class="pointer-events-none absolute z-[6] hidden rounded-sm border-2 border-dashed border-white/65 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] data-[marquee-candidate=true]:block"
            style:left="{bounds.left}px"
            style:top="{bounds.top}px"
            style:width="{bounds.width}px"
            style:height="{bounds.height}px"
            style:transform={`rotate(${transform.rotation}deg)`}
            style:transform-origin={getScreenTransformOrigin(transform, coordParams)}
          ></div>
          {/if}
        {/each}
      {/if}
      <!-- Clickable areas for UNSELECTED visible items -->
      <!-- Selected items are handled by their respective gizmos (TransformGizmo or GroupGizmo) -->
      {#if !isExclusiveCanvasEditorActive}
        {#each unselectedItems as item (item.id)}
          {@const resolved = visualTransformsMap.current.get(item.id)}
          {@const positionLinkFeedback = getPositionLinkFeedback(item.id)}
          {#if resolved}
          <SelectableItem
            item={item}
            transform={{
              x: resolved.x,
              y: resolved.y,
              width: resolved.width,
              height: resolved.height,
              anchorX: resolved.anchorX,
              anchorY: resolved.anchorY,
              rotation: resolved.rotation,
              opacity: resolved.opacity,
              cornerRadius: resolved.cornerRadius,
            }}
            coordParams={coordParams}
            onSelect={(e) => handleItemClick(item.id, e)}
            onDragStart={(e, transform) => handleItemDragStart(item.id, e, transform)}
            translateBlocked={!!positionLinkFeedback}
            translateBlockedLabel={positionLinkFeedback?.label}
            onTranslateBlocked={() => showPositionLinkFeedback(item.id)}
          />
          {/if}
        {/each}
      {/if}
      <!-- Transform gizmo(s) for selected items - hidden while another canvas editor is active -->
      {#if isExclusiveCanvasEditorActive || isPlaying.current}
        <!-- hidden -->
      {:else if selectedItems.length === 1 && selectedItems[0]}
        <TransformGizmo
          item={selectedItems[0]}
          coordParams={coordParams}
          onTransformStart={handleTransformStart}
          onTransformEnd={(transform, operation) =>
            handleTransformEnd(selectedItems[0]!.id, transform, operation)}
          onCropEnd={(edge, ratio) => handleCropEnd(selectedItems[0]!.id, edge, ratio)}
          isPlaying={isPlaying.current}
          translateBlocked={positionLinkByItemId.has(selectedItems[0].id)}
          translateBlockedLabel={getPositionLinkFeedback(selectedItems[0].id)?.label}
          onTranslateBlocked={() => showPositionLinkFeedback(selectedItems[0]!.id)}
         />
      {:else if selectedItems.length > 1}
        <GroupGizmo
          items={selectedItems}
          coordParams={coordParams}
          onTransformStart={handleTransformStart}
          onTransformEnd={handleGroupTransformEnd}
          onItemClick={(itemId) => selectItems.current([itemId])}
          isPlaying={isPlaying.current}
          translateBlocked={selectedItems.some((item) => positionLinkByItemId.has(item.id))}
          translateBlockedLabel={getPositionLinkFeedback(
            selectedItems.find((item) => positionLinkByItemId.has(item.id))?.id ?? '',
          )?.label}
          onTranslateBlocked={() => {
            const blockedItem = selectedItems.find((item) => positionLinkByItemId.has(item.id))
            if (blockedItem) showPositionLinkFeedback(blockedItem.id)
          }}
         />
      {/if}
      <!-- Snap guides shown during drag -->
      {#if !isExclusiveCanvasEditorActive}
        <LiveSnapGuides coordParams={coordParams} />
      {/if}
    </div>
    <!-- Context menu for selecting from overlapping items - rendered via portal to ensure it's above all other elements -->
    {#if !isExclusiveCanvasEditorActive && contextMenu}
      <Portal to={contextMenuPortalTarget}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="fixed z-[9999] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style:left="{contextMenu.x}px"
          style:top="{contextMenu.y}px"
          onclick={(e) => e.stopPropagation()}
        >
          <div class="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
            Select Layer
          </div>
          {#each contextMenu.items as item, index (item.id)}
            {@const track = tracks.current.find((t) => t.id === item.trackId)}
            {@const trackName = track?.name ?? `Track ${index + 1}`}
            {@const itemName = item.label || `${item.type} clip`}
            <button
              class="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              onclick={() => handleContextMenuSelect(item.id)}
            >
              <span class="text-muted-foreground text-xs">{trackName}:</span><span class="truncate"
                >{itemName}</span
              >
            </button>
          {/each}
        </div>
      </Portal>
    {/if}
  </div>
{/if}
