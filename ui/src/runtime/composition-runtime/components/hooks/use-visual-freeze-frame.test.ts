// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { describe, it, expect, beforeEach } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import FreezeProbe from './use-visual-freeze-frame.harness.svelte'

function current() {
  return Number(screen.getByTestId('visual-frame').textContent)
}

describe('useVisualFreezeFrame', () => {
  beforeEach(() => {
    usePlaybackStore.getState().setCompositionVisualFrozen(false)
  })

  it('passes the live frame through when not frozen', async () => {
    const { rerender } = render(FreezeProbe, { frame: 10 })
    expect(current()).toBe(10)
    await rerender({ frame: 25 })
    expect(current()).toBe(25)
  })

  it('holds the last pre-freeze frame while frozen, then snaps back on unfreeze', async () => {
    const { rerender } = render(FreezeProbe, { frame: 100 })
    expect(current()).toBe(100)

    // Freeze: subsequent live-frame changes must be ignored (occluded by overlay).
    usePlaybackStore.getState().setCompositionVisualFrozen(true)
    await rerender({ frame: 130 })
    expect(current()).toBe(100)
    await rerender({ frame: 160 })
    expect(current()).toBe(100)

    // Unfreeze (e.g. playback paused): snap to the current live frame.
    usePlaybackStore.getState().setCompositionVisualFrozen(false)
    flushSync()
    await rerender({ frame: 160 })
    expect(current()).toBe(160)
  })
})
