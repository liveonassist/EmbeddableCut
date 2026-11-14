// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'

import CompactNavigator from './compact-navigator.svelte'

describe('CompactNavigator', () => {
  it('publishes live pan previews and commits once on release', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    const onViewportChange = vi.fn()
    const onViewportPreviewStart = vi.fn()
    const onViewportPreview = vi.fn()

    render(CompactNavigator, {
      viewport: { startFrame: 0, endFrame: 50 },
      currentFrame: 0,
      contentFrameMax: 100,
      minVisibleFrames: 10,
      onViewportChange,
      onViewportPreviewStart,
      onViewportPreview,
    })

    const thumb = screen.getByTestId('keyframe-navigator-thumb')
    const initialLeft = thumb.style.left
    await fireEvent.mouseDown(thumb, { clientX: 0 })
    await fireEvent.mouseMove(window, { clientX: 10 })
    await fireEvent.mouseMove(window, { clientX: 20 })
    await fireEvent.mouseMove(window, { clientX: 30 })

    expect(onViewportChange).not.toHaveBeenCalled()
    expect(onViewportPreviewStart).toHaveBeenCalledTimes(1)
    expect(frameCallbacks).toHaveLength(1)
    expect(onViewportPreview).not.toHaveBeenCalled()
    frameCallbacks.shift()?.(performance.now())
    expect(onViewportPreview).toHaveBeenCalledTimes(1)
    expect(onViewportPreview).not.toHaveBeenLastCalledWith(null)
    expect(thumb.style.left).not.toBe(initialLeft)
    await fireEvent.mouseUp(window)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportPreview).toHaveBeenLastCalledWith(null)

    clientWidthSpy.mockRestore()
    animationFrameSpy.mockRestore()
  })

  it('publishes live resize previews and commits once on release', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    const onViewportChange = vi.fn()
    const onViewportPreview = vi.fn()

    render(CompactNavigator, {
      viewport: { startFrame: 0, endFrame: 50 },
      currentFrame: 0,
      contentFrameMax: 100,
      minVisibleFrames: 10,
      onViewportChange,
      onViewportPreview,
    })

    const thumb = screen.getByTestId('keyframe-navigator-thumb')
    const initialWidth = thumb.style.width
    await fireEvent.mouseDown(screen.getByTestId('keyframe-navigator-right-handle'), {
      clientX: 200,
    })
    await fireEvent.mouseMove(window, { clientX: 210 })
    await fireEvent.mouseMove(window, { clientX: 220 })
    await fireEvent.mouseMove(window, { clientX: 230 })

    expect(onViewportChange).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)
    expect(onViewportPreview).not.toHaveBeenCalled()
    frameCallbacks.shift()?.(performance.now())
    expect(onViewportPreview).toHaveBeenCalledTimes(1)
    expect(onViewportPreview).not.toHaveBeenLastCalledWith(null)
    expect(thumb.style.width).not.toBe(initialWidth)

    await fireEvent.mouseUp(window)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportPreview).toHaveBeenLastCalledWith(null)

    clientWidthSpy.mockRestore()
    animationFrameSpy.mockRestore()
  })

  it('falls back to live viewport changes when no preview callback is provided', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    const onViewportChange = vi.fn()

    render(CompactNavigator, {
      viewport: { startFrame: 0, endFrame: 50 },
      currentFrame: 0,
      contentFrameMax: 100,
      minVisibleFrames: 10,
      onViewportChange,
    })

    await fireEvent.mouseDown(screen.getByTestId('keyframe-navigator-thumb'), { clientX: 0 })
    await fireEvent.mouseMove(window, { clientX: 30 })

    expect(onViewportChange).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks.shift()?.(performance.now())
    expect(onViewportChange).toHaveBeenCalledTimes(1)

    await fireEvent.mouseUp(window)
    clientWidthSpy.mockRestore()
    animationFrameSpy.mockRestore()
  })

  it('holds the final thumb geometry until a deferred viewport commit arrives', async () => {
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    const onViewportChange = vi.fn()
    const initialViewport = { startFrame: 0, endFrame: 50 }

    const { rerender } = render(CompactNavigator, {
      viewport: initialViewport,
      currentFrame: 0,
      contentFrameMax: 100,
      minVisibleFrames: 10,
      onViewportChange,
    })

    const thumb = screen.getByTestId('keyframe-navigator-thumb')
    await fireEvent.mouseDown(thumb, { clientX: 0 })
    await fireEvent.mouseMove(window, { clientX: 40 })
    const finalPreviewLeft = thumb.style.left

    await fireEvent.mouseUp(window)

    expect(finalPreviewLeft).not.toBe('')
    expect(thumb.style.left).toBe(finalPreviewLeft)
    const committedViewport = onViewportChange.mock.calls[0]?.[0]
    expect(committedViewport).toBeDefined()

    await rerender({ viewport: committedViewport })
    expect(thumb.style.left).toBe(finalPreviewLeft)

    clientWidthSpy.mockRestore()
  })
})
