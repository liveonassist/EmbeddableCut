// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'
import type { TrimPathValues } from '@/shared/graphics/shapes/trim-path'
import type { TaperPathValues } from '@/shared/graphics/shapes/taper-path'

export interface BaseShapeProps extends TrimPathValues, TaperPathValues {
  fill?: string
  /** `<defs>` (e.g. a gradient) rendered before the shape, which `fill` can reference. */
  fillDefinition?: Snippet
  stroke?: string
  strokeWidth?: number
  style?: string
  class?: string
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  strokeMiterlimit?: number
}
