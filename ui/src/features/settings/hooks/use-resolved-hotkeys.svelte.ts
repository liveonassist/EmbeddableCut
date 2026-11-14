// SPDX-License-Identifier: MIT

import { resolveHotkeys, type HotkeyBindingMap } from '@/config/hotkeys'
import { useSettingsStore } from '@/features/settings/stores/settings-store'
import { select, shallow } from '$lib/store.svelte'

export function useResolvedHotkeys(): { readonly current: HotkeyBindingMap } {
  return select(useSettingsStore, (state) => resolveHotkeys(state.hotkeyOverrides), shallow)
}
