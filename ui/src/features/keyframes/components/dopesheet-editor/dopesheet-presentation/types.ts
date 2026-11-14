// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { TFunction } from 'i18next'
import type { Ref } from '../../ref-state.svelte'
import type { UseDopesheetNavigationReturn } from '../use-dopesheet-navigation.svelte'
import type { PropertyExpressionEditorApi } from '../use-property-expression-editor.svelte'

/** Header frame inputs the workspace toolbar and the classic shell share. */
export interface DopesheetHeaderFrameInputsProps {
  disabled: boolean
  inputsEnabled: boolean
  totalFrames: number
  globalFrame: number | null
  localFrameInputValue: string
  globalFrameInputValue: string
  setLocalFrameInputValue: (value: string) => void
  setGlobalFrameInputValue: (value: string) => void
  skipNextHeaderFrameBlurRef: Ref<'local' | 'global' | null>
  commitLocalFrameInput: () => void
  commitGlobalFrameInput: () => void
  handleHeaderFrameInputKeyDown: (
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
    input: 'local' | 'global',
    commit: () => void,
  ) => void
}

/**
 * The panes every shell places, built once by the editor. A pane React left
 * `null` is an absent snippet here.
 */
export interface DopesheetPaneElements {
  rulerHeaderElement?: Snippet
  sheetBodyElement?: Snippet
  graphPaneElement?: Snippet
  playheadOverlayElement?: Snippet
  splitPlayheadOverlayElement?: Snippet
  skimPlayheadOverlayElement?: Snippet
  expressionDockElement?: Snippet
  expressionReferenceDrag: PropertyExpressionEditorApi['expressionReferenceDrag']
}

export interface DopesheetShellRootProps {
  pickWhipRootRef: Ref<HTMLDivElement | null>
  class?: string
  height: number
  disabled: boolean
  handleWheel: UseDopesheetNavigationReturn['handleWheel']
}

export interface DopesheetLanesPresentationProps
  extends
    DopesheetShellRootProps,
    Pick<
      DopesheetPaneElements,
      | 'graphPaneElement'
      | 'sheetBodyElement'
      | 'skimPlayheadOverlayElement'
      | 'playheadOverlayElement'
      | 'expressionDockElement'
      | 'expressionReferenceDrag'
    > {
  timelineRef: Ref<HTMLDivElement | null>
  timelineGridDivisions?: number
  timelineCellBorderWidth: number
  columnWidth: number
  showSheetPane: boolean
  showGraphPane: boolean
  handleGraphPaneKeyDown: (event: KeyboardEvent) => void
}

export interface DopesheetClassicPresentationProps
  extends
    DopesheetShellRootProps,
    Pick<
      DopesheetPaneElements,
      | 'rulerHeaderElement'
      | 'sheetBodyElement'
      | 'skimPlayheadOverlayElement'
      | 'playheadOverlayElement'
    > {
  width: number
  t: TFunction
  keyframeCount: number
  trimmedKeyframeCount: number
  onTrimAnimation?: () => void
  headerFrameInputs: DopesheetHeaderFrameInputsProps
  viewportInteractionEnabled: boolean
  affectedFrameRangeOverlayElement?: Snippet
  effectiveTimelineWidth: number
  columnWidth: number
}

export interface DopesheetEditorPresentationProps
  extends DopesheetPaneElements, DopesheetShellRootProps {
  width: number
  t: TFunction
  visualizationMode: 'dopesheet' | 'graph' | 'split'
  isSplitView: boolean
  showSheetPane: boolean
  showGraphPane: boolean
  /** Inline style for the property/timeline grid (`grid-template-columns: …`). */
  propertyGridStyle: string
  toolbarElement?: Snippet
  timingStripElement?: Snippet
  navigatorElement?: Snippet
}
