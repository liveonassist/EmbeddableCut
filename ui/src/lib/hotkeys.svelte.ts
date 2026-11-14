// SPDX-License-Identifier: MIT

/**
 * Keyboard shortcuts, the port of react-hotkeys-hook's `useHotkeys`: the same
 * key strings (`space`, `mod+z`, `shift+arrowleft`, comma-separated
 * alternatives) and options. Call it while a component initializes; it
 * listens while the component is mounted.
 *
 * An embedded editor scopes shortcuts to itself (`setHotkeyScope`), so keys
 * pressed in the host page around it never reach the editor.
 */

export interface HotkeyOptions {
  enabled?: boolean
  /** Fire inside inputs, textareas, selects and contenteditable too. */
  enableOnFormTags?: boolean
  preventDefault?: boolean
  keyup?: boolean
  keydown?: boolean
}

type MaybeGetter<T> = T | (() => T)

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)
let scope: Node | null = null

/** Limits every shortcut to events from inside `root`; `null` listens to the whole page. */
export function setHotkeyScope(root: Node | null): void {
  scope = root
}

const ALIASES: Record<string, string> = {
  space: ' ',
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  plus: '+',
  comma: ',',
  period: '.',
  slash: '/',
}

interface Combo {
  key: string
  mod: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

function parse(keys: string): Combo[] {
  return keys
    .split(',')
    .map((combo) => combo.trim().toLowerCase())
    .filter(Boolean)
    .map((combo) => {
      const parts = combo.split('+')
      // A trailing '+' means the plus key itself.
      const key = combo.endsWith('++') ? '+' : (parts.pop() ?? '')
      const has = (name: string) => parts.includes(name)
      return {
        key: ALIASES[key] ?? key,
        mod: has('mod'),
        ctrl: has('ctrl') || has('control'),
        meta: has('meta') || has('cmd') || has('command'),
        shift: has('shift'),
        alt: has('alt') || has('option'),
      }
    })
}

/** The key an event names, by layout (`event.key`) and by position (`event.code`). */
function keysOf(event: KeyboardEvent): string[] {
  const names = [event.key.toLowerCase()]
  const code = event.code
  if (code.startsWith('Key')) names.push(code.slice(3).toLowerCase())
  else if (code.startsWith('Digit')) names.push(code.slice(5))
  else if (code) names.push(code.toLowerCase())
  return names
}

function matches(combo: Combo, event: KeyboardEvent): boolean {
  const wantCtrl = combo.ctrl || (combo.mod && !isMac)
  const wantMeta = combo.meta || (combo.mod && isMac)
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta || event.altKey !== combo.alt)
    return false
  // Shifted symbols ('?') arrive with shift held; only letters and named keys care.
  if (
    combo.shift !== event.shiftKey &&
    (combo.shift || combo.key.length > 1 || /[a-z0-9]/.test(combo.key))
  ) {
    return false
  }
  return keysOf(event).includes(combo.key)
}

function isFormTarget(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0]
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
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
      if (!opts.enableOnFormTags && isFormTarget(event)) return
      if (!combos.some((combo) => matches(combo, event))) return
      if (opts.preventDefault) event.preventDefault()
      handler(event)
    }
    const types = [
      ...(opts.keydown !== false ? ['keydown'] : []),
      ...(opts.keyup ? ['keyup'] : []),
    ] as const
    for (const type of types) window.addEventListener(type, listen as EventListener)
    return () => {
      for (const type of types) window.removeEventListener(type, listen as EventListener)
    }
  })
}
