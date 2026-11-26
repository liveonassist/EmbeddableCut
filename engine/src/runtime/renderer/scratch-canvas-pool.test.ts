// SPDX-License-Identifier: MIT
// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { acquireScratchCanvas, releaseScratchCanvas } from './scratch-canvas-pool'

beforeAll(() => {
  class FakeCanvas {
    private readonly ctx = { reset: vi.fn() }
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return this.ctx
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
})

describe('scratch canvases', () => {
  it('reuses a released canvas, cleared, but never one still held', () => {
    const first = acquireScratchCanvas(320, 180)!
    const held = acquireScratchCanvas(320, 180)!
    expect(held.canvas).not.toBe(first.canvas)

    releaseScratchCanvas(first.canvas)
    const again = acquireScratchCanvas(320, 180)!
    expect(again.canvas).toBe(first.canvas)
    expect(again.ctx.reset).toHaveBeenCalledTimes(1)

    releaseScratchCanvas(again.canvas)
    const resized = acquireScratchCanvas(64, 48)!
    expect(resized.canvas).toBe(first.canvas)
    expect([resized.canvas.width, resized.canvas.height]).toEqual([64, 48])
  })
})
