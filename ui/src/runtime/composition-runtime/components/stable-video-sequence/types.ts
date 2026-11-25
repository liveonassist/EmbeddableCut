// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { TimelineItem, VideoItem } from '@/types/timeline'
import type { AudioEqSettings } from '@/types/audio'
import type { ResolvedTransitionWindow } from '@/shared/timeline/transitions/transition-planner'

/** Video item with additional properties added by MainComposition */
export type StableVideoSequenceItem = VideoItem & {
  zIndex: number
  muted: boolean
  trackAudioEq?: AudioEqSettings
  trackOrder: number
  trackVisible: boolean
  _sequenceFrameOffset?: number
  _poolClipId?: string
  _sharedTransitionSync?: boolean
  /** The clip whose `<video>` stands for this one's (`resolveVideoTwins`). */
  _twinOf?: string
}

export interface StableVideoSequenceProps {
  /** All video items that might share the same origin */
  items: StableVideoSequenceItem[]
  /** Shared transition windows for current composition */
  transitionWindows?: ResolvedTransitionWindow<TimelineItem>[]
  /** Renders the video content */
  renderItem: Snippet<[StableVideoSequenceItem]>
  /** Number of frames to premount */
  premountFor?: number
}
