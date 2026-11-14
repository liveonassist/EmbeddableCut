<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { select } from '$lib/store.svelte'
  import {
    type MotionSelectionDragState,
    buildMotionSelectionDragState,
    buildMotionSelectionFrameUpdates,
    getMotionCompositionSnapFrames,
    mergeMotionKeyframeSelection,
  } from '../motion-keyframe-selection'
  import type { MotionDopesheetLanesProps } from '../motion-dopesheet-lanes-equality'
  import {
    LAYER_COLUMN_WIDTH,
    MOTION_INLINE_PROPERTY_GROUP_IDS,
    RULER_DIVISIONS,
    useSettledMotionFrame,
  } from '../motion-timeline-primitives'
  import {
    MOTION_VECTOR_ROW_DEFINITIONS,
    buildMotionVectorSeparationProperties,
    canCombineMotionVectorRowWithoutBake,
    isMotionVectorRowSeparated,
    motionVectorSeparationNeedsBake,
    shouldUseMotionVectorRow,
    toMotionVectorProxyKeyframes,
  } from '../motion-vector-rows'
  import {
    MAX_DIMENSION_BAKE_FRAMES,
    MOTION_GRAPH_INLINE_PROPERTY_GROUP_IDS,
    MOTION_INLINE_PROPERTY_GROUP_ID_SET,
    POSITION_VECTOR_ROW,
    buildMotionPropertyValues,
    buildPropertyLinkHandlers,
    buildPropertyLinkSourceLabels,
    createMotionPositionValueSource,
    createMotionScaleValueSource,
    getMotionDopesheetLaneHeight,
    getMotionVectorValue,
    getSelectedMotionVectorKeyframes,
    isMotionPropertyVisible,
    partitionMotionVectorReferences,
    resolveMotionVectorReference,
    withoutPropertyExpressions,
    type MotionPositionValueContext,
  } from './motion-dopesheet-model'
  import { getSourceDimensions, resolveTransform } from '@/features/editor/deps/composition-runtime'
  import { getAnimatablePropertyBaseValue } from '@/features/editor/deps/keyframes'
  import {
    findStoredVectorKeyframe,
    getStoredVectorKeyframeId,
    getVectorPropertyProxy,
  } from '@/features/editor/deps/keyframes-contract'
  import { type ItemPreview, useGizmoStore } from '@/features/editor/deps/preview'
  import {
    DopesheetEditor,
    GROUP_HEADER_HEIGHT,
    ROW_HEIGHT,
    addKeyframe,
    buildVectorPromotionPlan,
    captureSnapshot,
    getProceduralBands,
    getPropertyAccordionGroups,
    interpolatePropertyValue,
    promoteTransformToVector,
    removeKeyframes,
    removeVectorKeyframe,
    resolveAnimatedTransform,
    resolveExpressionReferenceValue,
    setVectorDimensionsSeparated,
    updateItem,
    updateKeyframe,
    updateKeyframes,
    updateVectorKeyframe,
    upsertVectorKeyframe,
    useItemsStore,
    useKeyframeSelectionStore,
    useKeyframesStore,
    useRafCoalescedValue,
    useTimelineCommandStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-motion'
  import { useEditorStore } from '@/shared/state/editor'
  import { hasEnabledProceduralMotion } from '@/shared/timeline/procedural-motion'
  import { cn } from '@/shared/ui/cn'
  import {
    type AnimatableProperty,
    type DirectLinkableProperty,
    type Keyframe,
    type KeyframeRef,
    type VectorAnimatableProperty,
    type VectorKeyframe,
    getDirectPropertyLinks,
  } from '@/types/keyframe'

  interface MotionDopesheetContentProps extends MotionDopesheetLanesProps {
    initialExpandedGroups?: Readonly<Record<string, boolean>>
    onExpandedGroupsChange?: (expandedGroups: Record<string, boolean>) => void
    onRenderedHeightChange?: (height: number) => void
  }

  // This orchestration component coordinates independent lane interactions. It
  // is mounted only by the near-viewport shell, so its store subscriptions and
  // property derivations never run for distant expanded rows.
  let {
    item,
    itemKeyframes,
    properties,
    compositionDurationInFrames,
    fps,
    canvas,
    propertyFilter,
    timeViewport,
    inlineCurveProperty,
    paneMode = 'lanes',
    disabled = false,
    onSelectItem,
    onInlineCurveChange,
    onScrub,
    onTimeViewportChange,
    onPropertyLinkPointerDown,
    onRemovePropertyLink,
    onSetPropertyExpression,
    onRemovePropertyExpression,
    initialExpandedGroups,
    onExpandedGroupsChange,
    onRenderedHeightChange,
    itemById,
  }: MotionDopesheetContentProps = $props()

  const settledFrame = useSettledMotionFrame()
  const currentFrame = $derived(settledFrame.current)
  let root: HTMLDivElement | undefined = $state()
  let dragSnapshot: ReturnType<typeof captureSnapshot> | null = null
  let crossLayerDrag: MotionSelectionDragState | null = null
  let pendingCrossLayerDelta: number | null = null
  let crossLayerPreviewFrame: number | null = null
  let paneSize = $state({ width: 0, height: 0 })
  let expressionDockHeight = $state(0)
  const allKeyframesByItemId = select(useKeyframesStore, (state) => state.keyframesByItemId)
  const selectedKeyframesState = select(
    useKeyframeSelectionStore,
    (state) => state.selectedKeyframes,
  )
  const selectedKeyframes = $derived(selectedKeyframesState.current)
  const setKeyframeEditorShortcutScopeActive = (active: boolean) =>
    useEditorStore.getState().setKeyframeEditorShortcutScopeActive(active)
  const clearKeyframeSelection = () => useKeyframeSelectionStore.getState().clearSelection()

  $effect(() => {
    const node = root
    if (!node) return
    const updateSize = () => {
      const rect = node.getBoundingClientRect()
      paneSize = { width: rect.width || 820, height: rect.height }
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(node)
    return () => observer.disconnect()
  })

  $effect(() => () => setKeyframeEditorShortcutScopeActive(false))

  const scalarKeyframesByProperty = $derived.by(() => {
    const byProperty = new Map(
      (itemKeyframes?.properties ?? []).map((entry) => [entry.property, entry.keyframes] as const),
    )
    return Object.fromEntries(
      properties.map((property) => [property, byProperty.get(property) ?? []]),
    ) as Partial<Record<AnimatableProperty, Keyframe[]>>
  })

  const supportsVectorTransform = $derived(item.type !== 'audio' && item.type !== 'adjustment')
  const vectorBaseTransform = $derived(
    supportsVectorTransform
      ? resolveTransform(item, { ...canvas, fps }, getSourceDimensions(item))
      : null,
  )
  const motionVectorRows = $derived(
    supportsVectorTransform
      ? MOTION_VECTOR_ROW_DEFINITIONS.filter(
          (row) =>
            properties.includes(row.primary) &&
            properties.includes(row.secondary) &&
            shouldUseMotionVectorRow(itemKeyframes, row),
        )
      : [],
  )
  const positionDimensionsSeparated = $derived(
    isMotionVectorRowSeparated(itemKeyframes, POSITION_VECTOR_ROW),
  )
  const hiddenPropertyRows: AnimatableProperty[] = $derived(
    motionVectorRows.map((row) => row.secondary),
  )
  const originalKeyframesByProperty = $derived.by(() => {
    const result = { ...scalarKeyframesByProperty }
    if (!vectorBaseTransform) return result
    for (const row of motionVectorRows) {
      const lane =
        itemKeyframes?.vectorProperties?.find((candidate) => candidate.property === row.property) ??
        buildVectorPromotionPlan({
          property: row.property,
          itemKeyframes,
          baseTransform: vectorBaseTransform,
          createId: (frame: number) => `motion-${row.property}-${frame}`,
        }).vectorProperty
      result[row.primary] = toMotionVectorProxyKeyframes(lane.keyframes, 'x')
      result[row.secondary] = toMotionVectorProxyKeyframes(lane.keyframes, 'y')
    }
    return result
  })

  const keyframesByProperty = $derived(
    Object.fromEntries(
      properties.map((property) => [
        property,
        (originalKeyframesByProperty[property] ?? []).map((keyframe) => ({
          ...keyframe,
          frame: item.from + keyframe.frame,
        })),
      ]),
    ),
  )

  const relativeFrame = $derived(
    Math.max(0, Math.min(item.durationInFrames - 1, currentFrame - item.from)),
  )
  const selectedKeyframeValueByProperty = $derived.by(() => {
    const values: Partial<Record<AnimatableProperty, number>> = {}
    for (let index = selectedKeyframes.length - 1; index >= 0; index -= 1) {
      const reference = selectedKeyframes[index]!
      if (reference.itemId !== item.id || values[reference.property] !== undefined) continue
      const keyframe = (originalKeyframesByProperty[reference.property] ?? []).find(
        (candidate) => candidate.id === reference.keyframeId,
      )
      if (keyframe) values[reference.property] = keyframe.value
    }
    return values
  })

  // The property systems: displayed values with and without expressions, the
  // expression reference resolver, and property-link labels and handlers.
  const buildValues = (keyframes: typeof itemKeyframes) =>
    buildMotionPropertyValues({
      item,
      itemKeyframes: keyframes,
      properties,
      canvas,
      fps,
      currentFrame,
      relativeFrame,
      itemById,
      allKeyframesByItemId: allKeyframesByItemId.current,
      originalKeyframesByProperty,
      selectedKeyframeValueByProperty,
    })
  const propertyValues = $derived(buildValues(itemKeyframes))
  const preExpressionPropertyValues = $derived(
    buildValues(withoutPropertyExpressions(itemKeyframes)),
  )
  const resolveExpressionReference = $derived.by(() => {
    const frame = currentFrame
    const fullCanvas = { ...canvas, fps }
    const items = itemById
    const keyframesByItem = allKeyframesByItemId.current
    return (sourceItemId: string, sourceProperty: DirectLinkableProperty) =>
      resolveExpressionReferenceValue(sourceItemId, sourceProperty, {
        globalFrame: frame,
        canvas: fullCanvas,
        getItem: (candidateId: string) => items[candidateId],
        getKeyframes: (candidateId: string) => keyframesByItem[candidateId],
      })
  })
  const propertyLinkSourceLabels = $derived(buildPropertyLinkSourceLabels(itemKeyframes, itemById))
  const propertyLinkHandlers = $derived(
    buildPropertyLinkHandlers({
      itemId: item.id,
      paneMode,
      onPointerDown: onPropertyLinkPointerDown,
      onRemove: onRemovePropertyLink,
    }),
  )

  const animatedTransformContext = () => ({
    globalFrame: currentFrame,
    canvas: { ...canvas, fps },
    getItem: (candidateId: string) => itemById[candidateId],
    getKeyframes: (candidateId: string) => allKeyframesByItemId.current[candidateId],
  })
  const vectorResolvedTransform = $derived(
    vectorBaseTransform
      ? resolveAnimatedTransform(
          vectorBaseTransform,
          itemKeyframes,
          relativeFrame,
          animatedTransformContext(),
        )
      : null,
  )
  const vectorPreExpressionTransform = $derived(
    vectorBaseTransform
      ? resolveAnimatedTransform(
          vectorBaseTransform,
          withoutPropertyExpressions(itemKeyframes),
          relativeFrame,
          animatedTransformContext(),
        )
      : null,
  )
  const selectedVectorValues = $derived.by(() => {
    const values = new Map<VectorAnimatableProperty, VectorKeyframe['value']>()
    for (let index = selectedKeyframes.length - 1; index >= 0; index -= 1) {
      const reference = selectedKeyframes[index]!
      if (reference.itemId !== item.id) continue
      const proxy = getVectorPropertyProxy(reference.property)
      if (!proxy || values.has(proxy.property)) continue
      const keyframe = findStoredVectorKeyframe(
        itemKeyframes,
        proxy.property,
        getStoredVectorKeyframeId(reference.keyframeId, proxy.axis),
      )
      if (keyframe) values.set(proxy.property, keyframe.value)
    }
    return values
  })
  const resolvedPositionValue = $derived(
    vectorBaseTransform && vectorResolvedTransform
      ? getMotionVectorValue('position', vectorResolvedTransform, vectorBaseTransform)
      : null,
  )
  const resolvedScaleValue = $derived(
    vectorBaseTransform && vectorResolvedTransform
      ? getMotionVectorValue('scale', vectorResolvedTransform, vectorBaseTransform)
      : null,
  )
  // The gizmo subscription reads the latest context on each notification.
  const positionValueSource = createMotionPositionValueSource(
    (): MotionPositionValueContext => ({
      item,
      resolvedTransform: vectorResolvedTransform,
      committedValue: selectedVectorValues.get('position') ?? resolvedPositionValue,
      itemById,
      allKeyframesByItemId: allKeyframesByItemId.current,
      canvas,
      fps,
      currentFrame,
    }),
  )
  const scaleValueSource = createMotionScaleValueSource()
  const committedScaleValue = $derived(selectedVectorValues.get('scale') ?? resolvedScaleValue)
  $effect(() => {
    const committed = committedScaleValue
    const preview = scaleValueSource.getSnapshot()
    if (
      preview &&
      committed &&
      Math.abs(preview.x - committed.x) < 0.001 &&
      Math.abs(preview.y - committed.y) < 0.001
    ) {
      scaleValueSource.clear()
    }
  })
  function resolveMotionVectorValueAtFrame(property: VectorAnimatableProperty, frame: number) {
    if (!vectorBaseTransform) return null
    const resolved = resolveAnimatedTransform(vectorBaseTransform, itemKeyframes, frame, {
      globalFrame: item.from + frame,
      canvas: { ...canvas, fps },
      getItem: (candidateId: string) => itemById[candidateId],
      getKeyframes: (candidateId: string) => allKeyframesByItemId.current[candidateId],
    })
    return getMotionVectorValue(property, resolved, vectorBaseTransform)
  }
  function commitPositionDimensionMode(separated: boolean, bake: boolean) {
    if (!vectorBaseTransform) return
    const frameCount = Math.max(1, item.durationInFrames)
    if (bake && frameCount > MAX_DIMENSION_BAKE_FRAMES) {
      toast.error('Position animation is too long to bake safely', {
        description: `This conversion would create ${frameCount.toLocaleString()} keyframes per lane.`,
      })
      return
    }

    const vectorProperty = itemKeyframes?.vectorProperties?.find(
      (candidate) => candidate.property === 'position',
    )
    const samples = bake
      ? Array.from({ length: frameCount }, (_, frame) => ({
          frame,
          value: resolveMotionVectorValueAtFrame('position', frame),
        })).filter(
          (sample): sample is { frame: number; value: { x: number; y: number } } =>
            sample.value !== null,
        )
      : []

    if (separated) {
      const scalarProperties = bake
        ? (['x', 'y'] as const).map((property) => ({
            property,
            keyframes: samples.map((sample) => ({
              id: crypto.randomUUID(),
              frame: sample.frame,
              value: sample.value[property],
              easing: 'linear' as const,
            })),
          }))
        : buildMotionVectorSeparationProperties({
            row: POSITION_VECTOR_ROW,
            vectorProperty,
            baseTransform: vectorBaseTransform,
          })
      clearKeyframeSelection()
      setVectorDimensionsSeparated(item.id, 'position', true, { scalarProperties })
      return
    }

    const nextVectorProperty = bake
      ? {
          property: 'position' as const,
          keyframes: samples.map((sample) => ({
            id: crypto.randomUUID(),
            frame: sample.frame,
            value: sample.value,
            easing: 'linear' as const,
          })),
        }
      : buildVectorPromotionPlan({
          property: 'position',
          itemKeyframes,
          baseTransform: vectorBaseTransform,
        }).vectorProperty
    clearKeyframeSelection()
    setVectorDimensionsSeparated(item.id, 'position', false, {
      vectorProperty: nextVectorProperty.keyframes.length > 0 ? nextVectorProperty : undefined,
    })
  }
  function handlePositionDimensionModeChange(separated: boolean) {
    const blockedTargets = separated
      ? new Set<DirectLinkableProperty>(['position'])
      : new Set<DirectLinkableProperty>(['x', 'y'])
    const hasLink = getDirectPropertyLinks(itemKeyframes).some((link) =>
      blockedTargets.has(link.targetProperty),
    )
    const hasExpression = itemKeyframes?.expressions?.some(
      (expression) =>
        expression.type === 'expression' && blockedTargets.has(expression.targetProperty),
    )
    if (hasLink || hasExpression) {
      toast.error(
        separated
          ? 'Remove the Position link or expression before separating dimensions'
          : 'Remove the X/Y links or expressions before combining dimensions',
      )
      return
    }

    const needsBake = separated
      ? motionVectorSeparationNeedsBake(
          itemKeyframes?.vectorProperties?.find((candidate) => candidate.property === 'position'),
        )
      : !canCombineMotionVectorRowWithoutBake(itemKeyframes, POSITION_VECTOR_ROW)
    if (!needsBake) {
      commitPositionDimensionMode(separated, false)
      return
    }

    toast.warning(
      separated
        ? 'Separating Position removes spatial or velocity handles'
        : 'X and Y use different timing and cannot be combined directly',
      {
        description: 'Bake the visible motion to frame-aligned keys before converting?',
        duration: Infinity,
        action: {
          label: separated ? 'Bake & separate' : 'Bake & combine',
          onClick: () => commitPositionDimensionMode(separated, true),
        },
        cancel: { label: 'Cancel', onClick: () => undefined },
      },
    )
  }
  const dimensionSeparationByProperty = $derived(
    supportsVectorTransform && properties.includes('x') && properties.includes('y')
      ? {
          x: {
            label: 'Position',
            separated: positionDimensionsSeparated,
            onChange: handlePositionDimensionModeChange,
          },
        }
      : {},
  )
  const scaleAxesLinked = $derived(item.transform?.aspectRatioLocked !== false)
  function applyMotionVectorAxisValue(
    property: VectorAnimatableProperty,
    currentValue: { x: number; y: number },
    axis: 'x' | 'y',
    value: number,
  ) {
    const nextValue = { ...currentValue, [axis]: value }
    if (property !== 'scale' || !scaleAxesLinked) return nextValue
    const otherAxis = axis === 'x' ? 'y' : 'x'
    const ratio = Math.abs(currentValue[axis]) <= Number.EPSILON ? 1 : value / currentValue[axis]
    nextValue[otherAxis] = currentValue[otherAxis] * ratio
    return nextValue
  }
  let positionScrubPreview: ItemPreview | null = null
  let positionScrubActive = false
  const positionScrub = useRafCoalescedValue((position: { x: number; y: number }) => {
    useGizmoStore.getState().setTransformPreview({
      [item.id]: position,
    })
  })
  function startPositionScrubPreview() {
    if (positionScrubActive) return
    positionScrubPreview = useGizmoStore.getState().preview?.[item.id] ?? null
    positionScrubActive = true
  }
  function restorePositionScrubPreview() {
    if (!positionScrubActive) return
    useGizmoStore.getState().replaceItemPreview(item.id, positionScrubPreview)
    positionScrubPreview = null
    positionScrubActive = false
  }
  function previewPositionScrub(axis: 'x' | 'y', value: number) {
    if (!vectorBaseTransform || !vectorResolvedTransform) return
    const currentValue = getMotionVectorValue(
      'position',
      vectorResolvedTransform,
      vectorBaseTransform,
    )
    positionScrub.queue(applyMotionVectorAxisValue('position', currentValue, axis, value))
  }
  function cancelPositionScrub() {
    positionScrub.cancel()
    restorePositionScrubPreview()
  }
  let scaleScrubPreview: ItemPreview | null = null
  let scaleScrubActive = false
  const scaleScrub = useRafCoalescedValue((scale: { x: number; y: number }) => {
    scaleValueSource.setSnapshot(scale)
    if (!vectorBaseTransform) return
    useGizmoStore.getState().setTransformPreview({
      [item.id]: {
        width: vectorBaseTransform.width * (scale.x / 100),
        height: vectorBaseTransform.height * (scale.y / 100),
      },
    })
  })
  function startScaleScrubPreview() {
    if (scaleScrubActive) return
    scaleScrubPreview = useGizmoStore.getState().preview?.[item.id] ?? null
    scaleScrubActive = true
  }
  function restoreScaleScrubPreview() {
    if (!scaleScrubActive) return
    useGizmoStore.getState().replaceItemPreview(item.id, scaleScrubPreview)
    scaleScrubPreview = null
    scaleScrubActive = false
  }
  function previewScaleScrub(axis: 'x' | 'y', value: number) {
    if (!committedScaleValue) return
    scaleScrub.queue(applyMotionVectorAxisValue('scale', committedScaleValue, axis, value))
  }
  function cancelScaleScrub() {
    scaleScrub.cancel()
    restoreScaleScrubPreview()
    scaleValueSource.clear()
  }
  $effect(() => () => {
    positionScrub.cancel()
    restorePositionScrubPreview()
    scaleScrub.cancel()
    restoreScaleScrubPreview()
    scaleValueSource.clear()
  })
  function promoteMotionVectorProperty(
    property: VectorAnimatableProperty,
    frame: number,
    override?: { axis: 'x' | 'y'; value: number },
  ) {
    if (!vectorBaseTransform) return
    const plan = buildVectorPromotionPlan({
      property,
      itemKeyframes,
      baseTransform: vectorBaseTransform,
      includeFrame: frame,
    })
    if (override) {
      plan.vectorProperty = {
        ...plan.vectorProperty,
        keyframes: plan.vectorProperty.keyframes.map((keyframe: VectorKeyframe) =>
          keyframe.frame === frame
            ? {
                ...keyframe,
                value: applyMotionVectorAxisValue(
                  property,
                  keyframe.value,
                  override.axis,
                  override.value,
                ),
              }
            : keyframe,
        ),
      }
    }
    promoteTransformToVector(item.id, plan.vectorProperty, plan.removeScalarProperties)
  }
  function handleMotionVectorValueCommit(
    property: VectorAnimatableProperty,
    axis: 'x' | 'y',
    value: number,
    options: { allowCreate: boolean },
  ) {
    const selectedStoredKeyframes = getSelectedMotionVectorKeyframes(
      itemKeyframes,
      selectedKeyframes,
      item.id,
      property,
    )
    if (selectedStoredKeyframes.length > 0) {
      for (const keyframe of selectedStoredKeyframes) {
        updateVectorKeyframe(item.id, property, keyframe.id, {
          value: applyMotionVectorAxisValue(property, keyframe.value, axis, value),
        })
      }
      return true
    }

    const lane = itemKeyframes?.vectorProperties?.find(
      (candidate) => candidate.property === property,
    )
    const currentKeyframe = lane?.keyframes.find((keyframe) => keyframe.frame === relativeFrame)
    if (currentKeyframe) {
      updateVectorKeyframe(item.id, property, currentKeyframe.id, {
        value: applyMotionVectorAxisValue(property, currentKeyframe.value, axis, value),
      })
      return true
    }
    if (!options.allowCreate) return false
    if (!lane || lane.keyframes.length === 0) {
      promoteMotionVectorProperty(property, relativeFrame, { axis, value })
      return true
    }
    const currentValue = resolveMotionVectorValueAtFrame(property, relativeFrame)
    if (!currentValue) return false
    upsertVectorKeyframe(item.id, property, {
      frame: relativeFrame,
      value: applyMotionVectorAxisValue(property, currentValue, axis, value),
      easing: 'linear',
    })
    return true
  }
  function finishPositionScrub(axis: 'x' | 'y', value: number) {
    previewPositionScrub(axis, value)
    positionScrub.flushNow()
    handleMotionVectorValueCommit('position', axis, value, { allowCreate: true })
    restorePositionScrubPreview()
  }
  function finishScaleScrub(axis: 'x' | 'y', value: number) {
    previewScaleScrub(axis, value)
    scaleScrub.flushNow()
    handleMotionVectorValueCommit('scale', axis, value, { allowCreate: true })
    restoreScaleScrubPreview()
  }
  const compoundPropertyRows = $derived.by(() => {
    const baseTransform = vectorBaseTransform
    const resolvedTransform = vectorResolvedTransform
    const preExpressionTransform = vectorPreExpressionTransform
    if (!baseTransform || !resolvedTransform || !preExpressionTransform) return {}
    const linked = scaleAxesLinked
    return Object.fromEntries(
      motionVectorRows.map((row) => {
        const resolvedValue = getMotionVectorValue(row.property, resolvedTransform, baseTransform)
        const value = selectedVectorValues.get(row.property) ?? resolvedValue
        return [
          row.primary,
          {
            label: row.label,
            value,
            preExpressionValue: getMotionVectorValue(
              row.property,
              preExpressionTransform,
              baseTransform,
            ),
            unit: row.unit,
            showAxisLabels: row.property !== 'position' && row.property !== 'scale',
            linkProperty: row.property,
            liveValueSource:
              row.property === 'position'
                ? positionValueSource
                : row.property === 'scale'
                  ? scaleValueSource
                  : undefined,
            ...(row.property === 'position'
              ? {
                  onScrubStart: startPositionScrubPreview,
                  onScrubPreview: previewPositionScrub,
                  onScrubEnd: finishPositionScrub,
                  onScrubCancel: cancelPositionScrub,
                }
              : row.property === 'scale'
                ? {
                    onScrubStart: startScaleScrubPreview,
                    onScrubPreview: previewScaleScrub,
                    onScrubEnd: finishScaleScrub,
                    onScrubCancel: cancelScaleScrub,
                  }
                : {}),
            axisLink:
              row.property === 'scale'
                ? {
                    linked,
                    onChange: (nextLinked: boolean) =>
                      updateItem(item.id, {
                        transform: { ...item.transform, aspectRatioLocked: nextLinked },
                      }),
                  }
                : undefined,
            onCommit: (axis: 'x' | 'y', nextValue: number, options: { allowCreate: boolean }) =>
              handleMotionVectorValueCommit(row.property, axis, nextValue, options),
          },
        ]
      }),
    )
  })
  const compoundSecondaryProperties = $derived(
    Object.fromEntries(motionVectorRows.map((row) => [row.primary, row.secondary])),
  )
  const selectedKeyframeIds = $derived(
    new Set(
      selectedKeyframes
        .filter((reference) => reference.itemId === item.id)
        .map((reference) => reference.keyframeId),
    ),
  )
  const compositionSnapFrames = $derived(
    getMotionCompositionSnapFrames(allKeyframesByItemId.current, itemById, selectedKeyframes),
  )
  const proceduralPropertyIds = $derived(
    new Set<AnimatableProperty>(
      getProceduralBands(item.motionModifiers, item.durationInFrames, item.from).keys(),
    ),
  )
  const visibleProperties = $derived(
    propertyFilter === 'keyframed'
      ? properties.filter((property) =>
          isMotionPropertyVisible(
            property,
            originalKeyframesByProperty,
            itemKeyframes,
            proceduralPropertyIds,
          ),
        )
      : properties,
  )
  const renderedVisibleProperties = $derived(
    visibleProperties.filter((property) => !hiddenPropertyRows.includes(property)),
  )
  const visiblePropertyCount = $derived(renderedVisibleProperties.length)
  const visiblePropertyGroupHeaderCount = $derived(
    getPropertyAccordionGroups(renderedVisibleProperties).filter(
      (group: { id: string }) => !MOTION_INLINE_PROPERTY_GROUP_ID_SET.has(group.id),
    ).length,
  )
  const laneContentHeight = $derived(
    visiblePropertyCount * ROW_HEIGHT + visiblePropertyGroupHeaderCount * GROUP_HEADER_HEIGHT,
  )
  const laneContentStructureKey = $derived(`${paneMode}:${renderedVisibleProperties.join('|')}`)
  let reportedLaneContent = $state.raw<{ structureKey: string; height: number } | null>(null)
  const renderedLaneContentHeight = $derived(
    reportedLaneContent?.structureKey === laneContentStructureKey
      ? reportedLaneContent.height
      : laneContentHeight,
  )
  const renderedLaneHeight = $derived(
    getMotionDopesheetLaneHeight(paneMode, renderedLaneContentHeight + expressionDockHeight),
  )
  $effect.pre(() => {
    if (renderedLaneHeight !== undefined) onRenderedHeightChange?.(renderedLaneHeight)
  })
  function handleLaneContentHeightChange(height: number) {
    const current = reportedLaneContent
    if (current?.structureKey === laneContentStructureKey && current.height === height) return
    reportedLaneContent = { structureKey: laneContentStructureKey, height }
  }

  function handleSelectionChange(
    keyframeIds: Set<string>,
    options?: { preserveExternalSelection?: boolean },
  ) {
    const references: KeyframeRef[] = []
    for (const property of properties) {
      for (const keyframe of originalKeyframesByProperty[property] ?? []) {
        if (keyframeIds.has(keyframe.id)) {
          references.push({ itemId: item.id, property, keyframeId: keyframe.id })
        }
      }
    }
    const nextSelection = mergeMotionKeyframeSelection(
      useKeyframeSelectionStore.getState().selectedKeyframes,
      item.id,
      references,
      options?.preserveExternalSelection === true,
    )
    if (nextSelection.length === 0) clearKeyframeSelection()
    else useKeyframeSelectionStore.getState().selectKeyframes(nextSelection)
  }

  function applyCrossLayerPreview() {
    crossLayerPreviewFrame = null
    const dragState = crossLayerDrag
    const requestedDeltaFrames = pendingCrossLayerDelta
    pendingCrossLayerDelta = null
    if (!dragState || requestedDeltaFrames === null) return

    const { _updateKeyframes, _updateVectorKeyframe } = useKeyframesStore.getState()
    const updates = buildMotionSelectionFrameUpdates(dragState, requestedDeltaFrames)
    if (updates.scalar.length > 0) {
      _updateKeyframes(
        updates.scalar.map((update) => ({
          itemId: update.itemId,
          property: update.property,
          keyframeId: update.keyframeId,
          updates: { frame: update.frame },
        })),
      )
    }
    for (const update of updates.vector) {
      _updateVectorKeyframe(update.itemId, update.property, update.keyframeId, {
        frame: update.frame,
      })
    }
  }

  function handleSelectionFrameDelta(deltaFrames: number, phase: 'preview' | 'commit' | 'cancel') {
    if (!crossLayerDrag?.spansMultipleItems) return false
    pendingCrossLayerDelta = phase === 'cancel' ? 0 : deltaFrames
    if (phase !== 'preview') {
      if (crossLayerPreviewFrame !== null) {
        cancelAnimationFrame(crossLayerPreviewFrame)
      }
      applyCrossLayerPreview()
      if (phase === 'cancel') {
        dragSnapshot = null
        crossLayerDrag = null
      }
      return true
    }
    if (crossLayerPreviewFrame === null) {
      crossLayerPreviewFrame = requestAnimationFrame(applyCrossLayerPreview)
    }
    return true
  }

  function handleDragStart() {
    dragSnapshot = captureSnapshot()
    const keyframesState = useKeyframesStore.getState()
    crossLayerDrag = buildMotionSelectionDragState(
      useKeyframeSelectionStore.getState().selectedKeyframes,
      keyframesState.keyframesByItemId,
      useItemsStore.getState().itemById,
    )
  }
  function handleDragEnd() {
    const snapshot = dragSnapshot
    if (!snapshot) return
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'MOVE_KEYFRAME_GRAPH', payload: {} }, snapshot)
    useTimelineSettingsStore.getState().markDirty()
    dragSnapshot = null
    crossLayerDrag = null
    pendingCrossLayerDelta = null
  }
  function handleDragCancel() {
    if (crossLayerPreviewFrame !== null) {
      cancelAnimationFrame(crossLayerPreviewFrame)
      crossLayerPreviewFrame = null
    }
    dragSnapshot = null
    crossLayerDrag = null
    pendingCrossLayerDelta = null
  }

  $effect(() => () => {
    if (crossLayerPreviewFrame !== null) {
      cancelAnimationFrame(crossLayerPreviewFrame)
    }
  })

  function clampAbsoluteFrame(frame: number) {
    return Math.max(item.from, Math.min(item.from + item.durationInFrames - 1, Math.round(frame)))
  }
  function handleMotionKeyframeMove(reference: KeyframeRef, nextFrame: number, nextValue: number) {
    const { _updateKeyframe, _updateVectorKeyframe } = useKeyframesStore.getState()
    const vectorReference = resolveMotionVectorReference(itemKeyframes, reference)
    if (vectorReference) {
      _updateVectorKeyframe(
        reference.itemId,
        vectorReference.proxy.property,
        vectorReference.keyframe.id,
        {
          frame: clampAbsoluteFrame(nextFrame) - item.from,
          value: {
            ...vectorReference.keyframe.value,
            [vectorReference.proxy.axis]: nextValue,
          },
        },
      )
      return
    }
    _updateKeyframe(reference.itemId, reference.property, reference.keyframeId, {
      frame: clampAbsoluteFrame(nextFrame) - item.from,
      value: nextValue,
    })
  }
  function handleMotionSegmentEasingChange(
    references: KeyframeRef[],
    updates: Pick<Keyframe, 'easing'> & Partial<Pick<Keyframe, 'easingConfig'>>,
    options?: { commit?: boolean },
  ) {
    const { _updateKeyframe, _updateVectorKeyframe } = useKeyframesStore.getState()
    const partitioned = partitionMotionVectorReferences(itemKeyframes, references)
    for (const vector of partitioned.vector) {
      if (options?.commit === false) {
        _updateVectorKeyframe(
          vector.reference.itemId,
          vector.proxy.property,
          vector.keyframe.id,
          updates,
        )
      } else {
        updateVectorKeyframe(
          vector.reference.itemId,
          vector.proxy.property,
          vector.keyframe.id,
          updates,
        )
      }
    }
    if (partitioned.scalar.length === 0) return
    if (options?.commit === false) {
      for (const reference of partitioned.scalar) {
        _updateKeyframe(reference.itemId, reference.property, reference.keyframeId, updates)
      }
      return
    }
    updateKeyframes(
      partitioned.scalar.map((reference) => ({
        itemId: reference.itemId,
        property: reference.property,
        keyframeId: reference.keyframeId,
        updates,
      })),
    )
  }
  function handleRemoveMotionKeyframes(references: KeyframeRef[]) {
    const partitioned = partitionMotionVectorReferences(itemKeyframes, references)
    for (const vector of partitioned.vector) {
      removeVectorKeyframe(item.id, vector.proxy.property, vector.keyframe.id)
    }
    if (partitioned.scalar.length > 0) removeKeyframes(partitioned.scalar)
    clearKeyframeSelection()
  }

  function handleAddKeyframe(property: AnimatableProperty, frame: number) {
    const absoluteFrame = clampAbsoluteFrame(frame)
    const propertyRelativeFrame = absoluteFrame - item.from
    const vectorProxy = getVectorPropertyProxy(property)
    if (vectorProxy && motionVectorRows.some((row) => row.property === vectorProxy.property)) {
      const lane = itemKeyframes?.vectorProperties?.find(
        (candidate) => candidate.property === vectorProxy.property,
      )
      if (!lane || lane.keyframes.length === 0) {
        promoteMotionVectorProperty(vectorProxy.property, propertyRelativeFrame)
        return
      }
      const value = resolveMotionVectorValueAtFrame(vectorProxy.property, propertyRelativeFrame)
      if (!value) return
      upsertVectorKeyframe(item.id, vectorProxy.property, {
        frame: propertyRelativeFrame,
        value,
        easing: 'linear',
      })
      return
    }
    const keyframes = originalKeyframesByProperty[property] ?? []
    addKeyframe(
      item.id,
      property,
      propertyRelativeFrame,
      interpolatePropertyValue(
        keyframes,
        propertyRelativeFrame,
        getAnimatablePropertyBaseValue(item, property, { ...canvas, fps }),
      ),
    )
  }

  function handlePropertyValueCommit(
    property: AnimatableProperty,
    value: number,
    options?: { allowCreate?: boolean },
  ) {
    const propertyKeyframes = originalKeyframesByProperty[property] ?? []
    const selectedPropertyKeyframes = propertyKeyframes.filter((keyframe) =>
      selectedKeyframeIds.has(keyframe.id),
    )
    if (selectedPropertyKeyframes.length > 0) {
      updateKeyframes(
        selectedPropertyKeyframes.map((keyframe) => ({
          itemId: item.id,
          property,
          keyframeId: keyframe.id,
          updates: { value },
        })),
      )
      return
    }

    const existing = propertyKeyframes.find((keyframe) => keyframe.frame === relativeFrame)
    if (existing) updateKeyframe(item.id, property, existing.id, { value })
    else if (options?.allowCreate !== false) {
      addKeyframe(item.id, property, relativeFrame, value)
    }
  }

  // In Motion's embedded lane view, an animated-only filter with no keyed
  // properties should consume no vertical space beneath the layer header.
  // The full graph editor keeps its empty guidance because it owns the pane.
  const hidden = $derived(
    paneMode === 'lanes' && propertyFilter === 'keyframed' && visiblePropertyCount === 0,
  )
