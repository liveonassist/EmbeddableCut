// SPDX-License-Identifier: MIT

import type {
  AnimatableProperty,
  BezierControlPoints,
  Keyframe,
  KeyframeRef,
} from '@/types/keyframe'
import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import type { ProceduralPreviewInput } from '@/features/keyframes/utils/procedural-preview'

/** Props of `ValueGraphEditor` and `EmbeddedValueGraphEditor` (React's `ValueGraphEditorSharedProps`). */
export interface ValueGraphEditorSharedProps {
  /** Shared time viewport when split mode needs synchronized frame zoom/pan */
  frameViewport?: { startFrame: number; endFrame: number }
  /** Callback when the shared time viewport changes */
  onFrameViewportChange?: (viewport: { startFrame: number; endFrame: number }) => void
  /** Item ID to show keyframes for */
  itemId: string
  /** Keyframes organized by property */
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  /** Currently selected property (or null to show all) */
  selectedProperty?: AnimatableProperty | null
  /** Additional properties to render as overlay curves (visual only, no interaction) */
  overlayProperties?: AnimatableProperty[]
  /** Selected keyframe IDs */
  selectedKeyframeIds?: Set<string>
  /** Current playhead frame (clip-relative) */
  currentFrame?: number
  /** Absolute timeline frame where the edited item starts (for live playhead) */
  itemFrom?: number
  /** Total duration in frames */
  totalFrames?: number
  /** Timeline FPS for time ruler formatting */
  fps?: number
  /** Width of the editor */
  width?: number
  /** Height of the editor */
  height?: number
  /** Callback when keyframe is moved */
  onKeyframeMove?: (ref: KeyframeRef, newFrame: number, newValue: number) => void
  /** Callback when keyframes are duplicated to explicit targets */
  onDuplicateKeyframes?: (
    entries: Array<{ ref: KeyframeRef; frame: number; value: number }>,
  ) => void
  /** Optional frame preview override for external X-axis scrubbing */
  previewFramesById?: Record<string, number> | null
  /** Optional frame-delta constraint for horizontal drags */
  constrainFrameDelta?: (deltaFrames: number, draggedKeyframeIds: string[]) => number
  /** Callback when bezier handles are moved */
  onBezierHandleMove?: (ref: KeyframeRef, bezier: BezierControlPoints) => void
  /** Callback when selection changes */
  onSelectionChange?: (keyframeIds: Set<string>) => void
  /** Callback when property selection changes */
  onPropertyChange?: (property: AnimatableProperty | null) => void
  /** Callback when playhead is scrubbed (frame is clip-relative) */
  onScrub?: (frame: number) => void
  /** Callback when scrubbing starts */
  onScrubStart?: () => void
  /** Callback when scrubbing ends */
  onScrubEnd?: () => void
  /** Callback when drag starts (for undo batching) */
  onDragStart?: () => void
  /** Callback when drag ends (for undo batching) */
  onDragEnd?: () => void
  /** Callback to add a keyframe at the current frame */
  onAddKeyframe?: (property: AnimatableProperty, frame: number) => void
  /** Callback to remove selected keyframes */
  onRemoveKeyframes?: (refs: KeyframeRef[]) => void
  /** Callback to navigate to a keyframe (sets playhead to that frame) */
  onNavigateToKeyframe?: (frame: number) => void
  /** Transition-blocked frame ranges (keyframes cannot be placed here) */
  transitionBlockedRanges?: BlockedFrameRange[]
  /** Procedural generator inputs for dashed ghost curves (base + modifiers). */
  proceduralPreview?: ProceduralPreviewInput
  /** Controls whether snapping is enabled */
  snapEnabled?: boolean
  /** Which bezier handles should be visible */
  handleVisibility?: 'selected' | 'all'
  /** How to render the time ruler */
  rulerUnit?: 'frames' | 'seconds'
  /** Automatically fit the Y range to the active curve values */
  autoZoomGraphHeight?: boolean
  /** Optional externally controlled Y zoom level (0-100) */
  externalValueZoomLevel?: number
  /** Whether the editor is disabled */
  disabled?: boolean
  /**
   * Hide the graph's own playhead line/flag visuals (the scrub hit-area stays).
   * Used when an outer editor (e.g. the dopesheet split view) draws a single
   * shared playhead line spanning both panes instead.
   */
  hidePlayhead?: boolean
  /** Additional class name */
  class?: string
}

export interface ValueGraphEditorBaseProps extends ValueGraphEditorSharedProps {
  chrome: 'full' | 'embedded'
}

export type ValueGraphEditorProps = ValueGraphEditorSharedProps
export type EmbeddedValueGraphEditorProps = ValueGraphEditorSharedProps
