// SPDX-License-Identifier: MIT

import { i18n } from '@/i18n'
import { toast } from 'svelte-sonner'
import type { ShapeItem, ShapeType } from '@/types/timeline'
import type { ItemPropertiesPreview } from '@/features/editor/deps/preview'
import { updateItem } from '@/features/editor/deps/timeline-store'
import { reversePathVertices, rotateClosedPathStart } from '@/shared/graphics/shapes/bezier-path'
import {
  DEFAULT_SHAPE_GRADIENT_ANGLE,
  DEFAULT_SHAPE_GRADIENT_END_COLOR,
  getSwappedShapeLinearGradientColors,
} from '@/shared/graphics/shapes/linear-gradient'
import {
  DEFAULT_STROKE_COLOR,
  MIN_ENABLED_STROKE_WIDTH,
  SHAPE_TYPE_OPTIONS,
} from './shape-section-constants'
import type { ShapeSharedValues } from './shape-section-shared-values'
import type { StrokePathProperty } from './shape-trim-taper-controls-types'
import { getPathClosureUpdates } from './shape-section-visibility'

export interface ShapeSectionHandlerParams {
  shapeItems: ShapeItem[]
  /** Ids of {@link shapeItems}, stable across renders while the selection is unchanged. */
  itemIds: string[]
  sharedValues: ShapeSharedValues | null
  /** The single selected path shape, if the selection is exactly one path. */
  singlePathShape: ShapeItem | null
  pathTopologyLocked: boolean
  selectedVertexIndex: number | null
  /** Gizmo preview sink for live drag feedback. */
  setPropertiesPreviewNew: (previews: Record<string, ItemPropertiesPreview>) => void
  clearPreview: () => void
}

/**
 * Every mutation the shape inspector performs, with its live-preview twin.
 * Collaborators are injected so the section owns the store subscriptions.
 */
