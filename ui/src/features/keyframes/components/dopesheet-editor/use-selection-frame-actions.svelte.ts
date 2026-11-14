// SPDX-License-Identifier: MIT

/**
 * Dopesheet selection frame actions hook.
 * Owns the selection-level frame mutators the sheet calls from the header
 * inputs, the timing strip and the graph: remove selected keyframes, build a
 * preview for a requested delta, commit or duplicate that preview, and the
 * preview+commit+undo-bracketed delta move. The action layer stays in
 * selection-frame-actions; this hook only injects the component's refs,
 * lock check and move callbacks.
 */

import type { AnimatableProperty, Keyframe, KeyframeRef } from '@/types/keyframe'
import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import type { KeyframeMeta } from './dopesheet-types'
import {
  buildSelectionFramePreview as buildSelectionFramePreviewState,
  commitSelectionFramePreview as commitSelectionFramePreviewState,
  duplicateSelectionFramePreview as duplicateSelectionFramePreviewState,
  type SelectionFramePreview,
} from './selection-frame-actions'
import type { Ref } from '../ref-state.svelte'

export interface UseSelectionFrameActionsOptions {
  /** Selected refs, already filtered by lock state and existing metadata. */
  selectedRefs: KeyframeRef[]
  selectedRefIds: string[]
  keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>>
  isPropertyLocked: (property: AnimatableProperty) => boolean
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  totalFrames: number
  transitionBlockedRanges: BlockedFrameRange[]
  itemId: string
  disabled: boolean
  onRemoveKeyframes?: (refs: KeyframeRef[]) => void
  onKeyframeMove?: (ref: KeyframeRef, newFrame: number, newValue: number) => void
  onKeyframesMove?: (
    entries: Array<{ ref: KeyframeRef; newFrame: number; newValue: number }>,
  ) => void
  onDuplicateKeyframes?: (
    entries: Array<{ ref: KeyframeRef; frame: number; value: number }>,
  ) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

export interface UseSelectionFrameActionsReturn {
  handleRemoveKeyframes: () => void
  buildSelectionFramePreview: (
    selectionIds: Iterable<string>,
    requestedDeltaFrames: number,
  ) => SelectionFramePreview
  commitSelectionFramePreview: (
    selectionIds: Iterable<string>,
    previewFrames: Record<string, number> | null,
  ) => boolean
  duplicateSelectionFramePreview: (
    selectionIds: Iterable<string>,
    previewFrames: Record<string, number> | null,
  ) => boolean
  moveSelectedKeyframesByDelta: (deltaFrames: number) => {
    didMove: boolean
    appliedDeltaFrames: number
  }
}

/** Every action reads the latest options when it runs, as handlers do. */
export function useSelectionFrameActions(
  options: () => UseSelectionFrameActionsOptions,
): UseSelectionFrameActionsReturn {
  const handleRemoveKeyframes = () => {
    const { onRemoveKeyframes, selectedRefs } = options()
    if (!onRemoveKeyframes || selectedRefs.length === 0) return
    onRemoveKeyframes(selectedRefs)
  }

  const buildSelectionFramePreview = (
    selectionIds: Iterable<string>,
    requestedDeltaFrames: number,
  ) => {
    const opts = options()
    return buildSelectionFramePreviewState({
      selectionIds,
      requestedDeltaFrames,
      keyframeMetaById: opts.keyframeMetaByIdRef.current,
      isPropertyLocked: opts.isPropertyLocked,
      keyframesByProperty: opts.keyframesByProperty,
      totalFrames: opts.totalFrames,
      transitionBlockedRanges: opts.transitionBlockedRanges,
    })
  }

  const commitSelectionFramePreview = (
    selectionIds: Iterable<string>,
    previewFrames: Record<string, number> | null,
  ) => {
    const opts = options()
    return commitSelectionFramePreviewState({
      selectionIds,
      previewFrames,
      keyframeMetaById: opts.keyframeMetaByIdRef.current,
      isPropertyLocked: opts.isPropertyLocked,
      itemId: opts.itemId,
      onKeyframeMove: opts.onKeyframeMove,
      onKeyframesMove: opts.onKeyframesMove,
    })
  }

  const duplicateSelectionFramePreview = (
    selectionIds: Iterable<string>,
    previewFrames: Record<string, number> | null,
  ) => {
    const opts = options()
    return duplicateSelectionFramePreviewState({
      selectionIds,
      previewFrames,
      keyframeMetaById: opts.keyframeMetaByIdRef.current,
      isPropertyLocked: opts.isPropertyLocked,
      itemId: opts.itemId,
      onDuplicateKeyframes: opts.onDuplicateKeyframes,
    })
  }

  const moveSelectedKeyframesByDelta = (deltaFrames: number) => {
    const { disabled, onKeyframeMove, selectedRefIds, onDragStart, onDragEnd } = options()
    if (disabled || !onKeyframeMove || selectedRefIds.length === 0 || deltaFrames === 0) {
      return { didMove: false, appliedDeltaFrames: 0 }
    }

    const preview = buildSelectionFramePreview(selectedRefIds, deltaFrames)
    if (!preview.previewFrames) {
      return { didMove: false, appliedDeltaFrames: 0 }
    }

    onDragStart?.()
    const didMove = commitSelectionFramePreview(preview.movableSelectionIds, preview.previewFrames)
    onDragEnd?.()

    return {
      didMove,
      appliedDeltaFrames: preview.appliedDeltaFrames,
    }
  }

  return {
    handleRemoveKeyframes,
    buildSelectionFramePreview,
    commitSelectionFramePreview,
    duplicateSelectionFramePreview,
    moveSelectedKeyframesByDelta,
  }
}
