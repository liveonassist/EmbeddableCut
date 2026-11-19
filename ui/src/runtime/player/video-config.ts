// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

/** Reactive: providers expose these as getters over their current props. */
export interface VideoConfig {
  readonly fps: number
  readonly width: number
  readonly height: number
  readonly durationInFrames: number
  readonly id: string
}

const VIDEO_CONFIG_KEY = Symbol('embeddablecut.video-config')

/** Provides the video config to children (React's `VideoConfigContext.Provider`). */
export function setVideoConfig(config: VideoConfig): void {
  setContext(VIDEO_CONFIG_KEY, config)
}

export function useVideoConfig(): VideoConfig {
  const config = getContext<VideoConfig | undefined>(VIDEO_CONFIG_KEY)
  if (!config) {
    throw new Error('No video config found. Make sure to use this component within a Player.')
  }
  return config
}
