// SPDX-License-Identifier: MIT

/**
 * Keyboard shortcuts, the port of react-hotkeys-hook 5's `useHotkeys` with its
 * matching rules, so FreeCut's key strings (`space`, `mod+z`,
 * `shift+bracketleft`, comma-separated alternatives) and options behave as
 * they do there:
 * - Keys match by physical position (`event.code`), not by layout.
 * - `mod` is satisfied by Ctrl or Cmd on every platform; otherwise Ctrl, Cmd,
 *   Alt and Shift must match exactly.
 * - Form fields, and elements with a form role (slider, menuitem, textbox, …),
 *   don't trigger shortcuts unless `enableOnFormTags` allows them;
 *   contenteditable doesn't unless `enableOnContentEditable`.
 * - A matched shortcut prevents the default action (with `preventDefault`)
 *   even when `enabled` returns false, and then stops the event.
 *
 * Call it while a component initializes; it listens while the component is
 * mounted. An embedded editor scopes shortcuts to itself (`setHotkeyScope`),
 * so keys pressed in the host page never reach it. Form checks look at the
 * event's composed target, so fields inside a shadow root count as fields.
 */

type HotkeyPredicate = (event: KeyboardEvent) => boolean

export interface HotkeyOptions {
  /** `false` stops listening; a function decides per matched event. */
  enabled?: boolean | HotkeyPredicate
  /** Fire inside form fields too, or only in those with these tag names or roles. */
  enableOnFormTags?: boolean | readonly string[]
  enableOnContentEditable?: boolean
  preventDefault?: boolean | HotkeyPredicate
  keyup?: boolean
  keydown?: boolean
  eventListenerOptions?: AddEventListenerOptions
}

type MaybeGetter<T> = T | (() => T)

let scope: Node | null = null

/** Limits every shortcut to events from inside `root`; `null` listens to the whole page. */
export function setHotkeyScope(root: Node | null): void {
  scope = root
}

const MODIFIERS = ['shift', 'alt', 'meta', 'mod', 'ctrl', 'control']
const MODIFIER_KEYS = ['shift', 'alt', 'meta', 'os', 'ctrl', 'control', 'unknown']

const ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  MetaLeft: 'meta',
  MetaRight: 'meta',
  OSLeft: 'meta',
  OSRight: 'meta',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
}

const FORM_TAGS_AND_ROLES = [
  'input',
  'textarea',
  'select',
  'searchbox',
  'slider',
  'spinbutton',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'textbox',
]

/** A key string or an `event.code` in react-hotkeys-hook's names (`KeyZ` → `z`). */
function keyName(key: string): string {
  return (ALIASES[key.trim()] ?? key.trim()).toLowerCase().replace(/key|digit|numpad/, '')
}

interface Combo {
  keys: string[]
  mod: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

function parse(keys: string): Combo[] {
  return keys
    .toLowerCase()
    .split(',')
    .filter((combo) => combo.trim())
    .map((combo) => {
      const parts = combo.trim().split('+').map(keyName)
      return {
        keys: parts.filter((part) => !MODIFIERS.includes(part)),
        mod: parts.includes('mod'),
        ctrl: parts.includes('ctrl') || parts.includes('control'),
        meta: parts.includes('meta'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
      }
    })
}

function matches(combo: Combo, event: KeyboardEvent): boolean {
  const key = keyName(event.code)
  if (!combo.keys.includes(key) && !MODIFIER_KEYS.includes(key)) return false
  if (
    (combo.alt !== event.altKey && key !== 'alt') ||
    (combo.shift !== event.shiftKey && key !== 'shift')
  )
    return false
  if (combo.mod) {
    if (!event.metaKey && !event.ctrlKey) return false
  } else if (
    (combo.meta !== event.metaKey && key !== 'meta' && key !== 'os') ||
    (combo.ctrl !== event.ctrlKey && key !== 'ctrl' && key !== 'control')
  ) {
    return false
  }
  return combo.keys.length === 1 ? combo.keys[0] === key : combo.keys.length === 0
}

function composedTarget(event: KeyboardEvent): EventTarget | null {
  return event.composedPath()[0] ?? event.target
}

function isFormTarget(target: EventTarget | null, tags: readonly string[]): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  const role = target.getAttribute('role')
  return tags.some((entry) => entry.toLowerCase() === tag || entry === role)
}

function stop(event: KeyboardEvent): void {
  event.stopPropagation()
  event.preventDefault()
  event.stopImmediatePropagation()
}

export function useHotkeys(
  keys: MaybeGetter<string | readonly string[]>,
  handler: (event: KeyboardEvent) => void,
  options: MaybeGetter<HotkeyOptions> = {},
): void {
  $effect(() => {
    const value = typeof keys === 'function' ? keys() : keys
    const combos = parse(Array.isArray(value) ? value.join(',') : (value as string))
    const opts = typeof options === 'function' ? options() : options
    if (opts.enabled === false || combos.length === 0) return

    const listen = (event: KeyboardEvent) => {
      if (scope && !event.composedPath().includes(scope)) return
      const target = composedTarget(event)
      const formTags = opts.enableOnFormTags
      if (
        isFormTarget(target, FORM_TAGS_AND_ROLES) &&
        !(formTags === true || (Array.isArray(formTags) && isFormTarget(target, formTags)))
      )
        return
      if (
        target instanceof HTMLElement &&
        target.isContentEditable &&
        !opts.enableOnContentEditable
      )
        return
      if (!combos.some((combo) => matches(combo, event))) return
      const prevent = opts.preventDefault
      if (prevent === true || (typeof prevent === 'function' && prevent(event)))
        event.preventDefault()
      const enabled = opts.enabled
      if (typeof enabled === 'function' && !enabled(event)) {
        stop(event)
        return
      }
      handler(event)
    }
    const onKeydown = (event: KeyboardEvent) => {
      if ((opts.keydown === undefined && opts.keyup !== true) || opts.keydown) listen(event)
    }
    const onKeyup = (event: KeyboardEvent) => {
      if (opts.keyup) listen(event)
    }
    const listenerOptions = opts.eventListenerOptions
    document.addEventListener('keydown', onKeydown, listenerOptions)
    document.addEventListener('keyup', onKeyup, listenerOptions)
    return () => {
      document.removeEventListener('keydown', onKeydown, listenerOptions)
      document.removeEventListener('keyup', onKeyup, listenerOptions)
    }
  })
}
