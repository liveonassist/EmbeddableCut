// SPDX-License-Identifier: MIT

/**
 * Adapter exports for player-layer dependencies.
 * Composition runtime modules should import player hooks/components from here.
 */

export {
  AbsoluteFill,
  Sequence,
  setSequenceContext,
  interpolate,
  useSequenceContext,
  type SequenceContextValue,
} from '@/runtime/player/composition'
export { default as VideoConfigProvider } from '@/runtime/player/VideoConfigProvider.svelte'
export { useVideoConfig } from '@/runtime/player/video-config-context'
export { useBridgedIsPlaying } from '@/runtime/player/clock'
export {
  useClock,
  useClockFrameSelector,
  useClockPlaybackRate,
} from '@/runtime/player/clock/clock-hooks.svelte'
export { useVideoSourcePool } from '@/runtime/player/video/VideoSourcePoolContext'
export { isVideoPoolAbortError } from '@/runtime/player/video/VideoSourcePool'
