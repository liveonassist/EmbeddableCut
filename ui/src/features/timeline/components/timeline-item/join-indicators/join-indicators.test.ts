// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import JoinIndicatorsHarness from './join-indicators.harness.svelte'

function act(fn: () => void): void {
  fn()
  flushSync()
}

describe('TimelineJoinIndicatorsZoomGate', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
    useZoomStore.setState({
      level: 50,
      pixelsPerSecond: 5000,
      contentLevel: 50,
      contentPixelsPerSecond: 5000,
      isZoomInteracting: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('demotes a saturated zoom-out cohort before the settled store catches up', () => {
    const view = render(JoinIndicatorsHarness)
    expect(view.container.querySelectorAll('[title]')).toHaveLength(2)

    act(() => {
      useZoomStore.setState({
        level: 0.1,
        pixelsPerSecond: 10,
        isZoomInteracting: true,
      })
    })

    expect(view.container.querySelectorAll('[title]')).toHaveLength(0)

    act(() => {
      useZoomStore.setState({
        contentLevel: 0.1,
        contentPixelsPerSecond: 10,
        isZoomInteracting: false,
      })
    })

    expect(view.container.querySelectorAll('[title]')).toHaveLength(0)
  })

  it('restores indicators after a net-zero zoom reversal', async () => {
    const view = render(JoinIndicatorsHarness)
    expect(view.container.querySelectorAll('[title]')).toHaveLength(2)

    act(() => {
      useZoomStore.setState({
        level: 0.1,
        pixelsPerSecond: 10,
        isZoomInteracting: true,
      })
    })
    expect(view.container.querySelectorAll('[title]')).toHaveLength(0)

    act(() => {
      useZoomStore.setState({
        level: 50,
        pixelsPerSecond: 5000,
        isZoomInteracting: true,
      })
      useZoomStore.setState({
        contentLevel: 50,
        contentPixelsPerSecond: 5000,
        isZoomInteracting: false,
      })
    })

    await waitFor(() => {
      expect(view.container.querySelectorAll('[title]')).toHaveLength(2)
    })
  })
})
