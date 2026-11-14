// SPDX-License-Identifier: MIT

import {
  findHotkeyConflicts,
  resolveHotkeys,
  splitHotkeyBinding,
  type HotkeyBindingMap,
  type HotkeyImportResult,
  type HotkeyKey,
  type HotkeyOverrideMap,
} from '@/config/hotkeys'
import {
  HOTKEY_EDITOR_SECTIONS,
  type HotkeyEditorItem,
  type HotkeyEditorSearchResult,
} from '../hotkey-editor-sections'

export interface KeyboardKeySpec {
  id: string
  token?: string
  label?: string
  width?: number
  isGap?: boolean
}

export interface KeyboardRowPair {
  main: readonly KeyboardKeySpec[]
  nav: readonly KeyboardKeySpec[]
}

// ---------------------------------------------------------------------------
// Full ANSI keyboard layout — main section + navigation/arrow cluster
// Each row pair aligns main keys (left) with nav/arrow keys (right).
// ---------------------------------------------------------------------------

export const KEYBOARD_ROWS: readonly KeyboardRowPair[] = [
  {
    main: [
      { id: 'backquote', token: 'backquote' },
      { id: '1', token: '1' },
      { id: '2', token: '2' },
      { id: '3', token: '3' },
      { id: '4', token: '4' },
      { id: '5', token: '5' },
      { id: '6', token: '6' },
      { id: '7', token: '7' },
      { id: '8', token: '8' },
      { id: '9', token: '9' },
      { id: '0', token: '0' },
      { id: 'minus', token: 'minus' },
      { id: 'equals', token: 'equal' },
      { id: 'backspace', token: 'backspace', width: 2 },
    ],
    nav: [
      { id: 'insert', label: 'Ins' },
      { id: 'home', token: 'home' },
      { id: 'pageup', label: 'PgUp' },
    ],
  },
  {
    main: [
      { id: 'tab', token: 'tab', width: 1.5 },
      { id: 'q', token: 'q' },
      { id: 'w', token: 'w' },
      { id: 'e', token: 'e' },
      { id: 'r', token: 'r' },
      { id: 't', token: 't' },
      { id: 'y', token: 'y' },
      { id: 'u', token: 'u' },
      { id: 'i', token: 'i' },
      { id: 'o', token: 'o' },
      { id: 'p', token: 'p' },
      { id: 'bracketleft', token: 'bracketleft' },
      { id: 'bracketright', token: 'bracketright' },
      { id: 'backslash', token: 'backslash', width: 1.5 },
    ],
    nav: [
      { id: 'delete', token: 'delete' },
      { id: 'end', token: 'end' },
      { id: 'pagedown', label: 'PgDn' },
    ],
  },
  {
    main: [
      { id: 'caps', label: 'Caps', width: 1.8 },
      { id: 'a', token: 'a' },
      { id: 's', token: 's' },
      { id: 'd', token: 'd' },
      { id: 'f', token: 'f' },
      { id: 'g', token: 'g' },
      { id: 'h', token: 'h' },
      { id: 'j', token: 'j' },
      { id: 'k', token: 'k' },
      { id: 'l', token: 'l' },
      { id: 'semicolon', token: 'semicolon' },
      { id: 'quote', token: 'quote' },
      { id: 'enter', token: 'enter', width: 2.2 },
    ],
    nav: [],
  },
  {
    main: [
      { id: 'shift-left', token: 'shift', width: 2.3 },
      { id: 'z', token: 'z' },
      { id: 'x', token: 'x' },
      { id: 'c', token: 'c' },
      { id: 'v', token: 'v' },
      { id: 'b', token: 'b' },
      { id: 'n', token: 'n' },
      { id: 'm', token: 'm' },
      { id: 'comma', token: 'comma' },
      { id: 'period', token: 'period' },
      { id: 'slash', token: 'slash' },
      { id: 'shift-right', token: 'shift', width: 2.7 },
    ],
    nav: [
      { id: 'arrow-spacer-l', isGap: true },
      { id: 'up', token: 'up' },
      { id: 'arrow-spacer-r', isGap: true },
    ],
  },
  {
    main: [
      { id: 'mod-left', token: 'mod', width: 1.5 },
      { id: 'alt-left', token: 'alt', width: 1.3 },
      { id: 'space', token: 'space', width: 6.2 },
      { id: 'alt-right', token: 'alt', width: 1.3 },
      { id: 'mod-right', token: 'mod', width: 1.5 },
    ],
    nav: [
      { id: 'left', token: 'left' },
      { id: 'down', token: 'down' },
      { id: 'right', token: 'right' },
    ],
  },
]

