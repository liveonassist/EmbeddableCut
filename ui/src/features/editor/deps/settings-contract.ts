// SPDX-License-Identifier: MIT

/**
 * Adapter exports for settings dependencies.
 * Editor modules should import settings stores/services from here.
 */

export {
  useSettingsStore,
  CAPTIONING_INTERVAL_BOUNDS,
  DEFAULT_CAPTIONING_INTERVAL_SECONDS,
  resolveCaptioningIntervalSec,
} from '@/features/settings/stores/settings-store'
export type { CaptioningIntervalUnit } from '@/features/settings/stores/settings-store'
export { default as LocalInferenceUnloadControl } from '@/features/settings/components/local-inference-unload-control.svelte'
export { default as LocalModelCacheControl } from '@/features/settings/components/local-model-cache-control.svelte'
export { useResolvedHotkeys } from '@/features/settings/hooks/use-resolved-hotkeys.svelte'
export { HotkeyEditor } from '@/features/settings/components/hotkey-editor'
export { default as SettingGate } from '@/features/settings/components/setting-gate.svelte'
