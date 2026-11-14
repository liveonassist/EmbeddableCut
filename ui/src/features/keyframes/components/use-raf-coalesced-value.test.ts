// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import HookHarness from './hook.harness.svelte'
import { useRafCoalescedValue } from './use-raf-coalesced-value.svelte'

function renderCoalescedHook<T>(onValue: (value: T) => void) {
  const hook: { result?: ReturnType<typeof useRafCoalescedValue<T>> } = {}
  function useValueUnderTest() {
    return useRafCoalescedValue(() => onValue)
  }
  render(HookHarness, {
    setup: useValueUnderTest,
    onSetup: (result: unknown) => (hook.result = result as typeof hook.result),
  })
  return hook.result!
}

describe('useRafCoalescedValue', () => {
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks[id - 1] = () => {}
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('collapses high-frequency values to the latest value in the next frame', () => {
    const values: number[] = []
    const result = renderCoalescedHook((value: number) => values.push(value))

    for (let value = 1; value <= 100; value += 1) result.queue(value)

    expect(values).toEqual([])
    expect(rafCallbacks).toHaveLength(1)

    rafCallbacks[0]?.(16)
    expect(values).toEqual([100])
  })

  it('flushes the final value when an interaction ends', () => {
    const values: number[] = []
    const result = renderCoalescedHook((value: number) => values.push(value))

    result.queue(42)
    result.flushNow()

    expect(values).toEqual([42])
  })

  it('drops a queued value when an interaction is cancelled', () => {
    const values: number[] = []
    const result = renderCoalescedHook((value: number) => values.push(value))

    result.queue(42)
    result.cancel()

    rafCallbacks[0]?.(16)
    expect(values).toEqual([])
  })

  it('delivers null when null is the newest queued value', () => {
    const values: Array<number | null> = []
    const result = renderCoalescedHook<number | null>((value) => values.push(value))

    result.queue(42)
    result.queue(null)
    rafCallbacks[0]?.(16)

    expect(values).toEqual([null])
  })
})
