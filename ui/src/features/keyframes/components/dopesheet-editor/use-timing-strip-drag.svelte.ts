// SPDX-License-Identifier: MIT

/**
 * Timing-strip drag hook.
 * Owns the preview-frames state surfaced to KeyframeTimingStrip + graph
 * preview, and the four timing-strip handlers (selection change, slide
 * start/change/end).
 */

type PreviewFrames = Record<string, number> | null

interface SelectionFramePreview {
  previewFrames: PreviewFrames
}

interface UseTimingStripDragOptions {
  disabled: boolean
  onKeyframeMove?: unknown
  onSelectionChange?: (keyframeIds: Set<string>) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  buildSelectionFramePreview: (
    selectionIds: Iterable<string>,
    requestedDeltaFrames: number,
  ) => SelectionFramePreview
  commitSelectionFramePreview: (
    selectionIds: Iterable<string>,
    previewFrames: PreviewFrames,
  ) => unknown
}

export interface UseTimingStripDragReturn {
  readonly timingStripPreviewFrames: PreviewFrames
  handleTimingStripSelectionChange: (selectedIds: Set<string>) => void
  handleTimingStripSlideStart: (selectedIds: string[]) => void
  handleTimingStripSlideChange: (deltaFrames: number, selectedIds: string[]) => void
  handleTimingStripSlideEnd: (selectedIds: string[]) => void
}

export function useTimingStripDrag(
  options: () => UseTimingStripDragOptions,
): UseTimingStripDragReturn {
  let timingStripPreviewFrames = $state.raw<PreviewFrames>(null)
  let timingStripDraggedIds: string[] = []

  const handleTimingStripSelectionChange = (selectedIds: Set<string>) => {
    options().onSelectionChange?.(selectedIds)
  }

  const handleTimingStripSlideStart = (selectedIds: string[]) => {
    const { disabled, onKeyframeMove, onDragStart } = options()
    if (disabled || !onKeyframeMove || selectedIds.length === 0) {
      return
    }

    timingStripDraggedIds = selectedIds
    onDragStart?.()
  }

  const handleTimingStripSlideChange = (deltaFrames: number, selectedIds: string[]) => {
    timingStripDraggedIds = selectedIds
    const preview = options().buildSelectionFramePreview(selectedIds, deltaFrames)
    timingStripPreviewFrames = preview.previewFrames
  }

  const handleTimingStripSlideEnd = (selectedIds: string[]) => {
    const { commitSelectionFramePreview, onDragEnd } = options()
    const dragIds = selectedIds.length > 0 ? selectedIds : timingStripDraggedIds
    commitSelectionFramePreview(dragIds, timingStripPreviewFrames)
    timingStripDraggedIds = []
    timingStripPreviewFrames = null
    onDragEnd?.()
  }

  return {
    get timingStripPreviewFrames() {
      return timingStripPreviewFrames
    },
    handleTimingStripSelectionChange,
    handleTimingStripSlideStart,
    handleTimingStripSlideChange,
    handleTimingStripSlideEnd,
  }
}
