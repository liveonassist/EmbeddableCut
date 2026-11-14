// SPDX-License-Identifier: MIT

/**
 * Dopesheet timing-strip wiring.
 * Owns the markers the strip draws, the frame-delta constraint the graph pane
 * clamps its drags to, the strip's own drag controller, and the effect that
 * mirrors the strip preview into the sheet's drag preview. That mirror is the
 * reason the strip and the sheet agree during a slide, so it lives here rather
 * than in the editor.
 */

import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import { constrainSelectedKeyframeDelta } from '@/features/keyframes/utils/frame-move-constraints'
import { useTimingStripDrag, type UseTimingStripDragReturn } from './use-timing-strip-drag.svelte'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import type { UseSelectionFrameActionsReturn } from './use-selection-frame-actions.svelte'

export interface UseDopesheetTimingStripOptions {
  showGraphPane: boolean
  showSheetPane: boolean
  activeSelectedProperty: AnimatableProperty | null
  keyframesByProperty: DopesheetEditorProps['keyframesByProperty']
  visibleKeyframes: Array<{ property: AnimatableProperty; keyframe: Keyframe }>
  selectedKeyframeIds: Set<string>
  selectedRefIds: string[]
  isPropertyLocked: (property: AnimatableProperty) => boolean
  onKeyframeMove: DopesheetEditorProps['onKeyframeMove']
  disabled: boolean
  totalFrames: number
  onSelectionChange: DopesheetEditorProps['onSelectionChange']
  onDragStart: DopesheetEditorProps['onDragStart']
  onDragEnd: DopesheetEditorProps['onDragEnd']
  buildSelectionFramePreview: UseSelectionFrameActionsReturn['buildSelectionFramePreview']
  commitSelectionFramePreview: UseSelectionFrameActionsReturn['commitSelectionFramePreview']
  scheduleDragPreviewFrames: (frames: Record<string, number> | null) => void
}

export interface TimingStripMarker {
  id: string
  frame: number
  selected: boolean
  draggable: boolean
}

export interface UseDopesheetTimingStripReturn extends Pick<
  UseTimingStripDragReturn,
  | 'timingStripPreviewFrames'
  | 'handleTimingStripSelectionChange'
  | 'handleTimingStripSlideStart'
  | 'handleTimingStripSlideChange'
  | 'handleTimingStripSlideEnd'
> {
  readonly timingStripMarkers: TimingStripMarker[]
  constrainGraphFrameDelta: (deltaFrames: number, draggedKeyframeIds: string[]) => number
}

/** Derives the timing strip's markers and wires its drag controller. */
export function useDopesheetTimingStrip(
  options: () => UseDopesheetTimingStripOptions,
): UseDopesheetTimingStripReturn {
  const showGraphPane = $derived(options().showGraphPane)
  const showSheetPane = $derived(options().showSheetPane)
  const activeSelectedProperty = $derived(options().activeSelectedProperty)
  const keyframesByProperty = $derived(options().keyframesByProperty)
  const visibleKeyframes = $derived(options().visibleKeyframes)
  const selectedKeyframeIds = $derived(options().selectedKeyframeIds)
  const selectedRefIds = $derived(options().selectedRefIds)
  const isPropertyLocked = $derived(options().isPropertyLocked)
  const onKeyframeMove = $derived(options().onKeyframeMove)
  const scheduleDragPreviewFrames = $derived(options().scheduleDragPreviewFrames)

  const timingStripMarkers = $derived.by((): TimingStripMarker[] => {
    if (showGraphPane) {
      if (!activeSelectedProperty) {
        return []
      }

      return (keyframesByProperty[activeSelectedProperty] ?? []).map((keyframe) => ({
        id: keyframe.id,
        frame: keyframe.frame,
        selected: selectedKeyframeIds.has(keyframe.id),
        draggable: !!onKeyframeMove && selectedRefIds.includes(keyframe.id),
      }))
    }

    return visibleKeyframes
      .filter(({ keyframe }) => selectedKeyframeIds.has(keyframe.id))
      .map(({ property, keyframe }) => ({
        id: keyframe.id,
        frame: keyframe.frame,
        selected: true,
        draggable: !!onKeyframeMove && !isPropertyLocked(property),
      }))
  })
  const constrainGraphFrameDelta = (deltaFrames: number, draggedKeyframeIds: string[]) => {
    const { keyframesByProperty, totalFrames } = options()
    return constrainSelectedKeyframeDelta({
      keyframesByProperty,
      selectedKeyframeIds: new Set(draggedKeyframeIds),
      totalFrames,
      deltaFrames,
    })
  }
  const timingStripDrag = useTimingStripDrag(() => {
    const opts = options()
    return {
      disabled: opts.disabled,
      onKeyframeMove: opts.onKeyframeMove,
      onSelectionChange: opts.onSelectionChange,
      onDragStart: opts.onDragStart,
      onDragEnd: opts.onDragEnd,
      buildSelectionFramePreview: opts.buildSelectionFramePreview,
      commitSelectionFramePreview: opts.commitSelectionFramePreview,
    }
  })

  // Mirror timing-strip preview into the sheet drag preview. The sheet shows in
  // both `dopesheet` and `split`, so mirror whenever the sheet pane is visible.
  $effect(() => {
    if (!showSheetPane) {
      scheduleDragPreviewFrames(null)
      return
    }

    scheduleDragPreviewFrames(timingStripDrag.timingStripPreviewFrames)
  })

  return {
    get timingStripMarkers() {
      return timingStripMarkers
    },
    constrainGraphFrameDelta,
    get timingStripPreviewFrames() {
      return timingStripDrag.timingStripPreviewFrames
    },
    handleTimingStripSelectionChange: timingStripDrag.handleTimingStripSelectionChange,
    handleTimingStripSlideStart: timingStripDrag.handleTimingStripSlideStart,
    handleTimingStripSlideChange: timingStripDrag.handleTimingStripSlideChange,
    handleTimingStripSlideEnd: timingStripDrag.handleTimingStripSlideEnd,
  }
}
