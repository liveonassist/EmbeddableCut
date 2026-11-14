// SPDX-License-Identifier: MIT

import type { VectorAnimatableProperty } from '@/types/keyframe'

export interface CompoundPropertyInputConfig {
  label: string
  value: { x: number; y: number }
  /**
   * Optional high-frequency presentation value. Each axis subscribes directly,
   * so a live canvas gesture can refresh these two inputs without re-rendering
   * the parent DopesheetEditor.
   */
  liveValueSource?: CompoundPropertyLiveValueSource
  preExpressionValue?: { x: number; y: number }
  unit: string
  /** Vector2 property exposed by the row's Property Link pick whip. */
  linkProperty?: VectorAnimatableProperty
  /** Keeps axis semantics accessible while allowing compact Motion rows to omit visible X/Y. */
  showAxisLabels?: boolean
  linked?: boolean
  disabled?: boolean
  allowCreateOnBlur?: boolean
  axisLink?: {
    linked: boolean
    onChange: (linked: boolean) => void
  }
  onCommit: (axis: 'x' | 'y', value: number, options: { allowCreate: boolean }) => boolean | void
  onScrubStart?: (axis: 'x' | 'y') => void
  onScrubPreview?: (axis: 'x' | 'y', value: number) => void
  onScrubEnd?: (axis: 'x' | 'y', value: number) => void
  onScrubCancel?: (axis: 'x' | 'y') => void
  /** Value change per horizontal pixel. Defaults to the displayed precision. */
  scrubStep?: number
  /** Display and typed-value precision. Position uses 0 for whole pixels. */
  decimals?: number
}

export interface CompoundPropertyLiveValueSource {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { x: number; y: number } | null
}

export function createCompoundAxisCallbacks(config: CompoundPropertyInputConfig, axis: 'x' | 'y') {
  return {
    onCommit: (value: number, options: { allowCreate: boolean }) =>
      config.onCommit(axis, value, options),
    onScrubStart: config.onScrubStart ? () => config.onScrubStart?.(axis) : undefined,
    onScrubPreview: config.onScrubPreview
      ? (value: number) => config.onScrubPreview?.(axis, value)
      : undefined,
    onScrubEnd: config.onScrubEnd ? (value: number) => config.onScrubEnd?.(axis, value) : undefined,
    onScrubCancel: config.onScrubCancel ? () => config.onScrubCancel?.(axis) : undefined,
  }
}
