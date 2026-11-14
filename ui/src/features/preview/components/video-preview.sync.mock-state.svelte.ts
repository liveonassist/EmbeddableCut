// SPDX-License-Identifier: MIT

import { vi } from 'vite-plus/test'

/** What the sync test's mocked player has been asked to do. */
export const mockPlayer = {
  seekToMock: vi.fn<(frame: number) => void>(),
  playMock: vi.fn(),
  pauseMock: vi.fn(),
  isPlaying: false,
  deferSeekCompletion: false,
  completeDeferredSeek: null as ((frameOverride?: number) => void) | null,
  lastDimensions: null as { width: number; height: number } | null,
  dimensionsHistory: [] as Array<{ width: number; height: number }>,
  lastCompositionKeyframes: [] as Array<{
    itemId: string
    properties: Array<{
      property: string
      keyframes: Array<{ frame: number; value: number }>
    }>
  }>,
  lastCompositionMediaSources: [] as string[],
}

/** The presented frame, reactive so the mocked composition re-renders as React's tick did. */
export const mockPlayerFrame = $state({ value: 0 })
