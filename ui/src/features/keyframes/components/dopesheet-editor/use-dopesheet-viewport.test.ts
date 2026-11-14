// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { useDopesheetViewport } from './use-dopesheet-viewport.svelte'
import ViewportProbe from './use-dopesheet-viewport.harness.svelte'

type ViewportResult = ReturnType<typeof useDopesheetViewport>

describe('useDopesheetViewport', () => {
  it('applies controlled viewport changes in one render', async () => {
    let renderCount = 0
    const hook: { result?: ViewportResult } = {}
    const { rerender } = render(ViewportProbe, {
      frameViewport: { startFrame: 0, endFrame: 120 },
      onRender: () => (renderCount += 1),
      onSetup: (result: ViewportResult) => (hook.result = result),
    })

    expect(renderCount).toBe(1)
    await rerender({ frameViewport: { startFrame: 12, endFrame: 108 } })

    expect(renderCount).toBe(2)
    expect(hook.result!.viewport).toEqual({ startFrame: 12, endFrame: 108 })
  })

  it('notifies the owner without creating controlled local state', () => {
    const onFrameViewportChange = vi.fn()
    let renderCount = 0
    const hook: { result?: ViewportResult } = {}
    render(ViewportProbe, {
      frameViewport: { startFrame: 12, endFrame: 108 },
      onFrameViewportChange,
      onRender: () => (renderCount += 1),
      onSetup: (result: ViewportResult) => (hook.result = result),
    })

    hook.result!.updateViewport({ startFrame: 22, endFrame: 98 })
    flushSync()

    expect(onFrameViewportChange).toHaveBeenCalledWith({ startFrame: 22, endFrame: 98 })
    expect(renderCount).toBe(1)
    expect(hook.result!.viewport).toEqual({ startFrame: 12, endFrame: 108 })
  })

  it('preserves a shared timeline viewport outside the clip bounds', () => {
    const hook: { result?: ViewportResult } = {}
    render(ViewportProbe, {
      frameViewport: { startFrame: -240, endFrame: 360 },
      clampToContent: false,
      onSetup: (result: ViewportResult) => (hook.result = result),
    })

    expect(hook.result!.viewport).toEqual({ startFrame: -240, endFrame: 360 })
  })
})
