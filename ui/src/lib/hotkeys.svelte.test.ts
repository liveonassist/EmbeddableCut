// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import { setHotkeyScope, useHotkeys, type HotkeyOptions } from './hotkeys.svelte'

const cleanups: Array<() => void> = []

function register(keys: string, options: HotkeyOptions = HOTKEY_OPTIONS) {
  const handler = vi.fn()
  cleanups.push(
    $effect.root(() =>
      useHotkeys(
        () => keys,
        handler,
        () => options,
      ),
    ),
  )
  flushSync()
  return handler
}

function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function mount<E extends HTMLElement>(element: E): E {
  document.body.append(element)
  cleanups.push(() => element.remove())
  return element
}

const div = () => mount(document.createElement('div'))

describe('useHotkeys', () => {
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    setHotkeyScope(null)
  })

  it('matches keys by position, not by layout', () => {
    const handler = register('bracketleft')
    // A French AZERTY keyboard types '^' on the US '[' key.
    press(div(), { key: '^', code: 'BracketLeft' })
    press(div(), { key: '[', code: 'Digit5' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('takes either Ctrl or Cmd for mod, and exact modifiers otherwise', () => {
    const undo = register('mod+z')
    press(div(), { key: 'z', code: 'KeyZ', ctrlKey: true })
    press(div(), { key: 'z', code: 'KeyZ', metaKey: true })
    press(div(), { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true })
    expect(undo).toHaveBeenCalledTimes(2)

    const join = register('shift+j')
    press(div(), { key: 'j', code: 'KeyJ' })
    press(div(), { key: 'J', code: 'KeyJ', shiftKey: true, metaKey: true })
    press(div(), { key: 'J', code: 'KeyJ', shiftKey: true })
    expect(join).toHaveBeenCalledTimes(1)
  })

  it('requires shift to match for space and punctuation', () => {
    const handler = register('space')
    const shifted = press(div(), { key: ' ', code: 'Space', shiftKey: true })
    expect(handler).not.toHaveBeenCalled()
    expect(shifted.defaultPrevented).toBe(false)

    press(div(), { key: ' ', code: 'Space' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('skips form fields and form roles, keeping their default action', () => {
    const handler = register('right')
    const slider = div()
    slider.setAttribute('role', 'slider')

    const onSlider = press(slider, { key: 'ArrowRight', code: 'ArrowRight' })
    press(mount(document.createElement('input')), { key: 'ArrowRight', code: 'ArrowRight' })
    expect(handler).not.toHaveBeenCalled()
    expect(onSlider.defaultPrevented).toBe(false)

    const onPlain = press(div(), { key: 'ArrowRight', code: 'ArrowRight' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(onPlain.defaultPrevented).toBe(true)
  })

  it('fires in inputs with enableOnFormTags but in contenteditable only when asked', () => {
    const handler = register('mod+z', { ...HOTKEY_OPTIONS, enableOnFormTags: true })
    const editable = div()
    // jsdom doesn't implement isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    press(mount(document.createElement('input')), { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    const inEditable = press(editable, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(inEditable.defaultPrevented).toBe(false)

    const rich = register('mod+b', { enableOnContentEditable: true })
    press(editable, { key: 'b', code: 'KeyB', metaKey: true })
    expect(rich).toHaveBeenCalledTimes(1)
  })

  it('sees fields inside a shadow root as fields', () => {
    const handler = register('k')
    const host = div()
    const input = document.createElement('input')
    host.attachShadow({ mode: 'open' }).append(input)

    press(input, { key: 'k', code: 'KeyK' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs before propagation stops when it listens in the capture phase', () => {
    const bubbling = register('k')
    const capturing = register('j', {
      ...HOTKEY_OPTIONS,
      eventListenerOptions: { capture: true },
    })
    const target = div()
    target.addEventListener('keydown', (event) => event.stopPropagation())

    press(target, { key: 'k', code: 'KeyK' })
    press(target, { key: 'j', code: 'KeyJ' })
    expect(bubbling).not.toHaveBeenCalled()
    expect(capturing).toHaveBeenCalledTimes(1)
  })

  it('stops listening while disabled, and swallows the keys a predicate refuses', () => {
    const off = register('s', { ...HOTKEY_OPTIONS, enabled: false })
    const unrelated = press(div(), { key: 's', code: 'KeyS' })
    expect(off).not.toHaveBeenCalled()
    expect(unrelated.defaultPrevented).toBe(false)

    const refused = register('d', { enabled: () => false })
    const event = press(div(), { key: 'd', code: 'KeyD' })
    expect(refused).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores keys from outside its scope', () => {
    const handler = register('m')
    const editor = div()
    setHotkeyScope(editor)

    press(div(), { key: 'm', code: 'KeyM' })
    press(mount(document.createElement('span')), { key: 'm', code: 'KeyM' })
    expect(handler).not.toHaveBeenCalled()
    press(editor.appendChild(document.createElement('span')), { key: 'm', code: 'KeyM' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
