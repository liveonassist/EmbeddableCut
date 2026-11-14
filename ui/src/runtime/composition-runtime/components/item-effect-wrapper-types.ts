// SPDX-License-Identifier: MIT

import type { AdjustmentItem } from '@/types/timeline'

/** Adjustment layer with its track order for scope calculation */
export interface AdjustmentLayerWithTrackOrder {
  layer: AdjustmentItem
  trackOrder: number
}
