// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ClientRenderResult } from '@/features/export/deps/renderer'
import type { useExportDialogView } from './use-export-dialog-view.svelte'
import Harness from './use-export-dialog-view.harness.svelte'

type View = ReturnType<typeof useExportDialogView>

function result(overrides: Partial<ClientRenderResult> = {}): ClientRenderResult {
  return {
    blob: new Blob(['video']),
    mimeType: 'video/mp4',
    duration: 10,
    fileSize: 1024,
    ...overrides,
  }
}

function setup(overrides: { status?: string; result?: ClientRenderResult | null } = {}) {
  const resetState = vi.fn()
  const onClose = vi.fn()
  let view!: View
  const options = {
    status: overrides.status ?? 'idle',
    result: overrides.result ?? null,
    resetState,
    onClose,
  }
  const rendered = render(Harness, {
    ...options,
    expose: (exposed: View) => {
      view = exposed
    },
  })
  flushSync()
  const rerender = (props: Partial<typeof options>) => {
    void rendered.rerender(props)
    flushSync()
  }

  return { view, rerender, resetState, onClose, options }
}

/** React's `act`: run a change and flush the effects it schedules. */
function act(fn: () => void) {
  fn()
  flushSync()
}

describe('useExportDialogView', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  it('starts on the settings step', () => {
    const { view } = setup()

    expect(view.view).toBe('settings')
    expect(view.preventClose).toBe(false)
    expect(view.elapsedSeconds).toBe(0)
    expect(view.previewUrl).toBeNull()
    expect(view.isVideoResult).toBe(false)
  })

  it('advances to the step the render status reports', () => {
    const { view, rerender } = setup()

    rerender({ status: 'completed' })
    expect(view.view).toBe('complete')

    rerender({ status: 'failed' })
    expect(view.view).toBe('error')

    rerender({ status: 'cancelled' })
    expect(view.view).toBe('cancelled')
  })

  it('blocks closing while the export is running, and lets every other step close', () => {
    const { view, onClose, resetState } = setup()

    act(() => view.setView('progress'))
    act(() => view.handleClose())
    expect(view.view).toBe('progress')
    expect(onClose).not.toHaveBeenCalled()
    expect(resetState).not.toHaveBeenCalled()

    act(() => view.setView('complete'))
    act(() => view.handleClose())
    expect(view.view).toBe('settings')
    expect(resetState).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('counts elapsed seconds while the export runs, and forgets them afterwards', () => {
    vi.useFakeTimers()
    try {
      const { view } = setup()

      act(() => view.setView('progress'))
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(view.elapsedSeconds).toBe(3)
      expect(view.preventClose).toBe(true)

      act(() => view.resetView())
      expect(view.view).toBe('settings')
      expect(view.elapsedSeconds).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the timing when the dialog returns to the settings step', () => {
    vi.useFakeTimers()
    try {
      const { view } = setup()

      act(() => view.setView('progress'))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      act(() => view.setView('settings'))

      expect(view.elapsedSeconds).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('previews the finished render and revokes the URL when it is replaced or dropped', () => {
    const { view, rerender } = setup()

    rerender({ result: result() })
    expect(view.previewUrl).toBe('blob:preview')
    expect(view.isVideoResult).toBe(true)

    rerender({ result: result({ mimeType: 'audio/mpeg' }) })
    expect(view.isVideoResult).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)

    rerender({ result: null })
    expect(view.previewUrl).toBeNull()
  })
})
