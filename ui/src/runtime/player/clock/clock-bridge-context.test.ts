// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import type { Clock } from '@/runtime/player/clock/Clock'
import ClockBridgeHarness from './clock-bridge-context.harness.svelte'

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('Clock bridge context boundaries', () => {
  it('does not invalidate play-state consumers on frame changes', () => {
    let clock: Clock | null = null
    const playingValues: boolean[] = []
    const playbackValues: boolean[] = []
    const frameValues: number[] = []

    render(ClockBridgeHarness, {
      onClock: (value: Clock) => (clock = value),
      onPlaying: (value: boolean) => playingValues.push(value),
      onPlayback: (value: boolean) => playbackValues.push(value),
      onFrame: (value: number) => frameValues.push(value),
    })

    act(() => clock!.seekToFrame(1))
    act(() => clock!.seekToFrame(2))

    expect(frameValues).toEqual([0, 1, 2])
    expect(playingValues).toEqual([false])
    expect(playbackValues).toEqual([false])

    act(() => clock!.play())
    expect(playingValues).toEqual([false, true])
    expect(playbackValues).toEqual([false, true])
    act(() => clock!.pause())
  })
})
