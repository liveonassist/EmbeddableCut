// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'
import { useSelectionStore } from '@/shared/state/selection'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { pixelsToTimeNow } from '@/features/timeline/utils/zoom-conversions'
import { select } from '$lib/store.svelte'
import { useSnapCalculator } from './use-snap-calculator.svelte'

type SelectionState = ReturnType<typeof useSelectionStore.getState>

export type DragInteractionPreamble = ReturnType<typeof useSnapCalculator> & {
  pixelsToTime: typeof pixelsToTimeNow
  readonly fps: number
  setDragState: SelectionState['setDragState']
  setActiveSnapTarget: SelectionState['setActiveSnapTarget']
}

/**
 * Shared preamble for pointer-drag item hooks (trim, slip/slide, track push).
 * Subscribes to fps plus the stable selection actions, and wires the magnetic
 * snap calculator for the dragged item.
 */
export function useDragInteractionPreamble(
  item: () => TimelineItem,
  timelineDuration: () => number,
): DragInteractionPreamble {
  const pixelsToTime = pixelsToTimeNow
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const { setDragState, setActiveSnapTarget } = useSelectionStore.getState()
  const snap = useSnapCalculator(timelineDuration, () => item().id)
  return {
    pixelsToTime,
    get fps() {
      return fps.current
    },
    setDragState,
    setActiveSnapTarget,
    ...snap,
  }
}
