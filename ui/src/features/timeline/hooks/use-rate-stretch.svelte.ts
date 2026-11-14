// SPDX-License-Identifier: MIT
// oxlint-disable react/immutability, react/refs -- React Compiler rules: these $state writes and ref reads run in handlers and $effects, not a render

import { select } from '$lib/store.svelte'
import type { TimelineItem } from '@/types/timeline'
import { useEditorStore } from '@/shared/state/editor'
import { commitPreviewFrameToCurrentFrame } from '@/shared/state/playback'
import type { SnapTarget } from '@/features/timeline/types/drag'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { rateStretchItem } from '@/features/timeline/stores/timeline-actions'
import { useSelectionStore } from '@/shared/state/selection'
import { pixelsToTimeNow } from '@/features/timeline/utils/zoom-conversions'
import { useSnapCalculator } from './use-snap-calculator.svelte'
import { setActiveSnapTargetIfChanged } from '@/features/timeline/utils/snap-target-state'
import { findNearestSnapTarget } from '@/features/timeline/utils/timeline-snap-utils'
import {
  MIN_SPEED,
  MAX_SPEED,
  calculateSpeed,
  clampSpeed,
  sourceToTimelineFrames,
  timelineToSourceFrames,
} from '@/features/timeline/utils/source-calculations'
import { useLinkedEditPreviewStore } from '@/features/timeline/stores/linked-edit-preview-store'
import {
  expandItemIdsWithAttachedCaptions,
  getSynchronizedLinkedItems,
  getLinkedItemIds,
} from '@/features/timeline/utils/linked-items'
import {
  applyRateStretchPreview,
  applyMovePreview,
} from '@/features/timeline/utils/item-edit-preview'
import type { PreviewItemUpdate } from '@/features/timeline/utils/item-edit-preview'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { createRafCoalescedCallback } from '@/features/timeline/utils/raf-coalesced-callback'

type StretchHandle = 'start' | 'end'

// For GIFs/images that loop, use generous duration limits (1 frame to ~10 minutes at 30fps)
const LOOPING_MEDIA_MAX_DURATION = 30 * 60 * 10 // 10 minutes at 30fps

export function isRateStretchableItem(item: Pick<TimelineItem, 'type' | 'label'>): boolean {
  const isGifImage = item.type === 'image' && item.label?.toLowerCase().endsWith('.gif')
  return item.type === 'video' || item.type === 'audio' || item.type === 'composition' || isGifImage
}

export function getLoopingMediaStretchPreviewSpeed(
  initialSpeed: number,
  deltaFrames: number,
): number {
  const speedDelta = -(deltaFrames / 30) * 0.1
  return Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, initialSpeed + speedDelta)) * 100) / 100
}

/**
 * Compute preview updates for adjacent clips that will be rippled
 * when the rate stretch commits. Mirrors the ripple logic in rateStretchItem action.
 */
