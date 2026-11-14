// SPDX-License-Identifier: MIT

import type { TemporalEase, VectorAnimatableProperty, VectorKeyframe } from '@/types/keyframe'

export interface VectorSpeedGraphProps {
  property: VectorAnimatableProperty
  label: string
  keyframes: VectorKeyframe[]
  currentKeyframeId?: string
  fps: number
  resetLabel: string
  onTemporalEaseCommit: (keyframeId: string, temporalEase: TemporalEase | undefined) => void
  onSelectKeyframe?: (keyframe: VectorKeyframe) => void
}