export const HOTKEY_ITEM_BY_KEY = Object.fromEntries(
  HOTKEY_EDITOR_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) => item.keys.map((key) => [key, item])),
  ),
) as Record<HotkeyKey, HotkeyEditorItem>

export function getSlotLabelKey(item: HotkeyEditorItem, key: HotkeyKey): string {
  if (item.keys.length === 1) {
    return 'projects.settings.hotkeys.shortcut'
  }

  return item.keys[0] === key
    ? 'projects.settings.hotkeys.primaryShortcut'
    : 'projects.settings.hotkeys.alternateShortcut'
}

export function getBindingTokens(binding: string): string[] {
  return splitHotkeyBinding(binding)
}

export function downloadJsonFile(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export async function readTextFile(file: File): Promise<string> {
  return file.text()
}

// ---------------------------------------------------------------------------
// Keyboard key cap classes
// ---------------------------------------------------------------------------

export const KEY_BASE_CLASSES =
  'flex h-[3.25rem] items-center justify-center rounded-lg border text-[11px] font-medium tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.22)] transition-[background-color,border-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none select-none'

export const KEY_ACTIVE_CLASSES =
  'border-primary/55 bg-primary/18 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_20px_rgba(255,140,58,0.14)]'

export const KEY_IDLE_CLASSES =
  'border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] text-foreground/78'

export type HotkeyFilterMode = 'all' | 'custom' | 'conflicts' | 'unassigned'

export const FILTER_CHIP_MODES = ['custom', 'conflicts', 'unassigned'] as const

export interface ImportChange {
  key: HotkeyKey
  labelKey: string
  from: string
  to: string
}

export interface PendingHotkeyImport {
  overrides: HotkeyOverrideMap
  result: HotkeyImportResult
  changes: ImportChange[]
}

/** Per-slot diff between the live bindings and the bindings a preset would apply. */
export function buildImportChanges(
  currentBindings: HotkeyBindingMap,
  nextOverrides: HotkeyOverrideMap,
): ImportChange[] {
  const nextBindings = resolveHotkeys(nextOverrides)
  const changes: ImportChange[] = []

  for (const [key, item] of Object.entries(HOTKEY_ITEM_BY_KEY) as [HotkeyKey, HotkeyEditorItem][]) {
    if (currentBindings[key] !== nextBindings[key]) {
      changes.push({
        key,
        labelKey: item.labelKey,
        from: currentBindings[key],
        to: nextBindings[key],
      })
    }
  }

  return changes
}

/** Commands matching a quick filter (customized / conflicting / unassigned). */
export function getHotkeyFilterResults(
  mode: Exclude<HotkeyFilterMode, 'all'>,
  hotkeys: HotkeyBindingMap,
  overrides: HotkeyOverrideMap,
): HotkeyEditorSearchResult[] {
  const results: HotkeyEditorSearchResult[] = []

  for (const section of HOTKEY_EDITOR_SECTIONS) {
    for (const item of section.items) {
      const matches = item.keys.some((key) => {
        if (mode === 'custom') return key in overrides
        if (mode === 'unassigned') return hotkeys[key] === ''
        return findHotkeyConflicts(hotkeys, hotkeys[key], key).length > 0
      })

      if (matches) {
        results.push({ section, item })
      }
    }
  }

  return results
}

/** All three quick-filter counts in a single traversal (vs three O(N) passes). */
export function computeHotkeyFilterCounts(
  hotkeys: HotkeyBindingMap,
  overrides: HotkeyOverrideMap,
): Record<Exclude<HotkeyFilterMode, 'all'>, number> {
  let custom = 0
  let conflicts = 0
  let unassigned = 0

  for (const section of HOTKEY_EDITOR_SECTIONS) {
    for (const item of section.items) {
      if (item.keys.some((key) => key in overrides)) custom += 1
      if (item.keys.some((key) => hotkeys[key] === '')) unassigned += 1
      if (item.keys.some((key) => findHotkeyConflicts(hotkeys, hotkeys[key], key).length > 0)) {
        conflicts += 1
      }
    }
  }

  return { custom, conflicts, unassigned }
}
