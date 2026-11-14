// SPDX-License-Identifier: MIT

import { AUDIO_EQ_GAIN_DB_MAX } from '@/shared/utils/audio-eq'
import type { AudioEqBandView } from '../audio-eq-panel-bands'
import type { AudioEqFieldHandler } from '../audio-eq-types'

export interface EqBandFieldProps {
  view: AudioEqBandView
  onFieldChange: AudioEqFieldHandler
  onFieldLiveChange: AudioEqFieldHandler
}

/** Gain readout uses no sign for the (negative) minimum and a `+` above zero. */
export const GAIN_MAX_LABEL =
  AUDIO_EQ_GAIN_DB_MAX > 0 ? `+${AUDIO_EQ_GAIN_DB_MAX}` : String(AUDIO_EQ_GAIN_DB_MAX)