function computeRipplePreviewUpdates(
  items: TimelineItem[],
  synchronizedIds: Set<string>,
  oldFrom: number,
  oldEnd: number,
  previewFrom: number,
  previewEnd: number,
): PreviewItemUpdate[] {
  const fromDelta = previewFrom - oldFrom
  const endDelta = previewEnd - oldEnd
  if (fromDelta === 0 && endDelta === 0) return []

  const transitions = useTransitionsStore.getState().transitions
  const movedIds = new Set<string>()
  const updates: PreviewItemUpdate[] = []

  // Collect tracks touched by the stretched item + synchronized items
  const touchedTrackIds = new Set<string>()
  for (const i of items) {
    if (synchronizedIds.has(i.id)) touchedTrackIds.add(i.trackId)
  }

  const addMove = (itemId: string, delta: number) => {
    if (movedIds.has(itemId)) return
    const it = items.find((i) => i.id === itemId)
    if (!it) return
    movedIds.add(itemId)
    updates.push(applyMovePreview(it, delta))

    for (const linkedId of expandItemIdsWithAttachedCaptions(
      items,
      getLinkedItemIds(items, itemId),
    )) {
      if (linkedId === itemId || movedIds.has(linkedId)) continue
      const linked = items.find((i) => i.id === linkedId)
      if (linked) {
        movedIds.add(linkedId)
        updates.push(applyMovePreview(linked, delta))
      }
    }
  }

  if (endDelta !== 0) {
    for (const trackId of touchedTrackIds) {
      for (const i of items) {
        if (i.trackId === trackId && !synchronizedIds.has(i.id) && i.from >= oldEnd) {
          addMove(i.id, endDelta)
        }
      }
    }
    // Transition-connected neighbors at stretched clip's end
    for (const t of transitions) {
      if (synchronizedIds.has(t.leftClipId) && !synchronizedIds.has(t.rightClipId)) {
        addMove(t.rightClipId, endDelta)
      }
    }
  }

  if (fromDelta !== 0) {
    for (const trackId of touchedTrackIds) {
      for (const i of items) {
        if (i.trackId === trackId && !synchronizedIds.has(i.id)) {
          const iEnd = i.from + i.durationInFrames
          if (iEnd <= oldFrom) addMove(i.id, fromDelta)
        }
      }
    }
    // Transition-connected neighbors at stretched clip's start
    for (const t of transitions) {
      if (synchronizedIds.has(t.rightClipId) && !synchronizedIds.has(t.leftClipId)) {
        addMove(t.leftClipId, fromDelta)
      }
    }
  }

  return updates
}

interface StretchState {
  isStretching: boolean
  handle: StretchHandle | null
  startX: number
  initialFrom: number
  initialDuration: number
  sourceDuration: number // For GIFs: the natural animation duration (for speed reference)
  sourceFps: number
  initialSpeed: number
  currentDelta: number // Track current delta for visual feedback
  isLoopingMedia: boolean // GIFs and images can loop infinitely
  isConstrained: boolean
  constraintLabel: string | null
}

function getExactTimelineDurationForSource(
  sourceDuration: number,
  speed: number,
  sourceFps: number,
  timelineFps: number,
): number {
  if (speed <= 0 || sourceFps <= 0 || timelineFps <= 0) return 1
  const sourceSeconds = sourceDuration / sourceFps
  return (sourceSeconds * timelineFps) / speed
}

/**
 * Calculate duration limits based on speed constraints
 * For looping media (GIFs), duration is independent of source - just has speed limits
 */
export function getDurationLimits(
  sourceDuration: number,
  isLoopingMedia: boolean,
  sourceFps: number,
  timelineFps: number,
): { min: number; max: number } {
  if (isLoopingMedia) {
    // For GIFs: duration can be anything, speed is calculated from natural duration
    // min = natural duration at MAX_SPEED, max = very generous (user can extend freely)
    return {
      min: Math.max(1, Math.ceil(sourceDuration / MAX_SPEED)),
      max: LOOPING_MEDIA_MAX_DURATION,
    }
  }
  // For videos/audio: duration is constrained by source content
  // Min duration uses ceil to guarantee full source coverage at MAX_SPEED.
  // Floor would allow durations that necessarily drop source frames.
  const minDuration = Math.max(
    1,
    Math.ceil(getExactTimelineDurationForSource(sourceDuration, MAX_SPEED, sourceFps, timelineFps)),
  )
  // Max duration can use floor to stay within source bounds at MIN_SPEED.
  const maxDuration = Math.max(
    minDuration,
    sourceToTimelineFrames(sourceDuration, MIN_SPEED, sourceFps, timelineFps),
  )
  return {
    min: minDuration,
    max: maxDuration,
  }
}

/**
 * Calculate and clamp speed from source duration and timeline duration
 */
export function getClampedSpeed(
  sourceDuration: number,
  timelineDuration: number,
  sourceFps: number,
  timelineFps: number,
): number {
  return clampSpeed(calculateSpeed(sourceDuration, timelineDuration, sourceFps, timelineFps))
}

/**
 * Normalize duration/speed pair so playback stays within source bounds after frame rounding.
 * Keeps the stretched clip using its full source span (no accidental extra trim).
 */
