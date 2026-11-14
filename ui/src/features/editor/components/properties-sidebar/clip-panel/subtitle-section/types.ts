// SPDX-License-Identifier: MIT

import type { AudioItem, VideoItem } from '@/types/timeline'

export type CuePatch = Partial<{ text: string; startSeconds: number; endSeconds: number }>

export type CueChangeHandler = (cueId: string, patch: CuePatch) => void

export type CueSeekHandler = (startSeconds: number) => void

export interface SubtitleCue {
  id: string
  startSeconds: number
  endSeconds: number
  text: string
}

export type VirtualTranscriptCaptionClip = (AudioItem | VideoItem) & {
  transcriptCaptions: NonNullable<(AudioItem | VideoItem)['transcriptCaptions']>
}
