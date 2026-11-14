// SPDX-License-Identifier: MIT

import type { TranscriptToken } from '@/features/timeline/utils/transcript-edit-model'

export type TranscriptScope = 'selection' | 'project'

export interface TranscriptEditorPanelProps {
  /** Only fetch/transcribe while the tab is actually visible. */
  active: boolean
}

/** Pause (seconds) that starts a new transcript paragraph. */
const PARAGRAPH_GAP_SECONDS = 0.6
/** Soft/hard word caps so pause-less speech still breaks into readable blocks. */
const SEGMENT_SOFT_MAX_WORDS = 28
const SEGMENT_HARD_MAX_WORDS = 40

/** Timeline seconds → compact `m:ss` (or `h:mm:ss`) timecode. */
export function formatTimecode(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** A run of words rendered as one timestamped paragraph. */
export interface TranscriptSegment {
  key: string
  startFrame: number
  startSeconds: number
  firstIndex: number
  lastIndex: number
  indices: number[]
  /** True when this paragraph opens a new source clip (draws a divider). */
  isClipStart: boolean
}

const SENTENCE_END = /[.?!]["')\]]?$/

/**
 * Group the flat token stream into timestamped paragraphs. Breaks fall at clip
 * changes and real pauses; soft/hard word caps keep pause-less speech from
 * collapsing back into a wall.
 */
export function buildSegments(
  tokens: readonly TranscriptToken[],
  timelineFps: number,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let current: TranscriptSegment | null = null
  let wordCount = 0

  tokens.forEach((token, index) => {
    const prev = index > 0 ? tokens[index - 1] : undefined
    const clipChange = !!prev && prev.itemId !== token.itemId
    const pause = !!prev && token.sourceStart - prev.sourceEnd >= PARAGRAPH_GAP_SECONDS
    const sentenceWrap =
      !!prev && wordCount >= SEGMENT_SOFT_MAX_WORDS && SENTENCE_END.test(prev.text)
    const overflow = wordCount >= SEGMENT_HARD_MAX_WORDS

    if (!current || clipChange || pause || sentenceWrap || overflow) {
      current = {
        key: token.key,
        startFrame: token.startFrame,
        startSeconds: token.startFrame / timelineFps,
        firstIndex: index,
        lastIndex: index,
        indices: [index],
        isClipStart: clipChange,
      }
      segments.push(current)
      wordCount = 1
    } else {
      current.indices.push(index)
      current.lastIndex = index
      wordCount += 1
    }
  })

  return segments
}
