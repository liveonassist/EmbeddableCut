// SPDX-License-Identifier: MIT

/**
 * Dopesheet workspace chrome: the state the toolbar, the timing strip and the
 * navigator read. Those belong to the default workspace shell only, so the
 * exclusive (`lanes` and `classic`) shells never render
 * `dopesheet-workspace-chrome.svelte`'s snippets.
 */

import type { AnimatableProperty, EasingType, KeyframeRef } from '@/types/keyframe'
import type { SetState } from '../ref-state.svelte'
import type { KeyframeNavigatorViewport } from './compact-navigator-utils'
import type { DopesheetHeaderFrameInputsProps } from './dopesheet-presentation'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import type { DopesheetToolbarProps } from './dopesheet-toolbar'
import type { TimingStripMarker } from './use-dopesheet-timing-strip.svelte'
import type { UseDopesheetSheetStructureReturn } from './use-dopesheet-sheet-structure.svelte'

/** Everything the workspace chrome reads, from the editor's resolved state (an object of getters). */
export interface DopesheetWorkspaceChromeState {
  // Toolbar
  readonly availableProperties: AnimatableProperty[]
  readonly filterKeyframedOnly: boolean
  readonly setShowKeyframedOnly: SetState<boolean>
  readonly allPropertyGroups: DopesheetToolbarProps['allPropertyGroups']
  readonly visibleGroups: DopesheetToolbarProps['visibleGroups']
  readonly toggleVisibleGroup: DopesheetToolbarProps['onToggleVisibleGroup']
  readonly setAllGroupsExpanded: (expanded: boolean) => void
  readonly resetParameterView: () => void
  readonly hasPropertyFilters: boolean
  readonly showGraphPane: boolean
  readonly graphDisplayProperty: DopesheetToolbarProps['graphDisplayProperty']
  readonly compoundPropertyRows: DopesheetToolbarProps['compoundPropertyRows']
  readonly speedGraphContent: DopesheetToolbarProps['speedGraphContent']
  readonly onGraphModeChange: DopesheetToolbarProps['onGraphModeChange']
  readonly graphMode: DopesheetToolbarProps['graphMode']
  readonly visibleKeyframes: UseDopesheetSheetStructureReturn['visibleKeyframes']
  readonly isCurrentFrameBlocked: boolean
  readonly canBakeMotion: boolean
  readonly onBakeMotion: DopesheetToolbarProps['onBakeMotion']
  readonly interpolationOptions: ReadonlyArray<{ value: EasingType; label: string }>
  readonly selectedInterpolation: DopesheetToolbarProps['selectedInterpolation']
  readonly interpolationDisabled: boolean
  readonly onInterpolationChange: DopesheetToolbarProps['onInterpolationChange']
  readonly selectedRefs: KeyframeRef[]
  readonly hasKeyframeClipboard: boolean
  readonly isKeyframeClipboardCut: boolean
  readonly onCopyKeyframes: DopesheetToolbarProps['onCopyKeyframes']
  readonly onCutKeyframes: DopesheetToolbarProps['onCutKeyframes']
  readonly onPasteKeyframes: DopesheetToolbarProps['onPasteKeyframes']
  readonly onRemoveKeyframes: DopesheetEditorProps['onRemoveKeyframes']
  readonly handleRemoveKeyframes: DopesheetToolbarProps['handleRemoveKeyframes']
  readonly horizontalZoomValue: number
  readonly horizontalZoomRatioBase: number
  readonly setHorizontalZoomValue: DopesheetToolbarProps['setHorizontalZoomValue']
  readonly resetViewport: () => void
  readonly graphVerticalZoomValue: number
  readonly visibleGraphProperties: AnimatableProperty[]
  readonly verticalZoomRatioBase: number
  readonly setGraphVerticalZoomValue: DopesheetToolbarProps['setGraphVerticalZoomValue']
  readonly graphRulerUnit: DopesheetToolbarProps['graphRulerUnit']
  readonly setGraphRulerUnit: DopesheetToolbarProps['onChangeRulerUnit']
  readonly showAllGraphHandles: boolean
  readonly setShowAllGraphHandles: SetState<boolean>
  readonly autoZoomGraphHeight: boolean
  readonly setAutoZoomGraphHeight: SetState<boolean>
  readonly headerFrameInputs: DopesheetHeaderFrameInputsProps
  // Timing strip + navigator
  /** Inline style for the property/timeline grid (`grid-template-columns: …`). */
  readonly propertyGridStyle: string
  readonly viewport: KeyframeNavigatorViewport
  readonly contentFrameMax: number
  readonly timingStripMarkers: TimingStripMarker[]
  readonly timingStripPreviewFrames: Record<string, number> | null
  readonly disabled: boolean
  readonly handleTimingStripSelectionChange: (selectedIds: Set<string>) => void
  readonly handleTimingStripSlideStart: (selectedIds: string[]) => void
  readonly handleTimingStripSlideChange: (deltaFrames: number, selectedIds: string[]) => void
  readonly handleTimingStripSlideEnd: (selectedIds: string[]) => void
  readonly currentFrame: number
  readonly minViewportFrames: number
  readonly updateViewport: (viewport: KeyframeNavigatorViewport) => void
}
