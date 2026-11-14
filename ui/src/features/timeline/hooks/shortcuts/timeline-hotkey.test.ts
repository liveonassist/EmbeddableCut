// SPDX-License-Identifier: MIT
// oxlint-disable react-hooks/rules-of-hooks -- hooks run in an effect root, not a component

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import { renderHook } from '../../test/render-hook.svelte'
import { useTimelineHotkey, type TimelineHotkeyOptions } from './timeline-hotkey'

const cleanups: Array<() => void> = []

function register(keys: string, options?: TimelineHotkeyOptions) {
  const handler = vi.fn()
  const { unmount } = renderHook(() =>
    useTimelineHotkey(() => keys, handler, options ? () => options : undefined),
  )
  cleanups.push(unmount)
  return handler
}

function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function mount<E extends HTMLElement>(element: E): E {
  document.body.append(element)
  cleanups.push(() => element.remove())
  return element
}

describe('useTimelineHotkey', () => {
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  it('skips targets with a form role and keeps their default action', () => {
    const handler = register('right')
    const slider = mount(document.createElement('div'))
    slider.setAttribute('role', 'slider')
    const plain = mount(document.createElement('div'))

    const onSlider = press(slider, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(handler).not.toHaveBeenCalled()
    expect(onSlider.defaultPrevented).toBe(false)

    const onPlain = press(plain, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(onPlain.defaultPrevented).toBe(true)
  })

  it('fires in inputs with enableOnFormTags but never in contenteditable', () => {
    const handler = register('mod+z', { ...HOTKEY_OPTIONS, enableOnFormTags: true })
    const input = mount(document.createElement('input'))
    const editable = mount(document.createElement('div'))
    // jsdom doesn't implement isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    press(input, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    const inEditable = press(editable, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(inEditable.defaultPrevented).toBe(false)
  })

  it('requires shift to match for space and punctuation', () => {
    const handler = register('space')
    const target = mount(document.createElement('div'))

    const shifted = press(target, { key: ' ', code: 'Space', shiftKey: true })
    expect(handler).not.toHaveBeenCalled()
    expect(shifted.defaultPrevented).toBe(false)

    press(target, { key: ' ', code: 'Space' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops listening while disabled', () => {
    const handler = register('s', { ...HOTKEY_OPTIONS, enabled: false })
    press(mount(document.createElement('div')), { key: 's', code: 'KeyS' })
    expect(handler).not.toHaveBeenCalled()
  })
})
