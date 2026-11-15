// SPDX-License-Identifier: MIT

/**
 * Settings a host decides for its editor: values it forces over the user's
 * persisted ones, keys the user can't change, and keys a settings UI doesn't
 * show. The store enforces locks itself, so no path (the settings dialog, a
 * toolbar toggle, a shortcut) changes a locked setting.
 *
 * Forced and locked values apply to this editor only: the user's own stay in
 * localStorage, and come back when the policy is removed.
 */

import { useSettingsStore } from './settings-store'

type SettingsState = ReturnType<typeof useSettingsStore.getState>

/** The settings themselves, without the store's actions. */
export type AppSettingValues = {
  [
    K in keyof SettingsState as SettingsState[K] extends (...args: never[]) => unknown ? never : K
  ]: SettingsState[K]
}

export type AppSettingKey = keyof AppSettingValues

export interface SettingsPolicy {
  /** Used instead of the user's persisted values while the policy is installed. */
  values?: Partial<AppSettingValues>
  /** Can't be changed. Pair with `values` to pin one to a value. */
  locked?: readonly AppSettingKey[]
  /** Not shown in the settings UI; still changeable from elsewhere unless locked too. */
  hidden?: readonly AppSettingKey[]
}

const HOTKEY_ACTIONS = [
  'setHotkeyBinding',
  'unbindHotkeyBinding',
  'replaceHotkeyOverrides',
  'resetHotkeyBinding',
  'resetHotkeys',
] as const

let locked: ReadonlySet<AppSettingKey> = new Set()
let hidden: ReadonlySet<AppSettingKey> = new Set()
let uninstall: (() => void) | null = null

export function isSettingLocked(key: AppSettingKey): boolean {
  return locked.has(key)
}

export function isSettingHidden(key: AppSettingKey): boolean {
  return hidden.has(key)
}

function pick(state: object, keys: Iterable<string>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of keys) picked[key] = (state as Record<string, unknown>)[key]
  return picked
}

/**
 * Installs a policy over the settings store; returns its removal, which puts
 * the user's values and the store's own actions back. One policy at a time:
 * installing another first removes the last.
 */
export function installSettingsPolicy(policy: SettingsPolicy): () => void {
  uninstall?.()
  const store = useSettingsStore
  const state = store.getState()
  const forced = Object.keys(policy.values ?? {})
  const pinned = new Set<string>([...forced, ...(policy.locked ?? [])])
  // What the user had, which is what's persisted while the policy holds.
  const own = pick(state, pinned)
  const actions = {
    setSetting: state.setSetting,
    resetToDefaults: state.resetToDefaults,
    ...pick(state, HOTKEY_ACTIONS),
  } as Pick<SettingsState, 'setSetting' | 'resetToDefaults' | (typeof HOTKEY_ACTIONS)[number]>
  // Absent where there's no storage to persist to.
  const persist = store.persist as typeof store.persist | undefined
  const persistOptions = persist?.getOptions() ?? {}

  locked = new Set(policy.locked)
  hidden = new Set(policy.hidden)
  const hotkeysLocked = locked.has('hotkeyOverrides')
  const guardedHotkeyActions = Object.fromEntries(
    HOTKEY_ACTIONS.map((name) => [
      name,
      (...args: unknown[]) => {
        if (!hotkeysLocked) (actions[name] as (...a: unknown[]) => void)(...args)
      },
    ]),
  )

  persist?.setOptions({
    partialize: (current) => ({
      ...(persistOptions.partialize ? persistOptions.partialize(current) : current),
      ...own,
    }),
  })
  store.setState({
    ...policy.values,
    ...guardedHotkeyActions,
    setSetting: (key, value) => {
      if (!locked.has(key)) actions.setSetting(key, value)
    },
    resetToDefaults: () => {
      const kept = pick(store.getState(), locked)
      actions.resetToDefaults()
      store.setState({ ...policy.values, ...kept })
    },
  })

  const remove = () => {
    if (uninstall !== remove) return
    uninstall = null
    locked = new Set()
    hidden = new Set()
    persist?.setOptions({ partialize: persistOptions.partialize })
    store.setState({ ...actions, ...own })
  }
  uninstall = remove
  return remove
}
