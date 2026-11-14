// SPDX-License-Identifier: MIT

import type { Ref } from '../ref-state.svelte'

/** Geometry the three dopesheet playhead overlays share. */
export interface DopesheetPlayheadElementsProps {
  /** Off when the parent owns one shared overlay, so nothing is built below. */
  showPlayhead: boolean
  /** Skim mode: the sheet follows the preview scrubber instead of owning a scrub. */
  skim: boolean
  left: number
  /** Item-local playhead frame. The skim visual follows the global playhead. */
  playheadFrame?: number
  currentFrame: number
  itemFrom: number
  totalFrames: number
  clampToItemBounds: boolean
  localScrubActiveRef: Ref<boolean>
  localScrubHandoffFrameRef: Ref<number | null>
  frameToX: (frame: number) => number
  globalFrameToX?: (globalFrame: number) => number
  positionSyncTargetRef?: Ref<HTMLElement | null>
  maxLeft: number
  fps: number
  isRulerScrubbing: boolean
}

/**
 * Which of the three overlays to render: the `sheet` pane overlay, the `split`
 * view's spanning overlay, or the skimmer. React's builder returned all three
 * as elements; here each placement renders `DopesheetPlayheadElements` with its
 * `part`, which renders nothing when that overlay is off.
 */
export type DopesheetPlayheadElementPart = 'sheet' | 'split' | 'skim'

/** Whether `part` renders anything for these props (React's element being non-null). */
export function hasDopesheetPlayheadElement(
  part: DopesheetPlayheadElementPart,
  props: Pick<DopesheetPlayheadElementsProps, 'showPlayhead' | 'skim'>,
): boolean {
  return part === 'skim' ? props.skim : props.showPlayhead
}