export function resolveDurationAndSpeed(
  sourceDuration: number,
  proposedDuration: number,
  sourceFps: number,
  timelineFps: number,
): { duration: number; speed: number } {
  let duration = Math.max(1, Math.round(proposedDuration))
  let speed = getClampedSpeed(sourceDuration, duration, sourceFps, timelineFps)

  // A few iterations is enough to converge for rounding edge cases.
  for (let i = 0; i < 5; i++) {
    const sourceFramesNeeded = timelineToSourceFrames(duration, speed, timelineFps, sourceFps)
    if (sourceFramesNeeded > sourceDuration) {
      const boundedDuration = Math.max(
        1,
        sourceToTimelineFrames(sourceDuration, speed, sourceFps, timelineFps),
      )
      if (boundedDuration === duration) break
      duration = boundedDuration
      speed = getClampedSpeed(sourceDuration, duration, sourceFps, timelineFps)
      continue
    }

    if (sourceFramesNeeded < sourceDuration && Math.abs(speed - MAX_SPEED) < 1e-6) {
      // At max speed, increase duration until full source span can be represented.
      const minDurationAtCurrentSpeed = Math.max(
        1,
        Math.ceil(getExactTimelineDurationForSource(sourceDuration, speed, sourceFps, timelineFps)),
      )
      if (minDurationAtCurrentSpeed === duration) break
      duration = minDurationAtCurrentSpeed
      speed = getClampedSpeed(sourceDuration, duration, sourceFps, timelineFps)
      continue
    }

    break
  }

  return { duration, speed }
}

/**
 * Hook for handling timeline item rate stretching
 *
 * Rate stretch changes playback speed by adjusting duration while preserving all content.
 * - Longer duration = slower playback
 * - Shorter duration = faster playback
 * - Speed range: 0.1x to 10x
 *
 * Optimized approach:
 * - Visual feedback via local state during drag (no store updates)
 * - Only commit to store on mouseup (single undo entry)
 * - Snapping support for stretch edges to grid and item boundaries
 */
