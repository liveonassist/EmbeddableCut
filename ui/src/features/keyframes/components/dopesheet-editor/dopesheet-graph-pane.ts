// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type {
  AnimatableProperty,
  BezierControlPoints,
  Keyframe,
  KeyframeRef,
} from '@/types/keyframe'
import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import type { ProceduralPreviewInput } from '@/features/keyframes/utils/procedural-preview'
import type { Ref } from '../ref-state.svelte'
import type { Viewport } from './dopesheet-types'

export interface DopesheetGraphPaneProps {
  hasRows: boolean
  emptyStateMessage: string
  showEmptyGuidance: boolean
  proceduralHint?: string
  propertyColumnElements?: Snippet
  propertyColumnWidth?: number
  graphPaneRef: Ref<HTMLDivElement | null>
  disabled: boolean
  graphDisplayPropertyLocked: boolean
  focusGraphPane: (event: MouseEvent | PointerEvent) => void
  handleGraphPaneKeyDown: (event: KeyboardEvent) => void
  graphPaneSize: { width: number; height: number }
  graphVisiblePropertiesSize: number
  viewport: Viewport
  updateViewport: (next: Viewport) => void
  itemId: string
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  graphDisplayProperty: AnimatableProperty | null
  graphVisibleProperties: AnimatableProperty[]
  selectedKeyframeIds: Set<string>
  currentFrame: number
  itemFrom: number
  totalFrames: number
  fps: number
  onKeyframeMove?: (ref: KeyframeRef, newFrame: number, newValue: number) => void
  timingStripPreviewFrames: Record<string, number> | null
  constrainGraphFrameDelta?: (deltaFrames: number, draggedKeyframeIds: string[]) => number
  onBezierHandleMove?: (ref: KeyframeRef, bezier: BezierControlPoints) => void
  onSelectionChange?: (keyframeIds: Set<string>) => void
  onPropertyChange?: (property: AnimatableProperty | null) => void
  onScrub?: (frame: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onAddKeyframe?: (property: AnimatableProperty, frame: number) => void
  onRemoveKeyframes?: (refs: KeyframeRef[]) => void
  onNavigateToKeyframe?: (frame: number) => void
  transitionBlockedRanges?: BlockedFrameRange[]
  proceduralPreview?: ProceduralPreviewInput
  snapEnabled: boolean
  graphHandleVisibility: 'selected' | 'all'
  graphRulerUnit: 'frames' | 'seconds'
  autoZoomGraphHeight: boolean
  graphVerticalZoomValue: number
  /** Hide the graph's own playhead line (the dopesheet draws a shared one). */
  hidePlayhead?: boolean
  /** Reserve space for the editor's external ruler. */
  subtractRulerHeight?: boolean
  /** Purpose-built graph canvas for non-scalar semantics such as vector speed. */
  customGraphContent?: Snippet
}
