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

describe('select', () => {
  it('holds one subscription while read, and picks up what changed while unread', async () => {
    let listeners = 0
    const counted = {
      getState: useCanvasStore.getState,
      subscribe: (listener: (state: CanvasState, previous: CanvasState) => void) => {
        listeners += 1
        const stop = useCanvasStore.subscribe(listener)
        return () => {
          listeners -= 1
          stop()
        }
      },
    }
    useCanvasStore.getState().setSize(1, 1)
    const width = select(counted, (s) => s.size.width)
    const seen: number[] = []
    let show = $state(true)
    const stop = $effect.root(() => {
      $effect(() => {
        if (!show) return
        for (let i = 0; i < 3; i++) void width.current
        seen.push(width.current)
      })
    })
    flushSync()
    expect(listeners).toBe(1)

    useCanvasStore.getState().setSize(2, 1)
    flushSync()
    expect(seen).toEqual([1, 2])

    show = false
    flushSync()
    await Promise.resolve()
    expect(listeners).toBe(0)

    useCanvasStore.getState().setSize(3, 1)
    show = true
    flushSync()
    expect(seen).toEqual([1, 2, 3])
    expect(listeners).toBe(1)
    stop()
  })
})
