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