export function useShapeSectionHandlers(params: () => ShapeSectionHandlerParams) {
  // Update all selected shape items
  const updateShapeItems = (updates: Partial<ShapeItem>) => {
    params().shapeItems.forEach((item) => {
      updateItem(item.id, updates)
    })
  }

  // Shape type change - also update label to match shape type
  const handleShapeTypeChange = (value: string) => {
    const shapeOption = SHAPE_TYPE_OPTIONS.find((opt) => opt.value === value)
    const label = shapeOption ? i18n.t(shapeOption.labelKey) : value
    updateShapeItems({ shapeType: value as ShapeType, label })
  }

  // Fill color handlers with live preview
  const handleFillColorLiveChange = (value: string) => {
    const previews: Record<string, { fillColor: string }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { fillColor: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleFillColorChange = (value: string) => {
    updateShapeItems({ fillColor: value })
    queueMicrotask(() => params().clearPreview())
  }

  // Stroke color handlers with live preview
  const handleStrokeColorLiveChange = (value: string) => {
    const previews: Record<string, { strokeColor: string }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { strokeColor: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleStrokeColorChange = (value: string) => {
    updateShapeItems({ strokeColor: value || undefined })
    queueMicrotask(() => params().clearPreview())
  }

  // Stroke width handlers with live preview
  const handleStrokeWidthLiveChange = (value: number) => {
    const strokeWidth = Math.max(MIN_ENABLED_STROKE_WIDTH, value)
    const previews: Record<string, { strokeWidth: number; strokeColor?: string }> = {}
    params().itemIds.forEach((id) => {
      // Include default stroke color in preview if not already set
      if (!params().sharedValues?.strokeColor) {
        previews[id] = { strokeWidth, strokeColor: DEFAULT_STROKE_COLOR }
      } else {
        previews[id] = { strokeWidth }
      }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleStrokeWidthChange = (value: number) => {
    const strokeWidth = Math.max(MIN_ENABLED_STROKE_WIDTH, value)
    if (!params().sharedValues?.strokeColor) {
      updateShapeItems({ strokeWidth, strokeColor: DEFAULT_STROKE_COLOR })
    } else {
      updateShapeItems({ strokeWidth })
    }
    queueMicrotask(() => params().clearPreview())
  }

  const handleFillEnabledChange = (enabled: boolean) => updateShapeItems({ fillEnabled: enabled })

  const handleFillTypeChange = (value: string) => {
    if (value === 'linear') {
      const { sharedValues } = params()
      const gradientStartColor =
        sharedValues?.gradientStartColor ?? sharedValues?.fillColor ?? '#3b82f6'
      const gradientEndColor = sharedValues?.gradientEndColor ?? DEFAULT_SHAPE_GRADIENT_END_COLOR
      const gradientAngle =
        typeof sharedValues?.gradientAngle === 'number'
          ? sharedValues.gradientAngle
          : DEFAULT_SHAPE_GRADIENT_ANGLE
      updateShapeItems({
        fillType: 'linear',
        gradientStartColor,
        gradientEndColor,
        gradientAngle,
      })
      return
    }
    updateShapeItems({ fillType: 'solid' })
  }

  const handleGradientStartColorLiveChange = (value: string) => {
    const previews: Record<string, { fillColor: string; gradientStartColor: string }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { fillColor: value, gradientStartColor: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleGradientStartColorChange = (value: string) => {
    updateShapeItems({ fillColor: value, gradientStartColor: value })
    queueMicrotask(() => params().clearPreview())
  }

  const handleGradientEndColorLiveChange = (value: string) => {
    const previews: Record<string, { gradientEndColor: string }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { gradientEndColor: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleGradientEndColorChange = (value: string) => {
    updateShapeItems({ gradientEndColor: value })
    queueMicrotask(() => params().clearPreview())
  }

  const handleGradientAngleLiveChange = (value: number) => {
    const previews: Record<string, { gradientAngle: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { gradientAngle: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleGradientAngleChange = (value: number) => {
    updateShapeItems({ gradientAngle: value })
    queueMicrotask(() => params().clearPreview())
  }

  const handleSwapGradientColors = () => {
    params().shapeItems.forEach((item) => {
      const updates = getSwappedShapeLinearGradientColors(item)
      if (updates) updateItem(item.id, updates)
    })
  }

  const handleStrokeEnabledChange = (enabled: boolean) => {
    const { sharedValues } = params()
    updateShapeItems({
      strokeEnabled: enabled,
      ...(enabled
        ? {
            strokeColor: sharedValues?.strokeColor || DEFAULT_STROKE_COLOR,
            strokeWidth:
              typeof sharedValues?.strokeWidth === 'number' && sharedValues.strokeWidth > 0
                ? Math.max(MIN_ENABLED_STROKE_WIDTH, sharedValues.strokeWidth)
                : 4,
          }
        : {}),
    })
  }

  const handleStrokeMiterLimitLiveChange = (value: number) => {
    const previews: Record<string, { strokeMiterLimit: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { strokeMiterLimit: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleStrokeMiterLimitChange = (value: number) => {
    updateShapeItems({ strokeMiterLimit: value })
    queueMicrotask(() => params().clearPreview())
  }

  const handlePathClosedChange = (closed: boolean) => {
    const { singlePathShape, pathTopologyLocked } = params()
    if (!closed && singlePathShape?.isMask) return
    if (!singlePathShape) return
    if (pathTopologyLocked) {
      toast.error('Path topology cannot change while Path Geometry has keyframes.')
      return
    }
    updateItem(singlePathShape.id, getPathClosureUpdates(singlePathShape, closed))
  }

  const handleReversePath = () => {
    const { singlePathShape, pathTopologyLocked } = params()
    if (!singlePathShape?.pathVertices) return
    if (pathTopologyLocked) {
      toast.error('Path vertex order cannot change while Path Geometry has keyframes.')
      return
    }
    updateItem(singlePathShape.id, {
      pathVertices: reversePathVertices(singlePathShape.pathVertices),
    })
  }

  const handleSetFirstVertex = () => {
    const { singlePathShape, pathTopologyLocked, selectedVertexIndex } = params()
    if (!singlePathShape?.pathVertices || selectedVertexIndex === null) return
    if (pathTopologyLocked) {
      toast.error('The first vertex cannot change while Path Geometry has keyframes.')
      return
    }
    updateItem(singlePathShape.id, {
      pathVertices: rotateClosedPathStart(singlePathShape.pathVertices, selectedVertexIndex),
    })
  }

  // Corner radius handlers with live preview
  const handleCornerRadiusLiveChange = (value: number) => {
    const previews: Record<string, { cornerRadius: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { cornerRadius: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleCornerRadiusChange = (value: number) => {
    updateShapeItems({ cornerRadius: value })
    queueMicrotask(() => params().clearPreview())
  }

  // Direction handler
  const handleDirectionChange = (value: string) => {
    updateShapeItems({ direction: value as 'up' | 'down' | 'left' | 'right' })
  }

  // Points handlers with live preview
  const handlePointsLiveChange = (value: number) => {
    const previews: Record<string, { points: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { points: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handlePointsChange = (value: number) => {
    updateShapeItems({ points: value })
    queueMicrotask(() => params().clearPreview())
  }

  // Inner radius handlers with live preview
  const handleInnerRadiusLiveChange = (value: number) => {
    const previews: Record<string, { innerRadius: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { innerRadius: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleInnerRadiusChange = (value: number) => {
    updateShapeItems({ innerRadius: value })
    queueMicrotask(() => params().clearPreview())
  }

  const previewStrokePathProperty = (property: StrokePathProperty, value: number) => {
    const previews: Record<string, Partial<Record<StrokePathProperty, number>>> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { [property]: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const commitStrokePathProperty = (property: StrokePathProperty, value: number) => {
    updateShapeItems({ [property]: value })
    queueMicrotask(() => params().clearPreview())
  }

  const resetNumericProperty = (
    property:
      | 'strokeWidth'
      | 'strokeMiterLimit'
      | 'cornerRadius'
      | 'innerRadius'
      | 'trimPathStart'
      | 'trimPathEnd'
      | 'trimPathOffset'
      | 'taperStartWidth'
      | 'taperEndWidth'
      | 'taperStartLength'
      | 'taperEndLength'
      | 'maskFeather'
      | 'maskOpacity',
    value: number,
  ) => {
    updateShapeItems({ [property]: value })
    queueMicrotask(() => params().clearPreview())
  }

  // Mask toggle handler
  const handleIsMaskChange = (checked: boolean) => {
    updateShapeItems({
      isMask: checked,
      blendMode: checked ? 'normal' : undefined,
      // Set defaults when enabling mask
      maskType: checked ? 'clip' : undefined,
      maskFeather: checked ? 0 : undefined,
      maskOpacity: checked ? 100 : undefined,
      maskInvert: checked ? false : undefined,
      pathClosed: checked ? true : undefined,
    })
  }

  // Mask type handler
  const handleMaskTypeChange = (value: string) => {
    const nextMaskType = value as 'clip' | 'alpha'
    const { sharedValues } = params()
    updateShapeItems({
      maskType: nextMaskType,
      maskFeather:
        nextMaskType === 'alpha'
          ? typeof sharedValues?.maskFeather === 'number' && sharedValues.maskFeather > 0
            ? sharedValues.maskFeather
            : 10
          : 0,
    })
  }

  // Mask feather handlers with live preview
  const handleMaskFeatherLiveChange = (value: number) => {
    const previews: Record<string, { maskFeather: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { maskFeather: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleMaskFeatherChange = (value: number) => {
    updateShapeItems({ maskFeather: value })
    queueMicrotask(() => params().clearPreview())
  }

  const handleMaskOpacityLiveChange = (value: number) => {
    const previews: Record<string, { maskOpacity: number }> = {}
    params().itemIds.forEach((id) => {
      previews[id] = { maskOpacity: value }
    })
    params().setPropertiesPreviewNew(previews)
  }

  const handleMaskOpacityChange = (value: number) => {
    updateShapeItems({ maskOpacity: value })
    queueMicrotask(() => params().clearPreview())
  }

  // Mask invert handler
  const handleMaskInvertChange = (checked: boolean) => {
    updateShapeItems({ maskInvert: checked })
  }
  return {
    updateShapeItems,
    handleShapeTypeChange,
    handleFillColorLiveChange,
    handleFillColorChange,
    handleStrokeColorLiveChange,
    handleStrokeColorChange,
    handleStrokeWidthLiveChange,
    handleStrokeWidthChange,
    handleFillEnabledChange,
    handleFillTypeChange,
    handleGradientStartColorLiveChange,
    handleGradientStartColorChange,
    handleGradientEndColorLiveChange,
    handleGradientEndColorChange,
    handleGradientAngleLiveChange,
    handleGradientAngleChange,
    handleSwapGradientColors,
    handleStrokeEnabledChange,
    handleStrokeMiterLimitLiveChange,
    handleStrokeMiterLimitChange,
    handlePathClosedChange,
    handleReversePath,
    handleSetFirstVertex,
    handleCornerRadiusLiveChange,
    handleCornerRadiusChange,
    handleDirectionChange,
    handlePointsLiveChange,
    handlePointsChange,
    handleInnerRadiusLiveChange,
    handleInnerRadiusChange,
    previewStrokePathProperty,
    commitStrokePathProperty,
    resetNumericProperty,
    handleIsMaskChange,
    handleMaskTypeChange,
    handleMaskFeatherLiveChange,
    handleMaskFeatherChange,
    handleMaskOpacityLiveChange,
    handleMaskOpacityChange,
    handleMaskInvertChange,
  }
}
