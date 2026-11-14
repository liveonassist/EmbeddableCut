// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import { toast } from 'svelte-sonner'
import { usePlaybackStore } from '@/shared/state/playback'
import type { ItemKeyframes } from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { CanvasSettings } from '@/types/transform'
import { setTransformParents } from '@/features/editor/deps/timeline-motion'
import {
  getTransformParentRejection,
  getTransformParentRejectionMessage,
} from '../transform-parent-validation'
import { NO_TRANSFORM_PARENT } from '../motion-timeline-primitives'

interface TransformParentMenuSelection {
  value: string
  currentParentItemId: string | undefined
  childItemId: string
  itemById: Record<string, TimelineItem>
  keyframesByItemId: Record<string, ItemKeyframes>
  canvas: CanvasSettings
  t: TFunction
}

export function applyTransformParentMenuSelection({
  value,
  currentParentItemId,
  childItemId,
  itemById,
  keyframesByItemId,
  canvas,
  t,
}: TransformParentMenuSelection): void {
  const nextParentItemId = value === NO_TRANSFORM_PARENT ? undefined : value
  if (nextParentItemId === currentParentItemId) return
  const rejection = nextParentItemId
    ? getTransformParentRejection({
        childItemId,
        parentItemId: nextParentItemId,
        itemById,
        keyframesByItemId,
      })
    : null
  if (rejection) {
    toast.error(getTransformParentRejectionMessage(t, rejection))
    return
  }
  const playback = usePlaybackStore.getState()
  setTransformParents({
    childItemIds: [childItemId],
    parentItemId: nextParentItemId,
    frame: playback.previewFrame ?? playback.currentFrame,
    canvas,
  })
}

export function getLockToggleLabels(
  t: TFunction,
  isParentLayerGroupLocked: boolean,
  isLayerLocked: boolean,
): { label: string; title: string } {
  if (isParentLayerGroupLocked) {
    const label = t('editor.compose.lockedByLayerGroup')
    return { label, title: label }
  }
  const action = t(isLayerLocked ? 'editor.compose.unlockLayer' : 'editor.compose.lockLayer')
  return { label: action, title: `${action} — ${t('editor.compose.lockAllLayersHint')}` }
}

export function getParentCandidateLabel(candidate: TimelineItem, t: TFunction): string {
  if (candidate.type !== 'controller') return candidate.label || candidate.type
  return t('editor.transformHierarchy.controllerOption', {
    defaultValue: 'Null: {{name}}',
    name: candidate.label,
  })
}
