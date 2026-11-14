// SPDX-License-Identifier: MIT

import type { MaskVertex } from '@/types/masks'
import type { ResolvedShapePaint, ResolvedShapeProps } from './shape-content-props'
import type { ShapeLayout } from './shape-content-layout'

export interface ShapeGeometryProps {
  shapeProps: ResolvedShapeProps
  paint: ResolvedShapePaint
  layout: ShapeLayout
  gradientId: string
  pathVertices: MaskVertex[] | undefined
}
