<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'

  const OVERLAY_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f472b6', '#fb923c', '#a78bfa', '#34d399']
  const EMPTY_SELECTION: Set<string> = new Set()
  const EMPTY_BLOCKED_RANGES: BlockedFrameRange[] = []
</script>

<script lang="ts">
  import type { AnimatableProperty, KeyframeRef } from '@/types/keyframe'
  /**
   * Value Graph Editor - Main container component.
   * Interactive graph for editing keyframe values and timing.
   */
  import { untrack } from 'svelte'
  import ZoomIn from 'lucide-svelte/icons/zoom-in'
  import ZoomOut from 'lucide-svelte/icons/zoom-out'
  import Maximize2 from 'lucide-svelte/icons/maximize-2'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import Plus from 'lucide-svelte/icons/plus'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import type { TFunction } from 'i18next'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import type { TransformAnimatableProperty } from '@/types/keyframe'
  import type { GraphKeyframePoint, GraphViewport } from './types'
  import { DEFAULT_GRAPH_PADDING, PROPERTY_VALUE_RANGES } from './types'
  import GraphGrid from './graph-grid.svelte'
  import GraphKeyframes from './graph-keyframe.svelte'
  import { GraphCurves, GraphExtensionLines, GraphPlayhead } from './graph-curve'
  import GraphHandles from './graph-handles.svelte'
  import GraphTransitionRegions from './graph-transition-regions.svelte'
  import { getKeyframePropertyLabel } from '@/features/keyframes/utils/property-i18n'
  import { useGraphInteraction } from './use-graph-interaction.svelte'
  import { getGraphDimensions } from './use-graph-viewport.svelte'
  import { KeyframeSvgMarquee } from '../keyframe-marquee'
  import { getCombinedGraphValueRange } from './value-range-utils'
  import { sampleProceduralCurve } from '@/features/keyframes/utils/procedural-preview'
  import type { ValueGraphEditorBaseProps } from './value-graph-editor-props'

  let {
    frameViewport,
    onFrameViewportChange,
    itemId,
    keyframesByProperty,
    selectedProperty = null,
    overlayProperties,
    selectedKeyframeIds = EMPTY_SELECTION,
    currentFrame = 0,
    itemFrom = 0,
    totalFrames = 300,
    fps = 30,
    width = 600,
    height = 300,
    onKeyframeMove,
    onDuplicateKeyframes,
    previewFramesById = null,
    constrainFrameDelta,
    onBezierHandleMove,
    onSelectionChange,
    onPropertyChange,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onDragStart,
    onDragEnd,
    onAddKeyframe,
    onRemoveKeyframes,
    onNavigateToKeyframe,
    transitionBlockedRanges = EMPTY_BLOCKED_RANGES,
    proceduralPreview,
    snapEnabled: controlledSnapEnabled,
    handleVisibility = 'selected',
    rulerUnit = 'frames',
    autoZoomGraphHeight = false,
    externalValueZoomLevel,
    disabled = false,
    hidePlayhead = false,
    class: className,
    chrome,
  }: ValueGraphEditorBaseProps = $props()

  const isEmbedded = $derived(chrome === 'embedded')
  const showToolbar = $derived(!isEmbedded)
  const showKeyboardHints = $derived(!isEmbedded)
  const borderless = $derived(isEmbedded)
  const hideXLabels = $derived(isEmbedded)
  const padding = $derived(
    hideXLabels ? { ...DEFAULT_GRAPH_PADDING, bottom: 8 } : DEFAULT_GRAPH_PADDING,
  )
  let svg = $state<SVGSVGElement | null>(null)
  const uid = $props.id()
  const graphClipPathId = uid.replace(/[^a-zA-Z0-9_-]/g, '')

  // Track if playhead is being scrubbed (to prevent background click deselection)
  let isScrubbing = false

  // Calculate heights for layout
  // Toolbar: ~28px (min-h-7), gaps: ~4px (gap-1)
  const toolbarHeight = $derived(showToolbar ? 28 : 0)
  const gaps = $derived(showToolbar ? 4 : 0)
  const totalFixedHeight = $derived(toolbarHeight + gaps)
  const graphHeight = $derived(Math.max(60, height - totalFixedHeight))
  const graphAreaWidth = $derived(width - padding.left - padding.right)
  const graphAreaHeight = $derived(graphHeight - padding.top - padding.bottom)

  // Get available properties
  const availableProperties = $derived(Object.keys(keyframesByProperty) as AnimatableProperty[])
  const visibleProperties = $derived(
    overlayProperties && overlayProperties.length > 0
      ? overlayProperties.filter((property) => availableProperties.includes(property))
      : availableProperties,
  )

  // Determine which property is active vs just visible
  const displayProperty = $derived(
    selectedProperty && visibleProperties.includes(selectedProperty) ? selectedProperty : null,
  )
  const viewportProperty = $derived(displayProperty ?? visibleProperties[0] ?? null)

  // Get keyframes for the selected property
  const keyframes = $derived(displayProperty ? keyframesByProperty[displayProperty] || [] : [])

  // Get property value range for fixed viewport bounds
  const propertyRange = $derived(viewportProperty ? PROPERTY_VALUE_RANGES[viewportProperty] : null)
  const viewportValueRange = $derived(
    getCombinedGraphValueRange(
      visibleProperties.map((property) => PROPERTY_VALUE_RANGES[property] ?? null),
      visibleProperties.map((property) => keyframesByProperty[property] || []),
      autoZoomGraphHeight,
    ),
  )
  const baseValueSpan = $derived(Math.max(0.0001, viewportValueRange.max - viewportValueRange.min))
  const minZoomValueSpan = $derived(Math.max(baseValueSpan * 0.02, 0.0001))
  const valueZoomRatioBase = $derived(Math.max(1, baseValueSpan / minZoomValueSpan))

  // Viewport with fixed bounds based on property range and clip duration
  const fittedViewport = $derived<GraphViewport>({
    width,
    height: graphHeight,
    startFrame: 0,
    endFrame: Math.max(totalFrames, 60),
    minValue: viewportValueRange.min,
    maxValue: viewportValueRange.max,
  })

  let viewport = $state.raw<GraphViewport>(untrack(() => fittedViewport))
  const updateViewport = (next: GraphViewport | ((prev: GraphViewport) => GraphViewport)) => {
    const prev = viewport
    const resolved = typeof next === 'function' ? next(prev) : next
    if (resolved.startFrame !== prev.startFrame || resolved.endFrame !== prev.endFrame) {
      onFrameViewportChange?.({
        startFrame: resolved.startFrame,
        endFrame: resolved.endFrame,
      })
    }
    viewport = resolved
  }

  const snapEnabled = $derived(controlledSnapEnabled ?? true)

  // Update viewport when keyframes or property changes
  $effect(() => {
    const next = fittedViewport
    void displayProperty
    const shared = frameViewport
    viewport = shared
      ? {
          ...next,
          startFrame: shared.startFrame,
          endFrame: shared.endFrame,
        }
      : next
  })

  $effect(() => {
    const shared = frameViewport
    if (!shared) return
    const prev = untrack(() => viewport)
    if (prev.startFrame === shared.startFrame && prev.endFrame === shared.endFrame) {
      return
    }
    viewport = {
      ...prev,
      startFrame: shared.startFrame,
      endFrame: shared.endFrame,
    }
  })

  $effect(() => {
    const zoomLevel = externalValueZoomLevel
    if (zoomLevel === undefined) {
      return
    }
    const range = viewportValueRange
    const ratioBase = valueZoomRatioBase
    const minSpan = minZoomValueSpan
    const baseSpan = baseValueSpan

    const prev = untrack(() => viewport)
    if (ratioBase <= 1 || zoomLevel <= 0) {
      if (prev.minValue === range.min && prev.maxValue === range.max) {
        return
      }

      viewport = {
        ...prev,
        minValue: range.min,
        maxValue: range.max,
      }
      return
    }

    const normalized = Math.max(0, Math.min(1, zoomLevel / 100))
    const nextSpan = Math.max(minSpan, baseSpan / Math.pow(ratioBase, normalized))
    const baseCenter = (range.min + range.max) / 2
    let center = (prev.minValue + prev.maxValue) / 2

    if (!Number.isFinite(center)) {
      center = baseCenter
    }

    let nextMin = center - nextSpan / 2
    let nextMax = center + nextSpan / 2

    if (nextMin < range.min) {
      nextMax += range.min - nextMin
      nextMin = range.min
    }
    if (nextMax > range.max) {
      nextMin -= nextMax - range.max
      nextMax = range.max
    }

    nextMin = Math.max(range.min, nextMin)
    nextMax = Math.min(range.max, nextMax)

    if (prev.minValue === nextMin && prev.maxValue === nextMax) {
      return
    }

    viewport = {
      ...prev,
      minValue: nextMin,
      maxValue: nextMax,
    }
  })

  function createPointsForProperty(property: AnimatableProperty): GraphKeyframePoint[] {
    const propertyKeyframes = keyframesByProperty[property] || []
    const { graphLeft, graphTop, graphWidth, graphHeight, frameRange } = getGraphDimensions(
      viewport,
      padding,
    )
    const valueRange = Math.max(0.0001, viewport.maxValue - viewport.minValue)

    return propertyKeyframes.map((keyframe) => ({
      keyframe,
      itemId,
      property,
      x: graphLeft + ((keyframe.frame - viewport.startFrame) / frameRange) * graphWidth,
      y: graphTop + (1 - (keyframe.value - viewport.minValue) / valueRange) * graphHeight,
      isSelected: selectedKeyframeIds.has(keyframe.id),
      isDragging: false,
    }))
  }

  // Convert keyframes to graph points
  const points = $derived.by((): GraphKeyframePoint[] => {
    if (!displayProperty) return []
    return createPointsForProperty(displayProperty)
  })

  // Dashed ghost curves for procedural generators (drift/breath/shake/audio),
  // sampled analytically across the viewport — non-interactive, until baked.
  const proceduralCurvePaths = $derived.by(
    (): Array<{ property: AnimatableProperty; d: string; primary: boolean }> => {
      if (
        !proceduralPreview ||
        (proceduralPreview.modifiers.length === 0 && (proceduralPreview.layers?.length ?? 0) === 0)
      )
        return []
      const { graphLeft, graphTop, graphWidth, graphHeight, frameRange } = getGraphDimensions(
        viewport,
        padding,
      )
      const valueRange = Math.max(0.0001, viewport.maxValue - viewport.minValue)
      const fromFrame = Math.max(0, Math.floor(viewport.startFrame))
      const toFrame = Math.ceil(viewport.endFrame)
      // ~1 sample per 2px keeps the curve smooth without oversampling.
      const step = Math.max(1, Math.round((toFrame - fromFrame) / Math.max(1, graphWidth / 2)))

      const candidates = [displayProperty, ...(overlayProperties ?? [])].filter(
        (property): property is AnimatableProperty => property != null,
      )
      const seen = new Set<AnimatableProperty>()
      const result: Array<{ property: AnimatableProperty; d: string; primary: boolean }> = []
      for (const property of candidates) {
        if (seen.has(property)) continue
        seen.add(property)
        const samples = sampleProceduralCurve({
          property: property as TransformAnimatableProperty,
          base: proceduralPreview.base,
          keyframes: proceduralPreview.keyframes,
          modifiers: proceduralPreview.modifiers,
          layers: proceduralPreview.layers,
          fromFrame,
          toFrame,
          step,
          fps,
          frameWidth: proceduralPreview.frameWidth,
          frameHeight: proceduralPreview.frameHeight,
        })
        if (samples.length < 2) continue
        const d = samples
          .map((sample, index) => {
            const x = graphLeft + ((sample.frame - viewport.startFrame) / frameRange) * graphWidth
            const y =
              graphTop + (1 - (sample.value - viewport.minValue) / valueRange) * graphHeight
            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`
          })
          .join(' ')
        result.push({ property, d, primary: property === displayProperty })
      }
      return result
    },
  )

  // Generate overlay points for additional properties (visual-only curves)
  const overlayPointSets = $derived.by(
    (): Array<{ property: AnimatableProperty; points: GraphKeyframePoint[]; color: string }> => {
      if (!overlayProperties || overlayProperties.length === 0) return []

      return overlayProperties
        .filter((prop) => prop !== displayProperty) // skip the primary property
        .map((prop, index) => {
          const overlayPoints = createPointsForProperty(prop)
          if (overlayPoints.length === 0) return null

          return {
            property: prop,
            points: overlayPoints,
            color: OVERLAY_COLORS[index % OVERLAY_COLORS.length]!,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    },
  )
  const interactivePoints = $derived([
    ...points,
    ...overlayPointSets.flatMap((overlaySet) => overlaySet.points),
  ])

  // Calculate snap targets for keyframe dragging
  const snapTargets = $derived.by(() => {
    // Frame targets: other keyframe frames, playhead position
    const frameTargets: number[] = []
    // Value targets: 0, min, max, and other keyframe values
    const valueTargets: number[] = []

    // Add special frame targets
    frameTargets.push(0) // Start of clip
    frameTargets.push(currentFrame) // Playhead position

    // Add special value targets based on property range
    if (propertyRange) {
      valueTargets.push(propertyRange.min)
      valueTargets.push(propertyRange.max)
      // Add 0 if it's within range
      if (propertyRange.min <= 0 && propertyRange.max >= 0) {
        valueTargets.push(0)
      }
      // Add 1 for normalized properties (opacity, scale)
      if (propertyRange.min <= 1 && propertyRange.max >= 1) {
        valueTargets.push(1)
      }
    }

    // Add other keyframes' positions (excluding currently selected ones)
    for (const kf of keyframes) {
      if (!selectedKeyframeIds.has(kf.id)) {
        frameTargets.push(kf.frame)
        valueTargets.push(kf.value)
      }
    }

    // Remove duplicates
    return {
      frameTargets: [...new Set(frameTargets)],
      valueTargets: [...new Set(valueTargets)],
    }
  })

  // Interaction handlers
  const interaction = useGraphInteraction(() => ({
    viewport,
    padding,
    points: interactivePoints,
    selectedKeyframeIds,
    maxFrame: totalFrames,
    minValue: displayProperty ? PROPERTY_VALUE_RANGES[displayProperty]?.min : undefined,
    maxValue: displayProperty ? PROPERTY_VALUE_RANGES[displayProperty]?.max : undefined,
    onViewportChange: updateViewport,
    onSelectionChange,
    onBackgroundClick: () => onPropertyChange?.(null),
    onKeyframeMove,
    onDuplicateKeyframes,
    constrainFrameDelta,
    onBezierHandleMove,
    onDragStart,
    onDragEnd,
    snapEnabled,
    snapFrameTargets: snapTargets.frameTargets,
    snapValueTargets: snapTargets.valueTargets,
    blockedFrameRanges: transitionBlockedRanges,
    disabled,
  }))
  const {
    handleKeyframePointerDown,
    handleKeyframeClick,
    handleBezierPointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleBackgroundPointerDown,
    handleBackgroundClick,
    zoomIn,
    zoomOut,
    fitToContent,
  } = interaction
  const dragState = $derived(interaction.dragState)
  const isDragging = $derived(interaction.isDragging)
  const previewValues = $derived(interaction.previewValues)
  const previewBezierConfigs = $derived(interaction.previewBezierConfigs)
  const constraintAxis = $derived(interaction.constraintAxis)

  // Update points with drag state and preview positions
  const pointsWithDragState = $derived.by(() => {
    // If we're dragging and have preview values, update every dragged point's position
    if (isDragging && dragState?.type === 'keyframe' && previewValues) {
      const { graphLeft, graphTop, graphWidth, graphHeight, frameRange } = getGraphDimensions(
        viewport,
        padding,
      )

      return interactivePoints.map((point) => {
        const previewValue = previewValues[point.keyframe.id]
        if (previewValue) {
          const pointValueRange = Math.max(0.0001, viewport.maxValue - viewport.minValue)
          // Calculate new screen position from preview values
          const newX =
            graphLeft + ((previewValue.frame - viewport.startFrame) / frameRange) * graphWidth
          const newY =
            graphTop +
            (1 - (previewValue.value - viewport.minValue) / pointValueRange) * graphHeight
          return {
            ...point,
            x: newX,
            y: newY,
            isDragging: true,
          }
        }
        return {
          ...point,
          isDragging: false,
        }
      })
    }

    if (previewFramesById) {
      const { graphLeft, graphWidth, frameRange } = getGraphDimensions(viewport, padding)

      return interactivePoints.map((point) => {
        const previewFrame = previewFramesById[point.keyframe.id]
        if (previewFrame === undefined) {
          return {
            ...point,
            isDragging: false,
          }
        }

        return {
          ...point,
          x: graphLeft + ((previewFrame - viewport.startFrame) / frameRange) * graphWidth,
          isDragging: true,
        }
      })
    }

    // Not dragging - just update isDragging flag
    return interactivePoints.map((point) => ({
      ...point,
      isDragging: dragState?.draggedKeyframeIds?.includes(point.keyframe.id) ?? false,
    }))
  })
  const primaryPointsWithDragState = $derived(
    pointsWithDragState.filter((point) => point.property === displayProperty),
  )
  const combinedPreviewValues = $derived.by(() => {
    if (!previewFramesById) {
      return previewValues
    }

    const mergedPreviewValues = previewValues ? { ...previewValues } : {}
    let hasPreviewValue = previewValues !== null

    for (const point of interactivePoints) {
      const previewFrame = previewFramesById[point.keyframe.id]
      if (previewFrame === undefined) {
        continue
      }

      mergedPreviewValues[point.keyframe.id] = {
        frame: previewFrame,
        value: previewValues?.[point.keyframe.id]?.value ?? point.keyframe.value,
      }
      hasPreviewValue = true
    }

    return hasPreviewValue ? mergedPreviewValues : null
  })
  const overlayPointSetsWithDragState = $derived.by(() => {
    const pointById = new Map(pointsWithDragState.map((point) => [point.keyframe.id, point]))
    return overlayPointSets.map((overlaySet) => ({
      ...overlaySet,
      points: overlaySet.points.map((point) => pointById.get(point.keyframe.id) ?? point),
    }))
  })
  const handleVisibleKeyframePointerDown = (point: GraphKeyframePoint, event: PointerEvent) => {
    if (point.property !== displayProperty) {
      onPropertyChange?.(point.property)
    }
    handleKeyframePointerDown(point, event)
  }
  const handleVisibleKeyframeClick = (point: GraphKeyframePoint, event: MouseEvent) => {
    if (point.property !== displayProperty) {
      onPropertyChange?.(point.property)
    }
    handleKeyframeClick(point, event)
  }

  // Reset viewport (fit to content)
  const resetViewport = () => {
    updateViewport(fittedViewport)
  }

  // Handle property change
  const handlePropertySelect = (value: string) => {
    const newProperty = value === 'all' ? null : (value as AnimatableProperty)
    onPropertyChange?.(newProperty)
  }

  // Get sorted keyframe frames for navigation
  const sortedKeyframeFrames = $derived(keyframes.map((kf) => kf.frame).toSorted((a, b) => a - b))

  // Find previous keyframe frame
  const prevKeyframeFrame = $derived.by(() => {
    for (let i = sortedKeyframeFrames.length - 1; i >= 0; i--) {
      if (sortedKeyframeFrames[i]! < currentFrame) {
        return sortedKeyframeFrames[i]
      }
    }
    return null
  })

  // Find next keyframe frame
  const nextKeyframeFrame = $derived.by(() => {
    for (const frame of sortedKeyframeFrames) {
      if (frame > currentFrame) {
        return frame
      }
    }
    return null
  })

  // Check if there's a keyframe at the current frame
  const hasKeyframeAtCurrentFrame = $derived(keyframes.some((kf) => kf.frame === currentFrame))

  // Get selected keyframe (only when exactly one is selected)
  const selectedKeyframe = $derived.by(() => {
    if (selectedKeyframeIds.size !== 1) return null
    const selectedId = [...selectedKeyframeIds][0]
    return keyframes.find((kf) => kf.id === selectedId) ?? null
  })

  // Local state for input fields (commit on Enter/blur)
  let frameInputValue = $state('')
  let valueInputValue = $state('')

  // Get decimal places for current property
  const valueDecimals = $derived(propertyRange?.decimals ?? 2)

  // Format value based on property's decimal setting
  const formatValue = (value: number) => {
    return valueDecimals === 0 ? String(Math.round(value)) : value.toFixed(valueDecimals)
  }

  // Sync local input state when selected keyframe changes
  $effect(() => {
    const keyframe = selectedKeyframe
    void valueDecimals
    if (keyframe) {
      frameInputValue = String(keyframe.frame)
      valueInputValue = formatValue(keyframe.value)
    }
  })

  // Commit frame value
  const commitFrameValue = () => {
    if (!selectedKeyframe || !displayProperty || !onKeyframeMove) return

    const newFrame = Math.round(Number(frameInputValue))
    if (isNaN(newFrame)) {
      // Reset to current value if invalid
      frameInputValue = String(selectedKeyframe.frame)
      return
    }

    // Clamp to valid range
    const clampedFrame = Math.max(0, Math.min(totalFrames - 1, newFrame))

    // Skip if no change
    if (clampedFrame === selectedKeyframe.frame) {
      frameInputValue = String(selectedKeyframe.frame)
      return
    }

    // Wrap in undo batch
    onDragStart?.()
    onKeyframeMove(
      { itemId, property: displayProperty, keyframeId: selectedKeyframe.id },
      clampedFrame,
      selectedKeyframe.value,
    )
    onDragEnd?.()

    // Move playhead to the new frame
    onNavigateToKeyframe?.(clampedFrame)
  }

  // Commit value
  const commitValueInput = () => {
    if (!selectedKeyframe || !displayProperty || !onKeyframeMove) return

    const newValue = Number(valueInputValue)
    if (isNaN(newValue)) {
      // Reset to current value if invalid
      valueInputValue = formatValue(selectedKeyframe.value)
      return
    }

    // Clamp to property range
    const range = PROPERTY_VALUE_RANGES[displayProperty]
    const clampedValue = range ? Math.max(range.min, Math.min(range.max, newValue)) : newValue

    // Skip if no change (with small epsilon for floating point)
    if (Math.abs(clampedValue - selectedKeyframe.value) < 0.0001) {
      valueInputValue = formatValue(selectedKeyframe.value)
      return
    }

    // Wrap in undo batch
    onDragStart?.()
    onKeyframeMove(
      { itemId, property: displayProperty, keyframeId: selectedKeyframe.id },
      selectedKeyframe.frame,
      clampedValue,
    )
    onDragEnd?.()
  }

  // Handle key down for Enter to commit
  const handleInputKeyDown = (
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
    commitFn: () => void,
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
      commitFn()
    } else if (e.key === 'Escape') {
      // Reset on escape
      if (selectedKeyframe) {
        frameInputValue = String(selectedKeyframe.frame)
        valueInputValue = formatValue(selectedKeyframe.value)
      }
      e.currentTarget.blur()
    }
  }

  // Navigate to previous keyframe and select it
  const goToPrevKeyframe = () => {
    if (prevKeyframeFrame !== null && prevKeyframeFrame !== undefined && onNavigateToKeyframe) {
      onNavigateToKeyframe(prevKeyframeFrame)
      // Select the keyframe at that frame
      const keyframeAtFrame = keyframes.find((kf) => kf.frame === prevKeyframeFrame)
      if (keyframeAtFrame && onSelectionChange) {
        onSelectionChange(new Set([keyframeAtFrame.id]))
      }
    }
  }

  // Navigate to next keyframe and select it
  const goToNextKeyframe = () => {
    if (nextKeyframeFrame !== null && onNavigateToKeyframe) {
      onNavigateToKeyframe(nextKeyframeFrame)
      // Select the keyframe at that frame
      const keyframeAtFrame = keyframes.find((kf) => kf.frame === nextKeyframeFrame)
      if (keyframeAtFrame && onSelectionChange) {
        onSelectionChange(new Set([keyframeAtFrame.id]))
      }
    }
  }

  // Add keyframe at current frame
  const handleAddKeyframe = () => {
    if (displayProperty && onAddKeyframe) {
      onAddKeyframe(displayProperty, currentFrame)
    }
  }

  // Remove selected keyframes
  const handleRemoveKeyframes = () => {
    if (!displayProperty || !onRemoveKeyframes) return

    const refs: KeyframeRef[] = []
    for (const kfId of selectedKeyframeIds) {
      refs.push({
        itemId,
        property: displayProperty,
        keyframeId: kfId,
      })
    }

    if (refs.length > 0) {
      onRemoveKeyframes(refs)
    }
  }

  // Wrapped scrub handler that tracks scrubbing state
  const handlePlayheadScrubStart = () => {
    isScrubbing = true
    onScrubStart?.()
  }

  const handlePlayheadScrubEnd = () => {
    onScrubEnd?.()
    // Delay clearing the flag to prevent click event from deselecting
    setTimeout(() => {
      isScrubbing = false
    }, 100)
  }

  const handleGraphCanvasClick = (event: MouseEvent) => {
    if (isScrubbing) return

    const target = event.target as Element | null
    if (target?.closest('.graph-keyframe, .bezier-handle, .graph-playhead')) {
      return
    }

    handleBackgroundClick(event)
  }

  // Attach a non-passive native wheel listener to prevent page scroll
  $effect(() => {
    const node = svg
    if (!node) return

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault()
    }

    node.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', handleNativeWheel)
    }
  })

  const constraintGuide = $derived.by(() => {
    if (!isDragging || !constraintAxis || dragState?.type !== 'keyframe') return null
    const draggingPoint = pointsWithDragState.find((p) => p.keyframe.id === dragState.keyframeId)
    if (!draggingPoint) return null

    const { graphLeft, graphTop, graphWidth, graphHeight } = getGraphDimensions(viewport, padding)
    return constraintAxis === 'x'
      ? // Horizontal constraint line (frame only movement)
        { x1: graphLeft, y1: draggingPoint.y, x2: graphLeft + graphWidth, y2: draggingPoint.y }
      : // Vertical constraint line (value only movement)
        { x1: draggingPoint.x, y1: graphTop, x2: draggingPoint.x, y2: graphTop + graphHeight }
  })

  const tr = t as TFunction
  const numberInputClass =
    'h-5 text-[10px] px-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
</script>

{#snippet toolbarButton(
  label: string,
  onclick: () => void,
  isDisabled: boolean,
  icon: typeof ZoomIn,
  buttonClass = 'h-7 w-7 p-0',
  variant: 'ghost' | 'secondary' = 'ghost',
)}
  {@const Icon = icon}
  <Tooltip>
    <TooltipTrigger {onclick}>
      {#snippet child({ props })}
        <Button {...props} {variant} size="sm" class={buttonClass} disabled={isDisabled}>
          <Icon class="h-3.5 w-3.5" />
        </Button>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent side="bottom">
      {label}
    </TooltipContent>
  </Tooltip>
{/snippet}

<div
  class={cn('flex h-full flex-col overflow-hidden', showToolbar ? 'gap-1' : 'gap-0', className)}
  style:height="{height}px"
>
  <!-- Toolbar -->
  {#if showToolbar}
    <div class="flex items-center justify-between px-2 flex-shrink-0 min-h-7">
      <div class="flex items-center gap-2">
        <!-- Property selector -->
        <Select
          value={displayProperty || 'all'}
          onValueChange={handlePropertySelect}
          disabled={disabled || availableProperties.length === 0}
        >
          <SelectTrigger class="w-[140px] h-7 text-xs focus:ring-0 focus:ring-offset-0">
            <SelectValue
              placeholder={t('timeline.keyframeEditor.selectProperty', {
                defaultValue: 'Select property',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {#each availableProperties as prop (prop)}
              <SelectItem value={prop} class="text-xs">
                {getKeyframePropertyLabel(tr, prop)}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>

        <!-- Keyframe count -->
        <span class="text-xs text-muted-foreground">
          {t('timeline.keyframeEditor.keyframes', { count: keyframes.length })}
        </span>
      </div>

      <!-- Keyframe controls -->
      <div class="flex items-center gap-1">
        <!-- Navigation -->
        {@render toolbarButton(
          t('timeline.keyframeEditor.previousKeyframe', { defaultValue: 'Previous keyframe' }),
          goToPrevKeyframe,
          disabled || prevKeyframeFrame === null || !onNavigateToKeyframe,
          ChevronLeft,
        )}
        {@render toolbarButton(
          t('timeline.keyframeEditor.nextKeyframe', { defaultValue: 'Next keyframe' }),
          goToNextKeyframe,
          disabled || nextKeyframeFrame === null || !onNavigateToKeyframe,
          ChevronRight,
        )}

        <!-- Separator -->
        <div class="w-px h-4 bg-border mx-1"></div>

        <!-- Add/Remove -->
        {@render toolbarButton(
          hasKeyframeAtCurrentFrame
            ? t('timeline.keyframeEditor.keyframeExistsAtCurrentFrame', {
                defaultValue: 'Keyframe exists at current frame',
              })
            : t('timeline.keyframeEditor.addKeyframeAtCurrentFrame', {
                defaultValue: 'Add keyframe at current frame',
              }),
          handleAddKeyframe,
          disabled || !displayProperty || !onAddKeyframe || hasKeyframeAtCurrentFrame,
          Plus,
          'h-7 w-7 p-0',
          hasKeyframeAtCurrentFrame ? 'secondary' : 'ghost',
        )}
        {@render toolbarButton(
          selectedKeyframeIds.size > 0
            ? t('timeline.keyframeEditor.removeSelectedKeyframesCount', {
                count: selectedKeyframeIds.size,
                defaultValue:
                  selectedKeyframeIds.size === 1
                    ? 'Remove {{count}} selected keyframe'
                    : 'Remove {{count}} selected keyframes',
              })
            : t('timeline.keyframeEditor.removeSelectedKeyframes', {
                defaultValue: 'Remove selected keyframes',
              }),
          handleRemoveKeyframes,
          disabled || selectedKeyframeIds.size === 0 || !onRemoveKeyframes,
          Trash2,
          'h-7 w-7 p-0 text-destructive hover:text-destructive',
        )}

        <!-- Separator -->
        <div class="w-px h-4 bg-border mx-1"></div>

        <!-- Precise value inputs (always reserve space to prevent layout shift) -->
        <div class="flex items-center gap-0.5">
          <span class="text-[10px] text-muted-foreground">F:</span>
          <Input
            type="number"
            value={selectedKeyframe ? frameInputValue : ''}
            oninput={(e) => (frameInputValue = e.currentTarget.value)}
            onblur={commitFrameValue}
            onkeydown={(e) => handleInputKeyDown(e, commitFrameValue)}
            placeholder="-"
            class="w-12 {numberInputClass}"
            min={0}
            max={totalFrames - 1}
            disabled={disabled || !onKeyframeMove || !selectedKeyframe}
          />
        </div>
        <div class="flex items-center gap-0.5">
          <span class="text-[10px] text-muted-foreground">V:</span>
          <Input
            type="number"
            value={selectedKeyframe ? valueInputValue : ''}
            oninput={(e) => (valueInputValue = e.currentTarget.value)}
            onblur={commitValueInput}
            onkeydown={(e) => handleInputKeyDown(e, commitValueInput)}
            step={0.01}
            placeholder="-"
            class="w-14 {numberInputClass}"
            min={propertyRange?.min}
            max={propertyRange?.max}
            disabled={disabled || !onKeyframeMove || !selectedKeyframe}
          />
        </div>
        <div class="w-px h-4 bg-border mx-1"></div>
      </div>

      <!-- Zoom controls -->
      <div class="flex items-center gap-1">
        {@render toolbarButton(
          t('timeline.keyframeEditor.zoomOut', { defaultValue: 'Zoom out' }),
          zoomOut,
          disabled,
          ZoomOut,
        )}
        {@render toolbarButton(
          t('timeline.keyframeEditor.zoomIn', { defaultValue: 'Zoom in' }),
          zoomIn,
          disabled,
          ZoomIn,
        )}
        {@render toolbarButton(
          t('timeline.keyframeEditor.fitToContent', { defaultValue: 'Fit to content' }),
          fitToContent,
          disabled || keyframes.length === 0,
          Maximize2,
        )}
        {@render toolbarButton(
          t('timeline.keyframeEditor.resetView', { defaultValue: 'Reset view' }),
          resetViewport,
          disabled,
          RotateCcw,
        )}
      </div>
    </div>
  {/if}

  <!-- Graph -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions -->
  <svg
    bind:this={svg}
    {width}
    height={graphHeight}
    class={cn(
      'flex-shrink-0',
      !borderless && 'border border-border rounded-md',
      disabled && 'opacity-50 pointer-events-none',
    )}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointerleave={handlePointerUp}
    onwheel={handleWheel}
    onclick={handleGraphCanvasClick}
    style:touch-action="none"
    style:cursor={isDragging && dragState?.type === 'keyframe' ? 'pointer' : undefined}
  >
    <defs>
      <clipPath id={graphClipPathId}>
        <!-- Extends up through the top margin (y=0) so the playhead line can
             reach the SVG's top edge and visually join the ruler flag above.
             Curves/keyframes never draw above `padding.top`, so widening the
             clip upward only affects the playhead. -->
        <rect
          x={padding.left}
          y={0}
          width={graphAreaWidth}
          height={graphAreaHeight + padding.top}
          rx={4}
        />
      </clipPath>
    </defs>

    <!-- Grid background -->
    <GraphGrid
      {viewport}
      {padding}
      {rulerUnit}
      {fps}
      labelVisibility={hideXLabels ? 'y-only' : 'both'}
    />

    <!-- Dedicated hit target for empty graph-space interactions -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <rect
      x={padding.left}
      y={padding.top}
      width={graphAreaWidth}
      height={graphAreaHeight}
      rx={4}
      fill="transparent"
      onpointerdown={handleBackgroundPointerDown}
    />

    <g clip-path="url(#{graphClipPathId})">
      <!-- Transition blocked regions (rendered before curves/keyframes) -->
      {#if transitionBlockedRanges.length > 0}
        <GraphTransitionRegions {viewport} {padding} blockedRanges={transitionBlockedRanges} />
      {/if}

      <!-- Extension lines (before/after keyframes) -->
      <GraphExtensionLines points={primaryPointsWithDragState} {viewport} {padding} />

      <!-- Procedural ghost curves (dashed, non-interactive) — drawn behind
           keyframe curves; sky-tinted to match the generator cues. -->
      {#each proceduralCurvePaths as { property: prop, d, primary } (`procedural-${prop}`)}
        <path
          {d}
          fill="none"
          stroke="#38bdf8"
          stroke-width={primary ? 1.5 : 1}
          stroke-dasharray="4 3"
          stroke-opacity={primary ? 0.85 : 0.4}
          stroke-linecap="round"
          stroke-linejoin="round"
          style:pointer-events="none"
        />
      {/each}

      <!-- Overlay curves for additional properties (rendered first, behind primary) -->
      {#each overlayPointSetsWithDragState as { property: prop, points: overlayPts, color } (prop)}
        <g opacity={0.5}>
          <GraphCurves points={overlayPts} strokeColor={color} />
        </g>
      {/each}

      <!-- Primary interpolation curves -->
      <GraphCurves points={primaryPointsWithDragState} {selectedKeyframeIds} {previewBezierConfigs} />

      <!-- Playhead (rendered before keyframes so keyframes get click priority) -->
      <GraphPlayhead
        frame={currentFrame}
        {itemFrom}
        {viewport}
        {padding}
        {totalFrames}
        {fps}
        {onScrub}
        onScrubStart={handlePlayheadScrubStart}
        onScrubEnd={handlePlayheadScrubEnd}
        {disabled}
        visuals={hidePlayhead ? 'hidden' : 'visible'}
      />

      <!-- Bezier handles (for selected keyframes with cubic-bezier easing) -->
      <GraphHandles
        points={primaryPointsWithDragState}
        {selectedKeyframeIds}
        onHandlePointerDown={handleBezierPointerDown}
        draggingHandle={interaction.draggingHandle}
        {previewBezierConfigs}
        {handleVisibility}
        {disabled}
      />

      <!-- Keyframe points (rendered last for highest click priority) -->
      <GraphKeyframes
        points={pointsWithDragState}
        previewValuesById={combinedPreviewValues}
        onPointerDown={handleVisibleKeyframePointerDown}
        onClick={handleVisibleKeyframeClick}
        {rulerUnit}
        {fps}
        {disabled}
      />

      <!-- Marquee selection overlay -->
      <KeyframeSvgMarquee rect={interaction.marqueeRect} />

      <!-- Constraint guide line when Shift is held during drag -->
      {#if constraintGuide}
        <line
          x1={constraintGuide.x1}
          y1={constraintGuide.y1}
          x2={constraintGuide.x2}
          y2={constraintGuide.y2}
          stroke="#f97316"
          stroke-width={1.5}
          stroke-dasharray="6 3"
          opacity={0.8}
          pointer-events="none"
        />
      {/if}
    </g>
  </svg>

  <!-- Keyboard hints (shows when dragging) -->
  {#if showKeyboardHints && isDragging && dragState?.type === 'keyframe'}
    <div class="text-xs text-muted-foreground text-center space-x-3">
      <span>
        <kbd class="px-1 py-0.5 bg-muted rounded text-[10px]">Shift</kbd>
        {t('timeline.keyframeEditor.constrainAxis', { defaultValue: 'constrain axis' })}
      </span>
      <span>
        <kbd class="px-1 py-0.5 bg-muted rounded text-[10px]">Alt</kbd>
        {t('timeline.keyframeEditor.fineAdjust', { defaultValue: 'fine adjust' })}
      </span>
    </div>
  {/if}
</div>
