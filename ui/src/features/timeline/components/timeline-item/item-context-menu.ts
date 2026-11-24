// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { AnimatableProperty, PropertyKeyframes } from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { SceneDetectionMethod, VerificationModel } from '@/features/timeline/deps/analysis'

export interface JoinActionsConfig {
  canJoinSelected: boolean
  hasJoinableLeft: boolean
  hasJoinableRight: boolean
  closerEdge: 'left' | 'right' | null
  onJoinSelected: () => void
  onJoinLeft: () => void
  onJoinRight: () => void
}

export interface LinkActionsConfig {
  canLinkSelected?: boolean
  canUnlinkSelected?: boolean
  onLinkSelected?: () => void
  onUnlinkSelected?: () => void
}

export interface KeyframeActionsConfig {
  keyframedProperties?: PropertyKeyframes[]
  onClearAllKeyframes?: () => void
  onClearPropertyKeyframes?: (property: AnimatableProperty) => void
}

export interface SceneDetectionActionsConfig {
  canDetectScenes?: boolean
  isDetectingScenes?: boolean
  onDetectScenes?: (method: SceneDetectionMethod, verificationModel?: VerificationModel) => void
}

export interface CaptionActionsConfig {
  canManageCaptions?: boolean
  hasCaptions?: boolean
  isGeneratingCaptions?: boolean
  canExtractEmbeddedSubtitles?: boolean
  canConsolidateCaptionsToSegment?: boolean
  onOpenCaptionDialog?: () => void
  onExtractEmbeddedSubtitles?: () => void
  onConsolidateCaptionsToSegment?: () => void
}

export interface CompositionActionsConfig {
  isCompositionItem?: boolean
  canCreatePreComp?: boolean
  onEnterComposition?: () => void
  onDissolveComposition?: () => void
  onCreatePreComp?: () => void
}

export interface MediaActionsConfig {
  canReverse?: boolean
  isReversed?: boolean
  isVideoItem?: boolean
  playheadInBounds?: boolean
  canRemoveSilence?: boolean
  canRemoveFillers?: boolean
  isRemovingFillers?: boolean
  isTextItem?: boolean
  onReverse?: () => void
  onFreezeFrame?: () => void
  onRemoveSilence?: () => void
  onRemoveFillers?: () => void
  onGenerateAudioFromText?: () => void
}

export interface LayoutActionsConfig {
  onBentoLayout?: () => void
}

export interface DestructiveActionsConfig {
  isSelected: boolean
  onRippleDelete: () => void
  onDelete: () => void
}

export interface ItemContextMenuProps {
  children: Snippet
  trackLocked: boolean
  joinActions: JoinActionsConfig
  destructiveActions: DestructiveActionsConfig
  linkActions?: LinkActionsConfig
  keyframeActions?: KeyframeActionsConfig
  layoutActions?: LayoutActionsConfig
  mediaActions?: MediaActionsConfig
  sceneDetectionActions?: SceneDetectionActionsConfig
  captionActions?: CaptionActionsConfig
  compositionActions?: CompositionActionsConfig
  /** The clip, for what hosts add to its menu. */
  item?: TimelineItem
}
