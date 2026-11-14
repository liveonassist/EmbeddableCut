// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { select, shallow } from '$lib/store.svelte'
import { resolveHotkeys } from '@/config/hotkeys'
import { useSettingsStore } from '@/features/settings/stores/settings-store'

export function useResolvedHotkeys(): { readonly current: ReturnType<typeof resolveHotkeys> } {
  return select(useSettingsStore, (state) => resolveHotkeys(state.hotkeyOverrides), shallow)
}
