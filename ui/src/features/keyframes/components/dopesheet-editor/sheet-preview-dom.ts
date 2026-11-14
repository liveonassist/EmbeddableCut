// SPDX-License-Identifier: MIT

/**
 * Dopesheet sheet preview DOM hook.
 * Owns the per-keyframe button refs and the imperative preview writes the sheet
 * needs: the marquee preview selection data attributes, and the drag preview
 * frames (flushSync + direct left/visibility writes so the preview lands before
 * paint). The editor injects its live selection, keyframe metadata, drag state
 * and geometry so the imperative paths keep the same ref identities they had
 * inline.
 */

import { flushSync } from 'svelte'
import type { Ref, SetState } from '../ref-state.svelte'
import { arePreviewFramesEqual } from './dopesheet-helpers'
import type { DragState, KeyframeMeta } from './dopesheet-types'

export interface UseSheetPreviewDomOptions {
  /** Selection currently owned by the editor, used to diff marquee previews. */
  committedKeyframeSelectionRef: Ref<Set<string>>
  keyframeMetaByIdRef: Ref<Map<string, KeyframeMeta>>
  dragStateRef: Ref<DragState | null>
  getRenderedKeyframeX: (frame: number) => number | null
  setSheetPreviewFrames: SetState<Record<string, number> | null>
  setSheetPreviewDuplicateKeyframeIds: SetState<string[] | null>
}

export interface UseSheetPreviewDomReturn {
  setKeyframeButtonRef: (keyframeId: string, node: HTMLButtonElement | null) => void
  handleMarqueeSelectionPreviewChange: (nextSelection: Set<string> | null) => void
  scheduleDragPreviewFrames: (nextPreviewFrames: Record<string, number> | null) => void
}

/** Duplicate-preview selection for the live drag, or null when it only moves keys. */
function resolveDuplicatePreviewIds(
  dragState: DragState | null,
  nextPreviewFrames: Record<string, number> | null,
): string[] | null {
  if (!dragState?.duplicateOnCommit || !nextPreviewFrames) return null
  return dragState.selectedKeyframeIds
}

/** Frame a keyframe button should show: its preview frame, else its committed frame. */
function resolvePreviewFrame(
  keyframeId: string,
  previewFrames: Record<string, number> | null,
  keyframeMetaById: Map<string, KeyframeMeta>,
): number | undefined {
  const previewFrame = previewFrames?.[keyframeId]
  return previewFrame ?? keyframeMetaById.get(keyframeId)?.keyframe.frame
}

/** Move or hide every keyframe button touched by a drag preview change. */
function writeDragPreviewPositions(
  keyframeButtonRefs: Map<string, HTMLButtonElement>,
  keyframeMetaById: Map<string, KeyframeMeta>,
  previousPreviewFrames: Record<string, number> | null,
  nextPreviewFrames: Record<string, number> | null,
  getRenderedKeyframeX: (frame: number) => number | null,
): void {
  const keyframeIds = new Set([
    ...Object.keys(previousPreviewFrames ?? {}),
    ...Object.keys(nextPreviewFrames ?? {}),
  ])

  for (const keyframeId of keyframeIds) {
    const button = keyframeButtonRefs.get(keyframeId)
    if (!button) continue

    const frame = resolvePreviewFrame(keyframeId, nextPreviewFrames, keyframeMetaById)
    if (frame === undefined) continue

    const renderedX = getRenderedKeyframeX(frame)
    if (renderedX === null) {
      button.style.visibility = 'hidden'
      continue
    }

    button.style.left = `${renderedX}px`
    button.style.visibility = 'visible'
  }
}

export function useSheetPreviewDom(
  options: () => UseSheetPreviewDomOptions,
): UseSheetPreviewDomReturn {
  const keyframeButtonRefs = new Map<string, HTMLButtonElement>()
  let marqueePreviewSelection: Set<string> | null = null
  let marqueePreviewTouchedIds = new Set<string>()
  let appliedDragPreviewFrames: Record<string, number> | null = null

  const setKeyframeButtonRef = (keyframeId: string, node: HTMLButtonElement | null) => {
    if (node) {
      keyframeButtonRefs.set(keyframeId, node)
      const previewSelection = marqueePreviewSelection
      if (previewSelection) {
        const previewSelected = previewSelection.has(keyframeId)
        if (previewSelected !== options().committedKeyframeSelectionRef.current.has(keyframeId)) {
          node.dataset.marqueeSelected = String(previewSelected)
          marqueePreviewTouchedIds.add(keyframeId)
        }
      }
    } else {
      keyframeButtonRefs.delete(keyframeId)
    }
  }

  const handleMarqueeSelectionPreviewChange = (nextSelection: Set<string> | null) => {
    const committedSelection = options().committedKeyframeSelectionRef.current
    const touchedIds = new Set(marqueePreviewTouchedIds)
    for (const keyframeId of committedSelection) touchedIds.add(keyframeId)
    if (nextSelection) {
      for (const keyframeId of nextSelection) touchedIds.add(keyframeId)
    }

    const nextTouchedIds = new Set<string>()
    for (const keyframeId of touchedIds) {
      const button = keyframeButtonRefs.get(keyframeId)
      if (!button) continue
      if (!nextSelection) {
        delete button.dataset.marqueeSelected
        continue
      }

      const previewSelected = nextSelection.has(keyframeId)
      const committedSelected = committedSelection.has(keyframeId)
      if (previewSelected === committedSelected) {
        delete button.dataset.marqueeSelected
      } else {
        button.dataset.marqueeSelected = String(previewSelected)
        nextTouchedIds.add(keyframeId)
      }
    }

    marqueePreviewSelection = nextSelection
    marqueePreviewTouchedIds = nextTouchedIds
  }

  const applyDragPreviewFrames = (nextPreviewFrames: Record<string, number> | null) => {
    const previousPreviewFrames = appliedDragPreviewFrames
    if (arePreviewFramesEqual(previousPreviewFrames, nextPreviewFrames)) {
      return
    }

    const {
      dragStateRef,
      keyframeMetaByIdRef,
      getRenderedKeyframeX,
      setSheetPreviewFrames,
      setSheetPreviewDuplicateKeyframeIds,
    } = options()
    const duplicatePreviewIds = resolveDuplicatePreviewIds(dragStateRef.current, nextPreviewFrames)

    setSheetPreviewFrames(nextPreviewFrames)
    setSheetPreviewDuplicateKeyframeIds(duplicatePreviewIds)
    flushSync()

    if (duplicatePreviewIds) {
      appliedDragPreviewFrames = nextPreviewFrames
      return
    }

    writeDragPreviewPositions(
      keyframeButtonRefs,
      keyframeMetaByIdRef.current,
      previousPreviewFrames,
      nextPreviewFrames,
      getRenderedKeyframeX,
    )

    appliedDragPreviewFrames = nextPreviewFrames
  }

  const scheduleDragPreviewFrames = (nextPreviewFrames: Record<string, number> | null) => {
    applyDragPreviewFrames(nextPreviewFrames)
  }

  return { setKeyframeButtonRef, handleMarqueeSelectionPreviewChange, scheduleDragPreviewFrames }
}
