// SPDX-License-Identifier: MIT

/**
 * Text-motion band editing for the keyframe graph panel: the clip-local motion
 * bands shown by the dopesheet and the drag/commit handlers that resize or
 * shift them. The drag snapshot is owned here — it is only ever used by these
 * handlers.
 */

import { getTextMotionTimelineBands } from '@/shared/timeline/text-motion-timeline'
import { useEditorStore } from '@/shared/state/editor'
import {
  beginTextMotionEdit,
  commitTextMotionEdit,
  updateTextMotionLive,
} from '@/features/timeline/stores/actions/text-motion-actions'
import type { TimelineSnapshot } from '@/features/timeline/stores/commands/types'
import type { TextMotionSlot } from '@/types/text-motion'
import type { TimelineItem } from '@/types/timeline'
import type { KeyframeEditorSurface } from './keyframe-graph-panel-model'

interface KeyframeGraphTextMotionParams {
  selectedItemForEditor: TimelineItem | null
  surface: KeyframeEditorSurface
}

export function useKeyframeGraphTextMotion(params: () => KeyframeGraphTextMotionParams) {
  const selectedItemForEditor = $derived(params().selectedItemForEditor)
  const surface = $derived(params().surface)
  let textMotionDragSnapshot: TimelineSnapshot | null = null

  const editTextMotionBands = $derived.by(() => {
    return surface === 'edit' && selectedItemForEditor
      ? getTextMotionTimelineBands(selectedItemForEditor).map((band) => ({
          ...band,
          fromFrame: band.fromFrame - selectedItemForEditor.from,
          toFrame: band.toFrame - selectedItemForEditor.from,
          clipFromFrame: band.clipFromFrame - selectedItemForEditor.from,
          clipToFrame: band.clipToFrame - selectedItemForEditor.from,
        }))
      : []
  })
  const handleTextMotionDurationDragStart = () => {
    textMotionDragSnapshot = beginTextMotionEdit()
  }
  const handleTextMotionDurationCommit = (slot: TextMotionSlot, durationFrames: number) => {
    if (!selectedItemForEditor) return
    const before = textMotionDragSnapshot ?? beginTextMotionEdit()
    updateTextMotionLive([selectedItemForEditor.id], slot, { durationFrames })
    commitTextMotionEdit(before, { slot, itemIds: [selectedItemForEditor.id] })
    textMotionDragSnapshot = null
  }
  const handleTextMotionDurationCancel = () => {
    textMotionDragSnapshot = null
  }
  const handleTextMotionOffsetDragStart = () => {
    textMotionDragSnapshot = beginTextMotionEdit()
  }
  const handleTextMotionOffsetCommit = (slot: TextMotionSlot, offsetFrames: number) => {
    if (!selectedItemForEditor || slot === 'loop') return
    const before = textMotionDragSnapshot ?? beginTextMotionEdit()
    updateTextMotionLive([selectedItemForEditor.id], slot, {
      offsetFrames: offsetFrames > 0 ? offsetFrames : undefined,
    })
    commitTextMotionEdit(before, { slot, itemIds: [selectedItemForEditor.id] })
    textMotionDragSnapshot = null
  }
  const handleTextMotionOffsetCancel = () => {
    textMotionDragSnapshot = null
  }
  const handleTextMotionBandClick = (_slot: TextMotionSlot) => {
    const editor = useEditorStore.getState()
    editor.setRightSidebarOpen(true)
    editor.setClipInspectorTab('motion')
  }

  return {
    get editTextMotionBands() {
      return editTextMotionBands
    },
    handleTextMotionDurationDragStart,
    handleTextMotionDurationCommit,
    handleTextMotionDurationCancel,
    handleTextMotionOffsetDragStart,
    handleTextMotionOffsetCommit,
    handleTextMotionOffsetCancel,
    handleTextMotionBandClick,
  }
}
