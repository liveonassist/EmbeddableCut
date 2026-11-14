// SPDX-License-Identifier: MIT

import { toast } from 'svelte-sonner'
import type { TFunction } from 'i18next'
import { i18n } from '$lib/i18n.svelte'
import { usePlaybackStore } from '@/shared/state/playback'
import type { CanvasSettings, TransformParentingBehavior } from '@/types/transform'
import {
  setTransformParents,
  useItemsStore,
  useKeyframesStore,
} from '@/features/editor/deps/timeline-motion'
import {
  useMotionPickWhipDrag,
  type MotionPickWhipModifiers,
  type MotionPickWhipPresentation,
  type MotionPickWhipTarget,
} from '@/shared/hooks/use-pick-whip-drag.svelte'
import {
  getTransformParentRejection,
  getTransformParentRejectionMessage,
} from './transform-parent-validation'

interface ParentOrigin {
  childItemId: string
}

interface ParentCandidate {
  parentItemId: string
}

export interface TransformParentDragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  sourceItemId: string | null
  clipBounds: {
    left: number
    top: number
    right: number
    bottom: number
  }
  presentation: MotionPickWhipPresentation
}

function evaluateParentTarget(
  clientX: number,
  clientY: number,
  origin: ParentOrigin,
  t: TFunction,
): MotionPickWhipTarget<ParentCandidate> {
  const element = document.elementFromPoint(clientX, clientY)
  const row = element?.closest<HTMLElement>('[data-motion-layer-item-id]')
  const parentItemId = row?.dataset.motionLayerItemId
  if (!row || !parentItemId) return null

  const rejection = getTransformParentRejection({
    childItemId: origin.childItemId,
    parentItemId,
    itemById: useItemsStore.getState().itemById,
    keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
  })
  if (rejection) {
    return {
      status: 'invalid',
      row,
      message: getTransformParentRejectionMessage(t, rejection),
    }
  }
  return { status: 'valid', row, value: { parentItemId } }
}

function getParentingBehavior(
  modifiers: Pick<MotionPickWhipModifiers, 'shiftKey' | 'altKey'>,
): TransformParentingBehavior {
  if (modifiers.shiftKey) return 'snap-to-parent'
  if (modifiers.altKey) return 'restore-local'
  return 'preserve-world'
}

/**
 * Parenting a layer by dragging its pick-whip onto another layer row. Read
 * `drag` off the returned object (don't destructure it) so it stays reactive.
 */
export function useTransformParentPickWhip(canvas: () => CanvasSettings) {
  const t = i18n.t.bind(i18n) as TFunction
  const applyParent = (
    childItemId: string,
    parentItemId: string | undefined,
    behavior: TransformParentingBehavior,
  ) => {
    const playback = usePlaybackStore.getState()
    setTransformParents({
      childItemIds: [childItemId],
      parentItemId,
      behavior,
      frame: playback.previewFrame ?? playback.currentFrame,
      canvas: canvas(),
    })
  }
  const pickWhip = useMotionPickWhipDrag<ParentOrigin, ParentCandidate>(() => ({
    hoverAttribute: 'data-transform-parent-link-hover',
    rejectionHoverAttribute: 'data-transform-parent-link-rejected',
    resolveTarget: (clientX, clientY, origin) => evaluateParentTarget(clientX, clientY, origin, t),
    onCommit: (origin, candidate, modifiers) => {
      applyParent(origin.childItemId, candidate.parentItemId, getParentingBehavior(modifiers))
    },
    onReject: (_origin, message) => {
      toast.error(message)
    },
  }))

  const begin = (
    event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement },
    childItemId: string,
    currentParentItemId: string | undefined,
  ) => {
    if (event.button !== 0) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      if (currentParentItemId) {
        applyParent(childItemId, undefined, event.altKey ? 'restore-local' : 'preserve-world')
      }
      return
    }
    pickWhip.begin(event, { childItemId })
  }

  return {
    get drag(): TransformParentDragState | null {
      const genericDrag = pickWhip.drag
      return genericDrag
        ? {
            startX: genericDrag.startX,
            startY: genericDrag.startY,
            currentX: genericDrag.currentX,
            currentY: genericDrag.currentY,
            sourceItemId: genericDrag.candidate?.value.parentItemId ?? null,
            clipBounds: genericDrag.clipBounds,
            presentation: genericDrag.presentation,
          }
        : null
    },
    begin,
  }
}
