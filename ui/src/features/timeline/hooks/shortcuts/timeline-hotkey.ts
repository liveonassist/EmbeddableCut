// SPDX-License-Identifier: MIT

import { useHotkeys } from '$lib/hotkeys.svelte'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'

/** The react-hotkeys-hook options FreeCut's timeline shortcuts use. */
export interface TimelineHotkeyOptions {
  enabled?: boolean
  enableOnFormTags?: boolean
  enableOnContentEditable?: boolean
  preventDefault?: boolean
}

// react-hotkeys-hook matches each entry against the target's tag name and its role.
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

function eventTarget(event: KeyboardEvent): EventTarget | null | undefined {
  // The editor may live in a shadow root, where `target` is the host at the window.
  return typeof event.composedPath === 'function'
    ? (event.composedPath()[0] ?? event.target)
    : event.target
}

function isFormTagTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  const role = target.getAttribute('role')
  return FORM_TAGS_AND_ROLES.some((entry) => entry === tag || entry === role)
}

function wantsShift(binding: string): boolean {
  return binding
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .includes('shift')
}

/**
 * `useHotkeys` with react-hotkeys-hook's semantics where `$lib/hotkeys` is
 * looser, so every timeline shortcut fires exactly where FreeCut's does:
 * - `enableOnFormTags: false` also skips targets with a form role (slider,
 *   menuitem, option, radio, textbox, …), not only inputs.
 * - contenteditable targets are skipped unless `enableOnContentEditable`, even
 *   with `enableOnFormTags` (undo/redo stay out of rich text).
 * - Shift must match for every key, including space and punctuation.
 * - `preventDefault` runs only once those checks pass, so skipped keys keep
 *   their default action.
 *
 * `$lib/hotkeys` listens on the window in the bubble phase: FreeCut's
 * `eventListenerOptions: { capture: true }` has no equivalent here.
 */
export function useTimelineHotkey(
  keys: () => string,
  handler: (event: KeyboardEvent) => void,
  options: () => TimelineHotkeyOptions = () => HOTKEY_OPTIONS,
): void {
  useHotkeys(
    keys,
    (event) => {
      const opts = options()
      const target = eventTarget(event)
      if (!opts.enableOnFormTags && isFormTagTarget(target)) return
      if (
        !opts.enableOnContentEditable &&
        target instanceof HTMLElement &&
        target.isContentEditable
      )
        return
      if (
        typeof event.shiftKey === 'boolean' &&
        !keys()
          .split(',')
          .some((binding) => wantsShift(binding) === event.shiftKey)
      ) {
        return
      }
      if (opts.preventDefault) event.preventDefault()
      handler(event)
    },
    () => ({ enabled: options().enabled, enableOnFormTags: true }),
  )
}
