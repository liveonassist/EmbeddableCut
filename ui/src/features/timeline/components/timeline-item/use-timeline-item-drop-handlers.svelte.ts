// SPDX-License-Identifier: MIT

import { toast } from 'svelte-sonner'
import { i18n } from '@/i18n'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { getMediaDragData } from '@/features/timeline/deps/media-library-resolver'
import {
  TRANSITION_DRAG_MIME,
  useTransitionDragStore,
  type DraggedTransitionDescriptor,
} from '@/shared/state/transition-drag'
import { useSelectionStore } from '@/shared/state/selection'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { addTransition } from '@/features/timeline/stores/timeline-actions'
import type { TimelineActions } from '@/features/timeline/types'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { useEffectDropPreviewStore } from '@/features/timeline/stores/effect-drop-preview-store'
import {
  hasTrackDropGhostPreviews,
  useTrackDropPreviewStore,
} from '@/features/timeline/stores/track-drop-preview-store'
import { resolveTransitionTargetForEdge } from '@/features/timeline/utils/transition-targets'
import { resolveEffectiveTrackStates } from '@/features/timeline/utils/group-utils'
import {
  isDragPointInsideElement,
  resolveEffectDropTargetIds,
} from '@/features/timeline/utils/effect-drop'
import { getTemplateEffectsForDirectApplication } from '@/features/timeline/utils/generated-layer-items'

type AddEffects = TimelineActions['addEffects']
const CUT_DROP_LEFT_PLACEMENT_THRESHOLD = 1 / 3
const CUT_DROP_RIGHT_PLACEMENT_THRESHOLD = 2 / 3

interface UseTimelineItemDropHandlersParams {
  item: TimelineItemType
  trackLocked: boolean
  addEffects: AddEffects
}

function readDraggedTransitionDescriptor(event: DragEvent): DraggedTransitionDescriptor | null {
  const cached = useTransitionDragStore.getState().draggedTransition
  if (cached) {
    return cached
  }

  const raw = event.dataTransfer?.getData(TRANSITION_DRAG_MIME)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DraggedTransitionDescriptor>
    if (typeof parsed.presentation !== 'string') {
      return null
    }

    return {
      presentation: parsed.presentation,
      direction: parsed.direction,
    }
  } catch {
    return null
  }
}

function resolveTransitionDropAlignment(event: DragEvent): number {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.width <= 0) return 0.5

  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  if (ratio < CUT_DROP_LEFT_PLACEMENT_THRESHOLD) return 1
  if (ratio > CUT_DROP_RIGHT_PLACEMENT_THRESHOLD) return 0
  return 0.5
}