export function useRateStretch(
  getItem: () => TimelineItem,
  timelineDuration: () => number,
  trackLocked: () => boolean = () => false,
) {
  const pixelsToTime = pixelsToTimeNow
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const { setDragState, setActiveSnapTarget } = useSelectionStore.getState()

  // Get fresh item from store to ensure we have latest values after previous operations
  const getItemFromStore = () => {
    const item = getItem()
    return useItemsStore.getState().items.find((i) => i.id === item.id) ?? item
  }

  // Use snap calculator - pass item.id to exclude self from magnetic snaps
  // Only use magnetic snap targets (item edges), not grid lines
  const { getMagneticSnapTargets, getSnapThresholdFrames, isSnapEnabled } = useSnapCalculator(
    timelineDuration,
    () => getItem().id,
  )

  let stretchState = $state.raw<StretchState>({
    isStretching: false,
    handle: null,
    startX: 0,
    initialFrom: 0,
    initialDuration: 0,
    sourceDuration: 0,
    sourceFps: 30,
    initialSpeed: 1,
    currentDelta: 0,
    isLoopingMedia: false,
    isConstrained: false,
    constraintLabel: null,
  })

  const setStretchState = (next: StretchState | ((prev: StretchState) => StretchState)) => {
    stretchState = typeof next === 'function' ? next(stretchState) : next
  }
  const stretchStateRef = {
    get current() {
      return stretchState
    },
  }
  // Listeners follow the stretch flag only, not every preview update.
  const isStretching = $derived(stretchState.isStretching)

  // Track previous snap target to avoid unnecessary store updates
  const prevSnapTargetRef = { current: null } as { current: { frame: number; type: string } | null }
  const magneticSnapTargetsRef = { current: [] } as { current: SnapTarget[] }

  /**
   * Find nearest snap target for a given frame position
   */
  const findSnapForFrame = (
    targetFrame: number,
  ): { snappedFrame: number; snapTarget: SnapTarget | null } => {
    const magneticSnapTargets = magneticSnapTargetsRef.current
    if (!isSnapEnabled() || magneticSnapTargets.length === 0) {
      return { snappedFrame: targetFrame, snapTarget: null }
    }

    const nearestTarget = findNearestSnapTarget(
      targetFrame,
      magneticSnapTargets,
      getSnapThresholdFrames(),
    )

    if (nearestTarget) {
      return { snappedFrame: nearestTarget.frame, snapTarget: nearestTarget }
    }

    return { snappedFrame: targetFrame, snapTarget: null }
  }

  // Mouse move handler - only updates local state for visual feedback
  // Handlers read fps, trackLocked, etc. at call time, so changes don't re-register listeners
  const onMouseMove = (e: MouseEvent) => {
    if (!stretchStateRef.current.isStretching || trackLocked()) return
    const item = getItem()

    const deltaX = e.clientX - stretchStateRef.current.startX
    const deltaTime = pixelsToTime(deltaX)
    let deltaFrames = Math.round(deltaTime * fps.current)

    const {
      handle,
      initialFrom,
      initialDuration,
      sourceDuration,
      sourceFps,
      initialSpeed,
      isLoopingMedia,
    } = stretchStateRef.current

    // For looping media (GIFs): don't change duration, only track delta for speed calculation.
    // Directional rate stretch keeps body drags consistent: left = faster, right = slower.
    if (isLoopingMedia) {
      const speedDelta = -(deltaFrames / 30) * 0.1
      const unconstrainedSpeed = initialSpeed + speedDelta
      const previewSpeed = getLoopingMediaStretchPreviewSpeed(initialSpeed, deltaFrames)
      const isConstrained = Math.abs(previewSpeed - unconstrainedSpeed) > 0.0001
      // Update local state for speed calculation (duration stays same)
      if (
        deltaFrames !== stretchStateRef.current.currentDelta ||
        isConstrained !== stretchStateRef.current.isConstrained
      ) {
        setStretchState((prev) => ({
          ...prev,
          currentDelta: deltaFrames,
          isConstrained,
          constraintLabel: isConstrained ? 'speed limit' : null,
        }))
      }
      const linkedSelectionEnabled = useEditorStore.getState().linkedSelectionEnabled
      const linkedPreviewUpdates = linkedSelectionEnabled
        ? getSynchronizedLinkedItems(useItemsStore.getState().items, item.id)
            .filter((linkedItem) => linkedItem.id !== item.id)
            .map((linkedItem) =>
              applyRateStretchPreview(
                linkedItem,
                initialFrom,
                initialDuration,
                previewSpeed,
                fps.current,
              ),
            )
        : []
      useLinkedEditPreviewStore.getState().setUpdates(linkedPreviewUpdates)
      // No snap target visualization for GIFs since clip doesn't move
      return
    }

    // For videos/audio: original behavior - change duration
    const limits = getDurationLimits(sourceDuration, isLoopingMedia, sourceFps, fps.current)

    // Calculate the target edge position and apply snapping
    let targetEdgeFrame: number
    if (handle === 'start') {
      // For start handle, we're moving the start position (compressing from left)
      // newDuration = initialDuration - deltaFrames
      // newFrom = initialFrom + (initialDuration - newDuration)
      // The edge that moves is the new start position: initialFrom + deltaFrames (when delta > 0, edge moves right)
      targetEdgeFrame = initialFrom + deltaFrames
    } else {
      // For end handle, we're moving the end position
      // newDuration = initialDuration + deltaFrames
      // The edge that moves is the end: initialFrom + initialDuration + deltaFrames
      targetEdgeFrame = initialFrom + initialDuration + deltaFrames
    }

    // Find snap target for the edge being stretched
    const { snappedFrame, snapTarget } = findSnapForFrame(targetEdgeFrame)

    // If snapped, adjust deltaFrames accordingly while respecting speed limits
    if (snapTarget) {
      if (handle === 'start') {
        // snappedFrame = initialFrom + newDelta
        const newDelta = snappedFrame - initialFrom
        // Check if the resulting duration is within limits
        const proposedDuration = initialDuration - newDelta
        if (proposedDuration >= limits.min && proposedDuration <= limits.max) {
          deltaFrames = newDelta
        }
      } else {
        // snappedFrame = initialFrom + initialDuration + newDelta
        const newDelta = snappedFrame - (initialFrom + initialDuration)
        // Check if the resulting duration is within limits
        const proposedDuration = initialDuration + newDelta
        if (proposedDuration >= limits.min && proposedDuration <= limits.max) {
          deltaFrames = newDelta
        }
      }
    }

    const proposedDuration =
      handle === 'start' ? initialDuration - deltaFrames : initialDuration + deltaFrames
    const isConstrained = proposedDuration < limits.min || proposedDuration > limits.max

    // Update local state for visual feedback
    if (
      deltaFrames !== stretchStateRef.current.currentDelta ||
      isConstrained !== stretchStateRef.current.isConstrained
    ) {
      setStretchState((prev) => ({
        ...prev,
        currentDelta: deltaFrames,
        isConstrained,
        constraintLabel: isConstrained ? 'speed limit' : null,
      }))
    }

    let previewDuration = Math.round(
      Math.max(
        limits.min,
        Math.min(
          limits.max,
          handle === 'start' ? initialDuration - deltaFrames : initialDuration + deltaFrames,
        ),
      ),
    )
    let previewFrom =
      handle === 'start'
        ? Math.round(initialFrom + (initialDuration - previewDuration))
        : Math.round(initialFrom)
    const resolvedPreview = resolveDurationAndSpeed(
      sourceDuration,
      previewDuration,
      sourceFps,
      fps.current,
    )
    previewDuration = resolvedPreview.duration
    const previewSpeed = resolvedPreview.speed
    if (handle === 'start') {
      previewFrom = Math.round(initialFrom + (initialDuration - previewDuration))
    }

    const allItems = useItemsStore.getState().items
    const linkedSelectionEnabled = useEditorStore.getState().linkedSelectionEnabled
    const synchronizedItems = linkedSelectionEnabled
      ? getSynchronizedLinkedItems(allItems, item.id)
      : [item]
    const synchronizedIds = new Set(synchronizedItems.map((si) => si.id))

    // Include the stretched item's own preview so the transition bridge can track it
    const stretchedItemPreview: PreviewItemUpdate = {
      id: item.id,
      from: previewFrom,
      durationInFrames: previewDuration,
      speed: previewSpeed,
    }

    const linkedPreviewUpdates = linkedSelectionEnabled
      ? synchronizedItems
          .filter((linkedItem) => linkedItem.id !== item.id)
          .map((linkedItem) =>
            applyRateStretchPreview(
              linkedItem,
              linkedItem.from + (previewFrom - initialFrom),
              previewDuration,
              previewSpeed,
              fps.current,
            ),
          )
      : []

    // Compute ripple preview for adjacent clips that will be pushed/pulled
    const oldEnd = initialFrom + initialDuration
    const previewEnd = previewFrom + previewDuration
    const rippleUpdates = computeRipplePreviewUpdates(
      allItems,
      synchronizedIds,
      initialFrom,
      oldEnd,
      previewFrom,
      previewEnd,
    )

    useLinkedEditPreviewStore
      .getState()
      .setUpdates([stretchedItemPreview, ...linkedPreviewUpdates, ...rippleUpdates])

    setActiveSnapTargetIfChanged({
      previousRef: prevSnapTargetRef,
      snapTarget,
      setActiveSnapTarget,
    })
  }

  // Mouse up handler - commits changes to store (single update)
  const onMouseUp = () => {
    if (stretchStateRef.current.isStretching) {
      const item = getItem()
      const {
        handle,
        initialFrom,
        initialDuration,
        sourceDuration,
        sourceFps,
        initialSpeed,
        currentDelta,
        isLoopingMedia,
      } = stretchStateRef.current

      let newDuration: number
      let newFrom: number
      let newSpeed: number

      // For looping media (GIFs): only change speed, keep duration the same.
      // Directional rate stretch keeps body drags consistent: left = faster, right = slower.
      if (isLoopingMedia) {
        newDuration = initialDuration // Duration stays the same
        newFrom = initialFrom // Position stays the same

        // Calculate speed change based on drag distance.
        // Use a sensitivity factor: ~30 pixels per 0.1x speed change.
        newSpeed = getLoopingMediaStretchPreviewSpeed(initialSpeed, currentDelta)

        // Only update if speed actually changed
        if (Math.abs(newSpeed - initialSpeed) > 0.01) {
          rateStretchItem(item.id, newFrom, newDuration, newSpeed)
        }
      } else {
        // For videos/audio: original behavior - change duration and calculate speed
        const limits = getDurationLimits(sourceDuration, isLoopingMedia, sourceFps, fps.current)

        if (handle === 'start') {
          // Start handle: delta right = compress (shorter duration), delta left = extend
          newDuration = Math.round(
            Math.max(limits.min, Math.min(limits.max, initialDuration - currentDelta)),
          )
          const durationChange = initialDuration - newDuration
          newFrom = Math.round(initialFrom + durationChange) // Maintain end position
        } else {
          // End handle: delta right = extend (longer duration), delta left = compress
          newDuration = Math.round(
            Math.max(limits.min, Math.min(limits.max, initialDuration + currentDelta)),
          )
          newFrom = Math.round(initialFrom)
        }

        const resolved = resolveDurationAndSpeed(
          sourceDuration,
          newDuration,
          sourceFps,
          fps.current,
        )
        newDuration = resolved.duration
        newSpeed = resolved.speed
        if (handle === 'start') {
          const adjustedDurationChange = initialDuration - newDuration
          newFrom = Math.round(initialFrom + adjustedDurationChange)
        }

        // Only update store if there was actual change (compare rounded values)
        if (newDuration !== initialDuration) {
          rateStretchItem(item.id, newFrom, newDuration, newSpeed)
        }
      }

      // Clear drag state (including snap indicator)
      setActiveSnapTarget(null)
      setDragState(null)
      useLinkedEditPreviewStore.getState().clear()
      prevSnapTargetRef.current = null
      magneticSnapTargetsRef.current = []

      setStretchState({
        isStretching: false,
        handle: null,
        startX: 0,
        initialFrom: 0,
        initialDuration: 0,
        sourceDuration: 0,
        sourceFps: 30,
        initialSpeed: 1,
        currentDelta: 0,
        isLoopingMedia: false,
        isConstrained: false,
        constraintLabel: null,
      })
    }
  }

  // Setup and cleanup mouse event listeners
  $effect(() => {
    if (isStretching) {
      // Coalesce the pointer stream to one preview/store update per painted frame.
      const coalescedMouseMove = createRafCoalescedCallback(onMouseMove)
      const queueMouseMove = (event: MouseEvent) => coalescedMouseMove.queue(event)
      const handleCoalescedMouseUp = () => {
        coalescedMouseMove.flush()
        onMouseUp()
      }

      window.addEventListener('mousemove', queueMouseMove)
      window.addEventListener('mouseup', handleCoalescedMouseUp)

      return () => {
        coalescedMouseMove.cancel()
        window.removeEventListener('mousemove', queueMouseMove)
        window.removeEventListener('mouseup', handleCoalescedMouseUp)
        useLinkedEditPreviewStore.getState().clear()
        magneticSnapTargetsRef.current = []
      }
    }
  })

  // Start stretch drag
  const handleStretchStart = (e: MouseEvent, handle: StretchHandle) => {
    // Only respond to left mouse button
    if (e.button !== 0) return
    if (trackLocked()) return
    const item = getItem()

    // Get fresh item from store to ensure we have latest values after previous operations
    const currentItem = getItemFromStore()

    // Only works on source-bounded items and GIFs.
    if (!isRateStretchableItem(currentItem)) return

    e.stopPropagation()
    e.preventDefault()
    commitPreviewFrameToCurrentFrame()

    setDragState({
      isDragging: true,
      draggedItemIds: [item.id],
      offset: { x: 0, y: 0 },
    })
    setActiveSnapTarget(null)

    const currentSpeed = currentItem.speed || 1
    const isLoopingMedia = currentItem.type === 'image' // GIFs (images) can loop infinitely
    magneticSnapTargetsRef.current = isLoopingMedia ? [] : getMagneticSnapTargets()

    // Use the actual available source frames for this clip
    // IMPORTANT: For split clips, use sourceEnd - sourceStart to limit rate stretch
    // to the clip's actual portion rather than the entire remaining source.
    // This makes rate stretching "per clip" - each split clip starts at speed 1 relative
    // to its own source boundaries.
    let sourceDuration: number
    const sourceFps = currentItem.sourceFps ?? fps.current
    const sourceStart = currentItem.sourceStart ?? 0
    if (currentItem.sourceEnd !== undefined) {
      // For clips with explicit source end (including legacy split clips
      // that may be missing sourceStart), use only the clip's source span.
      sourceDuration = Math.max(1, currentItem.sourceEnd - sourceStart)
    } else if (currentItem.sourceDuration) {
      // For clips without explicit end, use remaining source from current position
      sourceDuration = currentItem.sourceDuration - sourceStart
    } else {
      // Last resort: estimate from current state
      sourceDuration = timelineToSourceFrames(
        currentItem.durationInFrames,
        currentSpeed,
        fps.current,
        sourceFps,
      )
    }

    setStretchState({
      isStretching: true,
      handle,
      startX: e.clientX,
      initialFrom: currentItem.from,
      initialDuration: currentItem.durationInFrames,
      sourceDuration,
      sourceFps,
      initialSpeed: currentSpeed,
      currentDelta: 0,
      isLoopingMedia,
      isConstrained: false,
      constraintLabel: null,
    })
  }

  // Calculate visual feedback during stretch
  const getVisualFeedback = () => {
    if (!stretchState.isStretching) return null

    const {
      handle,
      initialFrom,
      initialDuration,
      sourceDuration,
      sourceFps,
      initialSpeed,
      currentDelta,
      isLoopingMedia,
    } = stretchState

    // For looping media (GIFs): duration and position stay the same, only speed changes
    if (isLoopingMedia) {
      const previewSpeed = getLoopingMediaStretchPreviewSpeed(initialSpeed, currentDelta)

      return {
        from: initialFrom,
        duration: initialDuration,
        speed: previewSpeed,
      }
    }

    // For videos/audio: original behavior
    const limits = getDurationLimits(sourceDuration, isLoopingMedia, sourceFps, fps.current)

    let newDuration: number
    let newFrom: number

    if (handle === 'start') {
      newDuration = Math.round(
        Math.max(limits.min, Math.min(limits.max, initialDuration - currentDelta)),
      )
      const durationChange = initialDuration - newDuration
      newFrom = Math.round(initialFrom + durationChange)
    } else {
      newDuration = Math.round(
        Math.max(limits.min, Math.min(limits.max, initialDuration + currentDelta)),
      )
      newFrom = Math.round(initialFrom)
    }

    const resolved = resolveDurationAndSpeed(sourceDuration, newDuration, sourceFps, fps.current)
    newDuration = resolved.duration
    const previewSpeed = resolved.speed
    if (handle === 'start') {
      const adjustedDurationChange = initialDuration - newDuration
      newFrom = Math.round(initialFrom + adjustedDurationChange)
    }

    return {
      from: newFrom,
      duration: newDuration,
      speed: previewSpeed,
    }
  }

  return {
    get isStretching() {
      return isStretching
    },
    get stretchHandle() {
      return stretchState.handle
    },
    get stretchDelta() {
      return stretchState.currentDelta
    },
    get stretchConstrained() {
      return stretchState.isConstrained
    },
    get stretchConstraintLabel() {
      return stretchState.constraintLabel
    },
    handleStretchStart,
    getVisualFeedback,
  }
}
