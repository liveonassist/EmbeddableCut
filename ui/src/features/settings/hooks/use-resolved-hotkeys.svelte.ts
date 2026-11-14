// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { resolveHotkeys } from '@/config/hotkeys'
import { useSettingsStore } from '@/features/settings/stores/settings-store'

export function useResolvedHotkeys(): { readonly current: ReturnType<typeof resolveHotkeys> } {
  return {
    get current() {
      return resolveHotkeys(useSettingsStore.getState().hotkeyOverrides)
    },
  }
}
