// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { AnimatableProperty, EasingType } from '@/types/keyframe'
import type { CompoundPropertyInputConfig } from './compound-property-inputs'
import type { PropertyAccordionGroup } from './property-groups'
import type { Ref } from '../ref-state.svelte'

export interface DopesheetToolbarProps {
  disabled: boolean
  hasAvailableProperties: boolean
  filterKeyframedOnly: boolean
  onToggleKeyframedOnly: () => void
  allPropertyGroups: PropertyAccordionGroup[]
  visibleGroups: Record<string, boolean>
  onToggleVisibleGroup: (id: string) => void
  onExpandAllGroups: () => void
  onCollapseAllGroups: () => void
  onResetParameterView: () => void
  hasPropertyFilters: boolean
  showGraphPane: boolean
  graphDisplayProperty: AnimatableProperty | null
  compoundPropertyRows: Partial<Record<AnimatableProperty, CompoundPropertyInputConfig>>
  speedGraphContent: Snippet | null | undefined
  onGraphModeChange?: (mode: 'value' | 'speed') => void
  graphMode: 'value' | 'speed'
  keyframeCount: number
  isCurrentFrameBlocked: boolean
  canBakeMotion: boolean
  onBakeMotion?: () => void
  headerFrameInputsEnabled: boolean
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
  interpolationOptions: ReadonlyArray<{ value: EasingType; label: string }>
  selectedInterpolation: EasingType | null | undefined
  interpolationDisabled: boolean
  onInterpolationChange?: (value: EasingType) => void
  hasSelection: boolean
  hasKeyframeClipboard: boolean
  isKeyframeClipboardCut: boolean
  onCopyKeyframes?: () => void
  onCutKeyframes?: () => void
  onPasteKeyframes?: () => void
  removeKeyframesAvailable: boolean
  handleRemoveKeyframes: () => void
  horizontalZoomValue: number
  horizontalZoomRatioBase: number
  setHorizontalZoomValue: (value: number) => void
  resetViewport: () => void
  graphVerticalZoomValue: number
  graphPropertyCount: number
  verticalZoomRatioBase: number
  setGraphVerticalZoomValue: (value: number) => void
  graphRulerUnit: 'frames' | 'seconds'
  onChangeRulerUnit: (unit: 'frames' | 'seconds') => void
  showAllGraphHandles: boolean
  onToggleGraphHandleVisibility: () => void
  autoZoomGraphHeight: boolean
  onToggleAutoZoomGraphHeight: () => void
}
