// SPDX-License-Identifier: MIT

import type { Ref } from '../ref-state.svelte'

export interface DopesheetPlayheadOverlayProps {
  variant: 'sheet' | 'split' | 'skim'
  left: number
  playheadFrame?: number
  currentFrame: number
  itemFrom: number
  totalFrames: number
  clampToItemBounds: boolean
  followPreviewFrame: boolean
  localScrubActiveRef: Ref<boolean>
  localScrubHandoffFrameRef: Ref<number | null>
  frameToX: (frame: number) => number
  globalFrameToX?: (globalFrame: number) => number
  positionSyncTargetRef?: Ref<HTMLElement | null>
  maxLeft: number
  fps: number
  isRulerScrubbing: boolean
}
