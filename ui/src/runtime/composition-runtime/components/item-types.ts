// SPDX-License-Identifier: MIT

/**
 * The prop types `item-content.tsx` exported alongside its component. They
 * live here because types exported from a component's module script are
 * invisible to oxlint.
 */

import type { Snippet } from 'svelte'
import type { AudioItem, CompositionItem, TimelineItem, ShapeItem } from '@/types/timeline'
import type { ResolvedAudioEqSettings } from '@/types/audio'
import type { TransformProperties } from '@/types/transform'

/** Mask information passed from composition to items */
export interface MaskInfo {
  shape: ShapeItem
  transform: TransformProperties
  trackOrder: number
}

export type CompositionRenderMode = 'full' | 'visual-only' | 'audio-only'
export type CompositionWrapperItem = CompositionItem | (AudioItem & { compositionId: string })

export interface RenderCompositionContentProps {
  item: CompositionWrapperItem
  parentMuted: boolean
  parentVisible: boolean
  renderDepth: number
  renderMode: CompositionRenderMode
  audioGainMultiplier: number
  audioGainLiveItemIds?: string[]
  audioEqStages?: ResolvedAudioEqSettings[]
  audioPitchShiftSemitones: number
}

export interface ItemProps {
  item: TimelineItem
  muted?: boolean
  visible?: boolean
  /** Active masks that should clip this item's content */
  masks?: MaskInfo[]
  /** Current composition nesting depth (prevents infinite recursion) */
  renderDepth?: number
  compositionRenderMode?: CompositionRenderMode
  audioGainMultiplier?: number
  audioGainLiveItemIds?: string[]
  audioEqStages?: ResolvedAudioEqSettings[]
  audioPitchShiftSemitones?: number
  renderCompositionContent: Snippet<[RenderCompositionContentProps]>
}
