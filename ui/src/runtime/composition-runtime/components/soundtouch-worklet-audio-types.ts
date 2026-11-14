// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { AudioPlaybackProps } from './audio-playback-props'

export interface SoundTouchWorkletAudioProps extends AudioPlaybackProps {
  audioBuffer: AudioBuffer
  sourceStartOffsetSec?: number
  isComplete?: boolean
  fallback?: Snippet
}
