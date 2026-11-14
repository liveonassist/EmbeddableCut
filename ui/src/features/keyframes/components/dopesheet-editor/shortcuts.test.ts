// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/svelte'
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import DopesheetEditorHost from './property-groups-ui.harness.svelte'

const SHORTCUTS = {
  addKeyframe: 'k',
  previousKeyframe: 'alt+bracketleft',
  nextKeyframe: 'alt+bracketright',
  toggleAutoKey: 'a',
  fitKeyframes: 'f',
}

describe('DopesheetEditor shortcuts', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('adds a keyframe through the active property handler', async () => {
    const onAddKeyframe = vi.fn()

    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      selectedProperty: 'x',
      currentFrame: 24,
      width: 640,
      height: 240,
      onAddKeyframe,
      shortcutsEnabled: true,
      shortcuts: SHORTCUTS,
    })

    await fireEvent.keyDown(document, { key: 'k', code: 'KeyK' })

    expect(onAddKeyframe).toHaveBeenCalledWith('x', 24)
  })

  it('does not remove an existing keyframe when adding with the shortcut', async () => {
    const onAddKeyframe = vi.fn()
    const onRemoveKeyframes = vi.fn()

    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-1', frame: 24, value: 100, easing: 'linear' }],
      },
      selectedProperty: 'x',
      currentFrame: 24,
      width: 640,
      height: 240,
      onAddKeyframe,
      onRemoveKeyframes,
      shortcutsEnabled: true,
      shortcuts: SHORTCUTS,
    })

    await fireEvent.keyDown(document, { key: 'k', code: 'KeyK' })

    expect(onAddKeyframe).not.toHaveBeenCalled()
    expect(onRemoveKeyframes).not.toHaveBeenCalled()
  })

  it('does not fire editor shortcuts while they are out of scope', async () => {
    const onAddKeyframe = vi.fn()

    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: { x: [] },
      selectedProperty: 'x',
      currentFrame: 24,
      width: 640,
      height: 240,
      onAddKeyframe,
      shortcutsEnabled: false,
      shortcuts: SHORTCUTS,
    })

    await fireEvent.keyDown(document, { key: 'k', code: 'KeyK' })

    expect(onAddKeyframe).not.toHaveBeenCalled()
  })

  it('keeps only the Edit add shortcut active outside editor focus', async () => {
    const onAddKeyframe = vi.fn()
    const onNavigateToKeyframe = vi.fn()

    render(DopesheetEditorHost, {
      itemId: 'item-1',
      keyframesByProperty: {
        x: [{ id: 'kf-1', frame: 8, value: 100, easing: 'linear' }],
      },
      selectedProperty: 'x',
      currentFrame: 24,
      width: 640,
      height: 240,
      onAddKeyframe,
      onNavigateToKeyframe,
      shortcutsEnabled: false,
      addKeyframeShortcutEnabled: true,
      shortcuts: SHORTCUTS,
    })

    await fireEvent.keyDown(document, { key: 'k', code: 'KeyK' })
    await fireEvent.keyDown(document, {
      key: '[',
      code: 'BracketLeft',
      altKey: true,
    })

    expect(onAddKeyframe).toHaveBeenCalledWith('x', 24)
    expect(onNavigateToKeyframe).not.toHaveBeenCalled()
  })
})
