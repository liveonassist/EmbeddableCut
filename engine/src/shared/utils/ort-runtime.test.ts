// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { getWasmThreadCount } from './ort-runtime'

describe('getWasmThreadCount', () => {
  it.each([
    [32, 8],
    [8, 4],
    [2, 1],
    [1, 1],
    [undefined, 1],
  ])('of %s logical processors, uses %s', (hardwareConcurrency, threads) => {
    expect(getWasmThreadCount({ crossOriginIsolated: true, hardwareConcurrency })).toBe(threads)
  })

  it('uses one thread where memory cannot be shared', () => {
    expect(getWasmThreadCount({ crossOriginIsolated: false, hardwareConcurrency: 32 })).toBe(1)
  })
})
