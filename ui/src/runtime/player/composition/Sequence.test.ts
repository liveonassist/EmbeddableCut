// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import type { Clock } from '@/runtime/player/clock/Clock'
import SequenceHarness from './Sequence.harness.svelte'

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('Sequence frame subscriptions', () => {
  it('keeps premounted children stable until the sequence becomes active', () => {
    let clock: Clock | null = null
    const childFrames: number[] = []

    render(SequenceHarness, {
      onClock: (value: Clock) => (clock = value),
      onFrame: (frame: number) => childFrames.push(frame),
    })

    expect(clock).not.toBeNull()
    expect(childFrames).toEqual([])

    act(() => clock!.seekToFrame(75))
    expect(childFrames).toEqual([-1])

    act(() => {
      clock!.seekToFrame(76)
      clock!.seekToFrame(90)
      clock!.seekToFrame(99)
    })
    expect(childFrames).toEqual([-1])

    act(() => clock!.seekToFrame(100))
    act(() => clock!.seekToFrame(101))
    expect(childFrames).toEqual([-1, 0, 1])

    act(() => clock!.seekToFrame(120))
    expect(childFrames).toHaveLength(3)
  })
})
