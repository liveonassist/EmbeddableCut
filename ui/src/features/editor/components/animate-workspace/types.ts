// SPDX-License-Identifier: MIT

/**
 * Types the animate-workspace components export in React. Svelte components
 * can't export types oxlint sees, so they live here.
 */

import type { MotionModifierChannelGains } from '@/types/motion'
import type { TextMotionEffect, TextMotionSlot } from '@/types/text-motion'

/** apply-mode-selector */
export type MotionApplyMode = 'replace' | 'merge' | 'layer'

/** continuous-motion-row */
export interface ModifierEditSettings {
  intensityScale?: number
  durationScale?: number
  channelGains?: MotionModifierChannelGains
}

/** applied-motion-summary: one live text-motion slot applied to the selected clip. */
export interface ActiveTextMotionEntry {
  slot: TextMotionSlot
  effect: TextMotionEffect
}
