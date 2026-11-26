// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it, vi } from 'vite-plus/test'
import { persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import { createUnchangedSkippingStorage } from './unchanged-skipping-storage'

describe('createUnchangedSkippingStorage', () => {
  it('writes only when the persisted slice changes', () => {
    const backing = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }
    const store = createStore<{ frame: number; volume: number }>()(
      persist(() => ({ frame: 0, volume: 1 }), {
        name: 'test',
        storage: createUnchangedSkippingStorage(() => backing),
        partialize: (state) => ({ volume: state.volume }),
      }),
    )
    store.setState({ frame: 1 })
    backing.setItem.mockClear()

    for (let frame = 2; frame <= 60; frame++) store.setState({ frame })
    store.setState({ volume: 0.5 })
    store.setState({ frame: 61 })

    expect(backing.setItem).toHaveBeenCalledOnce()
    expect(JSON.parse(backing.setItem.mock.calls[0]![1] as string).state).toEqual({ volume: 0.5 })
  })
})
