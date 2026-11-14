// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { resetAutoKeyframeStore } from '@/features/keyframes/stores/auto-keyframe-store'
import DopesheetEditorHost from './property-groups-ui.harness.svelte'

describe('DopesheetEditor value input commits', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  beforeEach(() => resetAutoKeyframeStore())

  function renderEditor(onPropertyValueCommit = vi.fn()) {
    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      propertyValues: { x: 100 },
      currentFrame: 12,
      width: 640,
      height: 240,
      onPropertyValueCommit,
    })

    return screen.getByRole('spinbutton', { name: 'X Position value at playhead' })
  }

  it('does not allow blur commits to create a keyframe', async () => {
    const onPropertyValueCommit = vi.fn()
    const input = renderEditor(onPropertyValueCommit)

    await fireEvent.focus(input)
    await fireEvent.input(input, { target: { value: '120' } })
    await fireEvent.blur(input)

    expect(onPropertyValueCommit).toHaveBeenCalledTimes(1)
    expect(onPropertyValueCommit).toHaveBeenCalledWith('x', 120, { allowCreate: false })
  })

  it('only allows keyframe creation when Enter is pressed', async () => {
    const onPropertyValueCommit = vi.fn()
    const input = renderEditor(onPropertyValueCommit)

    await fireEvent.focus(input)
    await fireEvent.input(input, { target: { value: '120' } })
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(onPropertyValueCommit).toHaveBeenCalledTimes(1)
    expect(onPropertyValueCommit).toHaveBeenCalledWith('x', 120, { allowCreate: true })
  })

  it('allows blur commits to create a keyframe when row auto-key is enabled', async () => {
    const onPropertyValueCommit = vi.fn()
    const input = renderEditor(onPropertyValueCommit)

    await fireEvent.click(screen.getByRole('button', { name: /enable auto-key for x position/i }))
    await fireEvent.focus(input)
    await fireEvent.input(input, { target: { value: '120' } })
    await fireEvent.blur(input)

    expect(onPropertyValueCommit).toHaveBeenCalledTimes(1)
    expect(onPropertyValueCommit).toHaveBeenCalledWith('x', 120, { allowCreate: true })
  })

  it('does not commit an unchanged value on blur, even when auto-key is enabled', async () => {
    const onPropertyValueCommit = vi.fn()
    const input = renderEditor(onPropertyValueCommit)

    await fireEvent.click(screen.getByRole('button', { name: /enable auto-key for x position/i }))
    await fireEvent.focus(input)
    await fireEvent.blur(input)

    expect(onPropertyValueCommit).not.toHaveBeenCalled()
  })

  it('scrubs the input horizontally with fine-control modifiers and one drag bracket', async () => {
    const onPropertyValuePreview = vi.fn()
    const onPropertyValueCommit = vi.fn()
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()
    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      propertyValues: { x: 100 },
      currentFrame: 12,
      width: 640,
      height: 240,
      onPropertyValueCommit,
      onPropertyValuePreview,
      onDragStart,
      onDragEnd,
    })
    const input = screen.getByRole('spinbutton', { name: 'X Position value at playhead' })

    await fireEvent.focus(input)
    await fireEvent.pointerDown(input, { pointerId: 1, button: 0, clientX: 100 })
    await fireEvent.pointerMove(input, { pointerId: 1, clientX: 110, shiftKey: true })
    await fireEvent.pointerUp(input, { pointerId: 1, clientX: 110, shiftKey: true })
    await fireEvent.blur(input)

    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onPropertyValuePreview).toHaveBeenLastCalledWith('x', 101)
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(onPropertyValueCommit).not.toHaveBeenCalled()
  })
})
