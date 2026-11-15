// SPDX-License-Identifier: MIT

import { resolveHotkeys, type HotkeyBindingMap } from '@/config/hotkeys'
import { useSettingsStore } from '@/features/settings/stores/settings-store'
import { select, shallow } from '$lib/store.svelte'
import { useFeatures } from '../../../extensions/feature-gate.svelte'

export function useResolvedHotkeys(): { readonly current: HotkeyBindingMap } {
  const resolved = select(
    useSettingsStore,
    (state) => resolveHotkeys(state.hotkeyOverrides),
    shallow,
  )
  // A hidden or locked feature's shortcuts are unassigned, so they never fire.
  const features = useFeatures()
  const gated = $derived(features.gateHotkeys(resolved.current))
  return {
    get current() {
      return gated
    },
  }
}
