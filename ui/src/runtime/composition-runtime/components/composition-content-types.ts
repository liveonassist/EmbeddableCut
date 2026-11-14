// SPDX-License-Identifier: MIT

import type { ResolvedAudioEqSettings } from '@/types/audio'
import type { CompositionWrapperItem } from './item-types'

export interface CompositionContentProps {
  item: CompositionWrapperItem
  parentMuted?: boolean
  parentVisible?: boolean
  renderDepth?: number
  renderMode?: 'full' | 'visual-only' | 'audio-only'
  audioGainMultiplier?: number
  audioGainLiveItemIds?: string[]
  audioEqStages?: ResolvedAudioEqSettings[]
  audioPitchShiftSemitones?: number
  crossfadeFadeInFrames?: number
  crossfadeFadeOutFrames?: number
}