</script>

{#if !hidden}
  <div
    bind:this={root}
    inert={disabled ? true : undefined}
    aria-disabled={disabled}
    class={cn('w-full bg-background/35', paneMode === 'graph' && 'h-full', disabled && 'opacity-60')}
    style:height={renderedLaneHeight === undefined ? undefined : `${renderedLaneHeight}px`}
    onpointerenter={() => setKeyframeEditorShortcutScopeActive(true)}
    onpointerleave={() => setKeyframeEditorShortcutScopeActive(false)}
    onfocuscapture={() => setKeyframeEditorShortcutScopeActive(true)}
    onblurcapture={(event) => {
      const nextFocused = event.relatedTarget as Node | null
      if (!event.currentTarget.contains(nextFocused)) {
        setKeyframeEditorShortcutScopeActive(false)
      }
    }}
  >
    {#if paneSize.width > 0}
      <DopesheetEditor
        itemId={item.id}
        motionModifiers={item.motionModifiers}
        hasProceduralMotion={hasEnabledProceduralMotion(item)}
        {keyframesByProperty}
        {propertyValues}
        {preExpressionPropertyValues}
        {hiddenPropertyRows}
        {compoundPropertyRows}
        {compoundSecondaryProperties}
        {dimensionSeparationByProperty}
        propertyLinks={getDirectPropertyLinks(itemKeyframes)}
        propertyExpressions={itemKeyframes?.expressions?.filter(
          (expression) => expression.type === 'expression',
        )}
        {resolveExpressionReference}
        onSetPropertyExpression={onSetPropertyExpression
          ? (property: DirectLinkableProperty, source: string, enabled: boolean) =>
              onSetPropertyExpression(item.id, property, source, enabled)
          : undefined}
        onRemovePropertyExpression={onRemovePropertyExpression
          ? (property: DirectLinkableProperty) => onRemovePropertyExpression(item.id, property)
          : undefined}
        onExpressionDockHeightChange={paneMode === 'lanes'
          ? (height: number) => (expressionDockHeight = height)
          : undefined}
        onLaneContentHeightChange={paneMode === 'lanes' ? handleLaneContentHeightChange : undefined}
        {initialExpandedGroups}
        {onExpandedGroupsChange}
        {propertyLinkSourceLabels}
        onPropertyLinkPointerDown={propertyLinkHandlers.onPointerDown}
        onRemovePropertyLink={propertyLinkHandlers.onRemove}
        selectedProperty={inlineCurveProperty}
        {selectedKeyframeIds}
        {currentFrame}
        globalFrame={currentFrame}
        itemFrom={0}
        totalFrames={compositionDurationInFrames}
        {fps}
        width={paneSize.width}
        height={paneMode === 'graph'
          ? Math.max(120, paneSize.height)
          : Math.max(ROW_HEIGHT, renderedLaneContentHeight + expressionDockHeight)}
        frameViewport={timeViewport}
        onFrameViewportChange={onTimeViewportChange}
        onSelectionChange={handleSelectionChange}
        additionalSnapFrames={compositionSnapFrames}
        onSelectionFrameDelta={handleSelectionFrameDelta}
        onKeyframeMove={handleMotionKeyframeMove}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        onSegmentEasingChange={handleMotionSegmentEasingChange}
        onAddKeyframe={handleAddKeyframe}
        onPropertyValueCommit={handlePropertyValueCommit}
        onRemoveKeyframes={handleRemoveMotionKeyframes}
        onNavigateToKeyframe={(frame: number) => onScrub(clampAbsoluteFrame(frame))}
        onScrub={(frame: number) =>
          onScrub(Math.max(0, Math.min(compositionDurationInFrames - 1, frame)))}
        onScrubStart={() => onSelectItem(item.id)}
        onActivePropertyChange={() => onSelectItem(item.id)}
        onPropertyChange={(property: AnimatableProperty | null) => {
          if (!property) return
          onSelectItem(item.id)
          onInlineCurveChange(property)
        }}
        onCurveVisibilityChange={(property: AnimatableProperty, visible: boolean) => {
          onSelectItem(item.id)
          onInlineCurveChange(visible ? property : null)
        }}
        visualizationMode={paneMode === 'graph' ? 'graph' : 'dopesheet'}
        presentation="lanes"
        propertyColumnWidth={paneMode === 'graph' ? 0 : LAYER_COLUMN_WIDTH}
        timelineGridDivisions={paneMode === 'lanes' ? RULER_DIVISIONS : undefined}
        singleCurveMode
        selectedCurveVisibleExternally={paneMode === 'lanes' && inlineCurveProperty !== null}
        {propertyFilter}
        proceduralFrameOffset={item.from}
        proceduralDurationInFrames={item.durationInFrames}
        showPlayhead={false}
        inlinePropertyGroupIds={paneMode === 'graph'
          ? MOTION_GRAPH_INLINE_PROPERTY_GROUP_IDS
          : MOTION_INLINE_PROPERTY_GROUP_IDS}
        spacious
      />
    {/if}
  </div>
{/if}
