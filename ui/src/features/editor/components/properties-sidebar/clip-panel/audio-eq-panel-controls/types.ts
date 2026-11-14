// SPDX-License-Identifier: MIT

import type { AudioEqFilterType } from '../audio-eq-ui'

export type FilterType = AudioEqFilterType

export const BAND_CARD_CHROME = {
  full: {
    header: 'gap-1.5 px-2 py-2',
    titleRow: 'gap-1.5',
    titleMinWidth: 'min-w-[3.55rem] px-1.5',
    resetButton: 'h-5 w-5',
    resetIcon: 'h-3 w-3',
    body: 'gap-2 p-2',
  },
  compact: {
    header: 'gap-1 px-1.5 py-1.5',
    titleRow: 'gap-1',
    titleMinWidth: 'min-w-[3.05rem] px-1',
    resetButton: 'h-4 w-4',
    resetIcon: 'h-2.5 w-2.5',
    body: 'gap-1.5 p-1.5',
  },
} as const
