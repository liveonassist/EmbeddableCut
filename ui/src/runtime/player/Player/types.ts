// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { CallbackListener, PlayerEventTypes } from '../event-emitter'

export interface PlayerProps {
  /** The content to render as video content */
  children: Snippet

  /** Duration in frames */
  durationInFrames: number

  /** Frames per second */
  fps: number

  /** Initial frame to start at */
  initialFrame?: number

  /** Whether to loop playback */
  loop?: boolean

  /** Whether to show controls */
  controls?: boolean

  /** Whether to auto-play on mount */
  autoPlay?: boolean

  /** Whether to start muted */
  initiallyMuted?: boolean

  /** Playback rate (0.25 - 4) */
  playbackRate?: number

  /** Custom class name */
  class?: string

  /** Custom styles */
  style?: string

  /** Width of the rendered composition */
  width?: number

  /** Height of the rendered composition */
  height?: number

  /** Explicit CSS layout rectangle to scale the composition into. */
  layoutSize?: { width: number; height: number }

  /** Callback when playback ends */
  onEnded?: () => void

  /** Callback when frame changes */
  onFrameChange?: (frame: number) => void

  /** Callback when play state changes */
  onPlayStateChange?: (isPlaying: boolean) => void

  /** The imperative API (React's forwarded ref), set once the player mounts. */
  ref?: PlayerRef | null
}

export interface PlayerRef {
  play: () => void
  pause: () => void
  toggle: () => void
  seekTo: (frame: number) => void
  getCurrentFrame: () => number
  isPlaying: () => boolean
  getPlaybackRate: () => number
  setPlaybackRate: (rate: number) => void
  addEventListener: <E extends PlayerEventTypes>(event: E, callback: CallbackListener<E>) => void
  removeEventListener: <E extends PlayerEventTypes>(event: E, callback: CallbackListener<E>) => void
}
