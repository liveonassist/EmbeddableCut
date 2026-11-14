// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { createRawSnippet, flushSync } from 'svelte'
import { fireEvent, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { Rect } from './use-marquee-selection.svelte'
import MarqueeHarness from './use-marquee-selection.harness.svelte'

function createRect(left: number, top: number, right: number, bottom: number): Rect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

const child = (html: string) => createRawSnippet(() => ({ render: () => html }))

function sizeContainer(container: HTMLElement) {
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 200 },
    clientHeight: { configurable: true, value: 200 },
    getBoundingClientRect: {
      configurable: true,
      value: () => createRect(0, 0, 200, 200),
    },
  })
}

describe('useMarqueeSelection deferred commits', () => {
  let nextAnimationFrameId = 1
  let animationFrameCallbacks = new Map<number, FrameRequestCallback>()

  beforeEach(() => {
    nextAnimationFrameId = 1
    animationFrameCallbacks = new Map()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId
      nextAnimationFrameId += 1
      animationFrameCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrameCallbacks.delete(id)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function flushAnimationFrames() {
    const callbacks = Array.from(animationFrameCallbacks.values())
    animationFrameCallbacks.clear()
    for (const callback of callbacks) {
      callback(performance.now())
    }
    flushSync()
  }

  function fire(fn: () => void) {
    fn()
    flushSync()
  }

  it('updates the lightweight preview during drag and commits global selection once on mouseup', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onPreviewSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onPreviewSelectionChange,
      onGestureEnd,
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()

    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(1, [])
    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(2, ['clip-1'])
    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()

    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(3, ['clip-1', 'clip-2'])
    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).toHaveBeenCalledTimes(1)
    expect(onGestureEnd.mock.calls[0]?.[1]).toBe(true)
    expect(onPreviewSelectionChange).toHaveBeenLastCalledWith([])
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith(['clip-1', 'clip-2'])
  })

  it('keeps global selection frozen during a release-only canvas marquee', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, { onSelectionChange, onGestureEnd })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()

    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith(['clip-1', 'clip-2'])
  })

  it('does not claim a drag that starts on a playhead handle', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onPreviewSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onPreviewSelectionChange,
      onGestureEnd,
      children: child('<div data-playhead-handle data-testid="playhead-handle"></div>'),
    })
    const container = getByTestId('marquee-container')
    const playheadHandle = getByTestId('playhead-handle')
    sizeContainer(container)

    fireEvent.mouseDown(playheadHandle, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onPreviewSelectionChange).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('cancels an active drag on window blur instead of carrying it into the next gesture', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onPreviewSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const onGestureCancel = vi.fn<(wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onPreviewSelectionChange,
      onGestureEnd,
      onGestureCancel,
      children: child('<div class="timeline-ruler" data-testid="timeline-ruler"></div>'),
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()

    expect(container).toHaveAttribute('data-marquee-active', 'true')

    fire(() => fireEvent.blur(window))

    expect(container).toHaveAttribute('data-marquee-active', 'false')
    expect(onGestureCancel).toHaveBeenCalledWith(true)
    expect(onPreviewSelectionChange).toHaveBeenLastCalledWith([])
    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseDown(getByTestId('timeline-ruler'), { button: 0, clientX: 75, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 120, clientY: 50 })
    flushAnimationFrames()
    fire(() => fireEvent.mouseUp(document, { clientX: 120, clientY: 50 }))

    expect(container).toHaveAttribute('data-marquee-active', 'false')
    expect(onGestureCancel).toHaveBeenCalledTimes(1)
    expect(onGestureEnd).not.toHaveBeenCalled()
  })

  it('drops a stale drag before an excluded surface starts a new interaction', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const onGestureCancel = vi.fn<(wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onGestureEnd,
      onGestureCancel,
      children: child('<div class="timeline-ruler" data-testid="timeline-ruler"></div>'),
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()

    expect(container).toHaveAttribute('data-marquee-active', 'true')

    fireEvent.mouseDown(getByTestId('timeline-ruler'), { button: 0, clientX: 75, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 120, clientY: 50 })
    flushAnimationFrames()
    fire(() => fireEvent.mouseUp(document, { clientX: 120, clientY: 50 }))

    expect(container).toHaveAttribute('data-marquee-active', 'false')
    expect(onGestureCancel).toHaveBeenCalledWith(true)
    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('never starts marquee from an interaction shield', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onGestureEnd,
      children: child('<div data-marquee-ignore data-testid="interaction-shield"></div>'),
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(getByTestId('interaction-shield'), {
      button: 0,
      clientX: 75,
      clientY: 75,
    })
    fireEvent.mouseMove(document, { clientX: 140, clientY: 140 })
    flushAnimationFrames()
    fire(() => fireEvent.mouseUp(document, { clientX: 140, clientY: 140 }))

    expect(container).toHaveAttribute('data-marquee-active', 'false')
    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('restores the committed selection when cancellation follows a throttled live commit', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      committedSelectionIds: ['previous-selection'],
      liveCommitThrottleMs: 66,
      onSelectionChange,
      onGestureEnd,
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()

    expect(onSelectionChange).toHaveBeenCalledWith(['clip-1'])

    fire(() => fireEvent.blur(window))

    expect(onSelectionChange).toHaveBeenLastCalledWith(['previous-selection'])
    expect(onSelectionChange).toHaveBeenCalledTimes(2)
    expect(onGestureEnd).not.toHaveBeenCalled()
  })

  it('uses a batch geometry resolver for data-driven item surfaces', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      useBatchResolver: true,
      onSelectionChange,
      onGestureEnd,
    })
    const container = getByTestId('marquee-container')
    sizeContainer(container)

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()
    fireEvent.mouseUp(document, { clientX: 50, clientY: 50 })

    expect(onSelectionChange).toHaveBeenCalledWith(['clip-2'])
  })

  it('does not claim a drag that starts on a compact density clip', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(MarqueeHarness, {
      onSelectionChange,
      onGestureEnd,
      children: child('<div data-timeline-density-bucket data-testid="density-bucket"></div>'),
    })

    fireEvent.mouseDown(getByTestId('density-bucket'), { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
  })
})