/** Every handler reads the params at call time, so it always sees the latest props. */
export function useTimelineItemDropHandlers(params: () => UseTimelineItemDropHandlersParams) {
  const handleTransitionCutDragOver = (edge: 'left' | 'right') => (e: DragEvent) => {
    const { item, trackLocked } = params()
    const dragDescriptor = readDraggedTransitionDescriptor(e)
    if (!dragDescriptor || trackLocked) {
      return
    }

    const dragState = useTransitionDragStore.getState()
    const alignment = resolveTransitionDropAlignment(e)
    const target = resolveTransitionTargetForEdge({
      itemId: item.id,
      edge,
      items: useItemsStore.getState().items,
      transitions: useTransitionsStore.getState().transitions,
      timelineFps: useTimelineSettingsStore.getState().fps,
      alignment,
      allowDurationClamp: false,
    })

    if (!target) {
      dragState.clearPreview()
      dragState.setInvalidHint({
        x: e.clientX,
        y: e.clientY,
        message: 'No adjacent clip on this edge',
      })
      return
    }

    if (target.hasExisting) {
      dragState.clearPreview()
      dragState.setInvalidHint({
        x: e.clientX,
        y: e.clientY,
        message: 'Drop on the existing transition bridge to replace it',
      })
      return
    }

    if (!target.canApply) {
      dragState.clearPreview()
      dragState.setInvalidHint({
        x: e.clientX,
        y: e.clientY,
        message: target.reason ?? 'This cut cannot accept a transition',
      })
      return
    }

    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    dragState.setInvalidHint(null)
    dragState.setPreview({
      leftClipId: target.leftClipId,
      rightClipId: target.rightClipId,
      durationInFrames: target.suggestedDurationInFrames,
      alignment: target.alignment,
    })
  }

  const handleTransitionCutDragLeave = () => {
    const itemId = params().item.id
    const dragState = useTransitionDragStore.getState()
    const preview = dragState.preview
    if (!preview || preview.existingTransitionId) {
      return
    }

    if (preview.leftClipId === itemId || preview.rightClipId === itemId) {
      dragState.clearPreview()
    }
    dragState.setInvalidHint(null)
  }

  const handleTransitionCutDrop = (edge: 'left' | 'right') => (e: DragEvent) => {
    const { item, trackLocked } = params()
    const dragDescriptor = readDraggedTransitionDescriptor(e)
    if (!dragDescriptor || trackLocked) {
      return
    }

    const target = resolveTransitionTargetForEdge({
      itemId: item.id,
      edge,
      items: useItemsStore.getState().items,
      transitions: useTransitionsStore.getState().transitions,
      timelineFps: useTimelineSettingsStore.getState().fps,
      alignment: resolveTransitionDropAlignment(e),
      allowDurationClamp: false,
    })

    if (!target || target.hasExisting || !target.canApply) {
      useTransitionDragStore.getState().clearDrag()
      return
    }

    e.preventDefault()
    e.stopPropagation()

    addTransition(
      target.leftClipId,
      target.rightClipId,
      'crossfade',
      target.suggestedDurationInFrames,
      dragDescriptor.presentation,
      dragDescriptor.direction,
      target.alignment,
    )
    useTransitionDragStore.getState().clearDrag()
  }

  const resolveDirectEffectDropTemplate = (payload: unknown) => {
    const { item, trackLocked } = params()
    const effects = getTemplateEffectsForDirectApplication(payload)
    if (!effects || trackLocked || item.type === 'audio') {
      return null
    }

    return effects
  }

  const resolveEffectDropTargets = (payload: unknown): string[] => {
    const effects = resolveDirectEffectDropTemplate(payload)
    if (!effects) {
      return []
    }

    const items = useItemsStore.getState().items
    const itemById = new Map(items.map((timelineItem) => [timelineItem.id, timelineItem]))
    const lockedTrackIds = new Set(
      resolveEffectiveTrackStates(useItemsStore.getState().tracks)
        .filter((track) => track.locked)
        .map((track) => track.id),
    )
    const selectedItemIds = useSelectionStore.getState().selectedItemIds

    return resolveEffectDropTargetIds({
      hoveredItemId: params().item.id,
      items,
      selectedItemIds,
    }).filter((itemId) => !lockedTrackIds.has(itemById.get(itemId)?.trackId ?? ''))
  }

  const setEffectDropPreview = (targetItemIds: string[]) => {
    if (targetItemIds.length === 0) {
      useEffectDropPreviewStore.getState().clearPreview()
      return
    }

    useEffectDropPreviewStore.getState().setPreview(targetItemIds, params().item.id)
  }

  const handleEffectDragEnter = (e: DragEvent) => {
    const targetItemIds = resolveEffectDropTargets(getMediaDragData())
    if (targetItemIds.length === 0) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    setEffectDropPreview(targetItemIds)
    useTrackDropPreviewStore.getState().clearGhostPreviews()
  }

  const handleEffectDragOver = (e: DragEvent) => {
    const targetItemIds = resolveEffectDropTargets(getMediaDragData())
    if (targetItemIds.length === 0) {
      useEffectDropPreviewStore.getState().clearPreview()
      return
    }

    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setEffectDropPreview(targetItemIds)
    useTrackDropPreviewStore.getState().clearGhostPreviews()
  }

  const handleEffectDragLeave = (e: DragEvent) => {
    if (isDragPointInsideElement(e, e.currentTarget as HTMLElement)) {
      return
    }

    if (useEffectDropPreviewStore.getState().hoveredItemId !== params().item.id) {
      return
    }

    useEffectDropPreviewStore.getState().clearPreview()
  }

  const handleEffectDrop = (e: DragEvent) => {
    const rawPayload = e.dataTransfer?.getData('application/json')
    let parsedPayload: unknown = getMediaDragData()

    if (rawPayload) {
      try {
        parsedPayload = JSON.parse(rawPayload)
      } catch {
        parsedPayload = getMediaDragData()
      }
    }

    const effects = resolveDirectEffectDropTemplate(parsedPayload)
    const targetItemIds = resolveEffectDropTargets(parsedPayload)
    useEffectDropPreviewStore.getState().clearPreview()

    if (effects && hasTrackDropGhostPreviews()) {
      return
    }

    if (!effects || targetItemIds.length === 0) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    useTrackDropPreviewStore.getState().clearGhostPreviews()
    params().addEffects(targetItemIds.map((itemId) => ({ itemId, effects })))
    if (targetItemIds.length > 1) {
      toast.success(
        i18n.t('timeline.itemActions.appliedEffectToClips', { count: targetItemIds.length }),
      )
    }
  }

  return {
    handleTransitionCutDragOver,
    handleTransitionCutDragLeave,
    handleTransitionCutDrop,
    handleEffectDragEnter,
    handleEffectDragOver,
    handleEffectDragLeave,
    handleEffectDrop,
  }
}
