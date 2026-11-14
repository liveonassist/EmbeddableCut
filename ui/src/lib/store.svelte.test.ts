// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { create } from '@/shared/state/bound-store'
import { useStoreSelector } from '@/runtime/use-sync-external-store.svelte'
import { select } from './store.svelte'

interface CanvasState {
  size: { width: number; height: number }
  setSize: (width: number, height: number) => void
}

const useCanvasStore = create<CanvasState>((set) => ({
  size: { width: 0, height: 0 },
  setSize: (width, height) => set({ size: { width, height } }),
}))

const cleanups: Array<() => void> = []

describe('store listeners', () => {
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  it("never make an effect that writes a store depend on the store's subscribers", () => {
    let runs = 0
    let width = $state(1920)
    cleanups.push(
      $effect.root(() => {
        // Subscribers whose listeners read reactive state: a version counter, a selector.
        const viaSync = useStoreSelector(useCanvasStore, (s) => s.size.width)
        const viaSelect = select(useCanvasStore, (s) => s.size)
        $effect(() => {
          void viaSync.current
          void viaSelect.current
        })
        // The writer: re-running on its own notification loops until Svelte gives up.
        $effect(() => {
          runs += 1
          useCanvasStore.getState().setSize(width, 1080)
        })
      }),
    )
    flushSync()
    expect(runs).toBe(1)

    width = 1280
    flushSync()
    expect(runs).toBe(2)
    expect(useCanvasStore.getState().size).toEqual({ width: 1280, height: 1080 })
  })
})
