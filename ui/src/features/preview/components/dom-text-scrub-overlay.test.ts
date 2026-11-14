// SPDX-License-Identifier: MIT

import { act, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import type { PlayerRef } from '@/features/preview/deps/player-core'
import DomTextScrubOverlay from './dom-text-scrub-overlay.svelte'
import { playerHandle } from './headless-player.mock-state'

const seekToMock = vi.fn<(frame: number) => void>()

vi.mock('@/features/preview/deps/player-core', async () => ({
  HeadlessPlayer: (await import('./headless-player.harness.svelte')).default,
}))

vi.mock('@/features/preview/deps/composition-runtime-ui', async () => ({
  MainComposition: (await import('./empty.harness.svelte')).default,
}))

describe('DomTextScrubOverlay', () => {
  let rafId = 0
  let rafCallbacks = new Map<number, FrameRequestCallback>()

  const flushAnimationFrames = () => {
    const callbacks = [...rafCallbacks.values()]
    rafCallbacks.clear()
    for (const callback of callbacks) callback(performance.now())
  }

  beforeEach(() => {
    seekToMock.mockReset()
    playerHandle.seekTo = seekToMock
    rafId = 0
    rafCallbacks = new Map()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++rafId
      rafCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id)
    })
    usePlaybackStore.setState({
      currentFrame: 10,
      currentFrameEpoch: 1,
      previewFrame: 10,
      previewFrameEpoch: 1,
      frameUpdateEpoch: 1,
      isPlaying: false,
    })
    usePreviewBridgeStore.setState({ displayedFrame: 10 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for the displayed canvas frame before advancing scrub text', async () => {
    render(DomTextScrubOverlay, {
      props: {
        playerRef: { current: null as PlayerRef | null },
        visible: true,
        durationInFrames: 120,
        fps: 30,
        renderSize: { width: 1920, height: 1080 },
        layoutSize: { width: 1280, height: 720 },
        inputProps: {
          fps: 30,
          width: 1920,
          height: 1080,
          tracks: [],
          transitions: [],
          keyframes: [],
        },
      },
    })

    await act(flushAnimationFrames)
    expect(seekToMock).toHaveBeenLastCalledWith(10)
    seekToMock.mockClear()

    await act(() => {
      usePlaybackStore.getState().setScrubFrame(20)
      flushAnimationFrames()
    })
    expect(seekToMock).not.toHaveBeenCalled()

    await act(() => {
      usePreviewBridgeStore.getState().setDisplayedFrame(20)
      flushAnimationFrames()
    })
    expect(seekToMock).toHaveBeenCalledOnce()
    expect(seekToMock).toHaveBeenLastCalledWith(20)
  })
})
