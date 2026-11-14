// SPDX-License-Identifier: MIT

import type { AudioPlaybackProps } from '../audio-playback-props'

export const PARTIAL_WAV_READY_SECONDS = 2
export const PARTIAL_WAV_WAIT_TIMEOUT_MS = 6000
export const PARTIAL_WAV_EXTENSION_TRIGGER_SECONDS = 1.25
export const PARTIAL_WAV_EXTENSION_READY_SECONDS = 3
export const REVERSE_SHUTTLE_PREROLL_SECONDS = 4

export interface CustomDecoderAudioProps extends AudioPlaybackProps {
  src: string
  mediaId: string
}

export interface DecodedPitchSource {
  buffer: AudioBuffer
  sourceStartOffsetSec: number
  coverageEndSec: number
  isComplete: boolean
}

export interface DecodedPitchFallbackAudioProps extends AudioPlaybackProps {
  audioBuffer: AudioBuffer
  sourceStartOffsetSec: number
  isComplete: boolean
  timelineFps: number
}

export function shouldReplaceDecodedPitchSource(
  current: DecodedPitchSource | null,
  next: DecodedPitchSource,
): boolean {
  if (!current) {
    return true
  }
  if (current.isComplete) {
    return (
      next.isComplete &&
      (current.buffer.length !== next.buffer.length ||
        current.buffer.sampleRate !== next.buffer.sampleRate)
    )
  }
  if (next.isComplete) {
    return true
  }
  if (next.coverageEndSec > current.coverageEndSec + 0.05) {
    return true
  }
  if (next.sourceStartOffsetSec < current.sourceStartOffsetSec - 0.05) {
    return true
  }
  return false
}
