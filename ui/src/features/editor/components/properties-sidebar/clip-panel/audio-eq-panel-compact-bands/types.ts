// SPDX-License-Identifier: MIT

import type { AudioEqBandView } from '../audio-eq-panel-bands'
import type { AudioEqFieldHandler } from '../audio-eq-types'

export interface CompactCellProps {
  view: AudioEqBandView
  onFieldChange: AudioEqFieldHandler
  onFieldLiveChange: AudioEqFieldHandler
}
