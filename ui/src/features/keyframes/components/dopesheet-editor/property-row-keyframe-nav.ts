// SPDX-License-Identifier: MIT

import type { TFunction } from 'i18next'
import type { AnimatableProperty, Keyframe } from '@/types/keyframe'

export interface PropertyRowKeyframeNavProps {
  property: AnimatableProperty
  rowLabel: string
  prevKeyframe: Keyframe | null
  nextKeyframe: Keyframe | null
  currentKeyframes: Keyframe[]
  hasKeyframeAtCurrentFrame: boolean
  disabled: boolean
  rowLocked: boolean
  isCurrentFrameBlocked: boolean
  canNavigate: boolean
  canAddKeyframe: boolean
  onNavigate: (property: AnimatableProperty, keyframe: Keyframe | null) => void
  onToggleKeyframe: (property: AnimatableProperty, currentKeyframes: Keyframe[]) => void
  t: TFunction
}
