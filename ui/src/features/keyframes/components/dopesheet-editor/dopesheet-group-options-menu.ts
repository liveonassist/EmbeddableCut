// SPDX-License-Identifier: MIT

import type { AnimatableProperty } from '@/types/keyframe'

export interface DopesheetDimensionSeparationControl {
  label: string
  separated: boolean
  disabled?: boolean
  onChange: (separated: boolean) => void
}

export interface DopesheetDimensionSeparationEntry {
  property: AnimatableProperty
  control: DopesheetDimensionSeparationControl
}
