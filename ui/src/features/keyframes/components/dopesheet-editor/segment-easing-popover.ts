// SPDX-License-Identifier: MIT

import type { EasingConfig, EasingType, KeyframeRef } from '@/types/keyframe'

/** Easing updates applied to a segment's originating keyframe(s). */
export interface SegmentEasingUpdate {
  easing: EasingType
  easingConfig?: EasingConfig
}

export type SegmentEasingChange = (
  refs: KeyframeRef[],
  updates: SegmentEasingUpdate,
  options?: { commit?: boolean },
) => void
