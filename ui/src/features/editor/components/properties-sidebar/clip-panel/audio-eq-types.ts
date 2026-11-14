// SPDX-License-Identifier: MIT

import type { AudioEqFieldSource } from '@/shared/utils/audio-eq'

/** A partial EQ edit, keyed by timeline item field. Exported by the React `audio-eq-curve-editor`. */
export type AudioEqPatch = Partial<AudioEqFieldSource>

/** Commits or previews one EQ field. */
export type AudioEqFieldHandler = <K extends keyof AudioEqPatch>(
  field: K,
  value: NonNullable<AudioEqPatch[K]>,
) => void
