// SPDX-License-Identifier: MIT

export type ReverseConformStatus = 'pending' | 'ready' | 'error'

export interface ClipIndicatorsProps {
  /** Whether the item has keyframe animations */
  hasKeyframes: boolean
  /** Whether this clip is targeted by the Edit keyframe panel. */
  keyframesExpanded: boolean
  /** Whether the item has live animation (procedural layers, modifiers, or text motion). */
  hasMotion: boolean
  /** Current playback speed (1 = normal) */
  currentSpeed: number
  /** Whether media playback is reversed */
  isReversed: boolean
  reverseConformStatus?: ReverseConformStatus
  /** Whether the item is currently being rate stretched */
  isStretching: boolean
  /** Visual feedback during stretch (speed preview) */
  stretchFeedback: { speed: number } | null
  /** Whether the item's media is broken/missing */
  isBroken: boolean
  /** Whether the item has a mediaId */
  hasMediaId: boolean
  /** Whether the item is a shape configured as a mask */
  isMask: boolean
  /** Whether the item is a shape */
  isShape: boolean
  /** Opens or closes the selected clip's Edit keyframe panel. */
  onKeyframesToggle?: () => void
  /** Selects this clip and opens its Animation controls in the inspector. */
  onMotionOpen?: () => void
}

export interface ClipLabelIndicatorsProps {
  hasKeyframes: boolean
  keyframesExpanded: boolean
  hasMotion: boolean
  isShapeMask: boolean
  showSpeedBadge: boolean
  currentSpeed: number
  isReversed: boolean
  reverseConformStatus?: ReverseConformStatus
  onKeyframesToggle?: () => void
  onMotionOpen?: () => void
}

export function hasClipLabelIndicators({
  hasKeyframes,
  hasMotion,
  isShapeMask,
  showSpeedBadge,
  isReversed,
  reverseConformStatus,
}: ClipLabelIndicatorsProps): boolean {
  return (
    hasKeyframes ||
    hasMotion ||
    isShapeMask ||
    showSpeedBadge ||
    isReversed ||
    reverseConformStatus === 'pending' ||
    reverseConformStatus === 'error'
  )
}

export function stopClipIndicatorEvent(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}
