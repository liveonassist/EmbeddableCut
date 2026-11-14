// SPDX-License-Identifier: MIT

/**
 * Vector keyframe editing for the keyframe graph panel: the coupled
 * position/scale/anchor rows, dimension separation, live promotion of legacy
 * scalar lanes, value and temporal-ease commits and the speed-graph pane.
 *
 * Everything the panel derives (selected item, preview keyframe maps, resolved
 * transforms, control rows) is injected, and the panel keeps ownership of the
 * shared refs and its graph-mode state.
 *
 * The speed-graph pane comes back as `vectorSpeedGraphProps` (the props of
 * `VectorSpeedGraph`, or undefined without an active vector row): the panel
 * renders it from a snippet it hands the editor as `speedGraphContent`.
 */

import { toast } from 'svelte-sonner'
import {
  buildVectorPromotionPlan,
  getEditorVectorKeyframeId,
  getStoredVectorKeyframeId,
  findStoredVectorKeyframe,
  getTransitionBlockedRanges,
  remapLegacyVectorPromotionIdentities,
} from '@/features/timeline/deps/keyframes'
import * as timelineActions from '@/features/timeline/stores/timeline-actions'
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store'
import { usePlaybackStore } from '@/shared/state/playback'
import type {
  AnimatableProperty,
  ItemKeyframes,
  Keyframe,
  KeyframeRef,
  TemporalEase,
  VectorAnimatableProperty,
  VectorKeyframe,
} from '@/types/keyframe'
import type { CanvasSettings, ResolvedTransform } from '@/types/transform'
import type { TimelineItem } from '@/types/timeline'
import {
  applyVectorPromotion,
  buildLegacyVectorPromotionAtFrame,
  buildSeparatedPositionProperties,
  getEditableVectorProxy,
  hasPositionDimensionAuthoringConflict,
  recordPromotedVectorDragIds,
  selectPromotedVectorKeyframe,
  supportsVectorTransform,
  updateStoredVectorKeyframe,
  VECTOR_COMPOUND_PRIMARY,
  type KeyframeEditorSurface,
  type TFunction,
  type VectorEditorRow,
} from './keyframe-graph-panel-model'
import type { VectorSpeedGraphProps } from './vector-speed-graph'

interface UseVectorKeyframeEditingParams {
  selectedItemForEditor: TimelineItem | null
  selectedItemKeyframes: ItemKeyframes | null
  keyframesByProperty: Partial<Record<AnimatableProperty, Keyframe[]>>
  vectorBaseTransform: ResolvedTransform | null
  relativeFrame: number
  transitionBlockedRanges: ReturnType<typeof getTransitionBlockedRanges>
  canvas: CanvasSettings
  t: TFunction
  surface: KeyframeEditorSurface
  vectorControlRows: VectorEditorRow[]
  effectiveSelectedProperty: AnimatableProperty | null
  selectedKeyframeIds: Set<string>
  positionDimensionsSeparated: boolean
  scaleAxesConstrained: boolean
  getNextVectorAxisValue: (
    property: VectorAnimatableProperty,
    currentValue: { x: number; y: number },
    axis: 'x' | 'y',
    value: number,
  ) => { x: number; y: number }
  promotedVectorDragIdsRef: { current: Map<string, string> }
  selectKeyframe: (ref: KeyframeRef) => void
  selectKeyframes: (refs: KeyframeRef[]) => void
  clearKeyframeSelection: () => void
  vectorGraphMode: 'value' | 'speed'
  setVectorGraphMode: (mode: 'value' | 'speed') => void
}

export function useVectorKeyframeEditing(params: () => UseVectorKeyframeEditingParams) {
  const selectedItemForEditor = $derived(params().selectedItemForEditor)
  const selectedItemKeyframes = $derived(params().selectedItemKeyframes)
  const keyframesByProperty = $derived(params().keyframesByProperty)
  const vectorBaseTransform = $derived(params().vectorBaseTransform)
  const relativeFrame = $derived(params().relativeFrame)
  const transitionBlockedRanges = $derived(params().transitionBlockedRanges)
  const canvas = $derived(params().canvas)
  const t = $derived(params().t)
  const surface = $derived(params().surface)
  const effectiveSelectedProperty = $derived(params().effectiveSelectedProperty)
  const selectedKeyframeIds = $derived(params().selectedKeyframeIds)
  const positionDimensionsSeparated = $derived(params().positionDimensionsSeparated)
  const scaleAxesConstrained = $derived(params().scaleAxesConstrained)
  const getNextVectorAxisValue = $derived(params().getNextVectorAxisValue)
  const promotedVectorDragIdsRef = $derived(params().promotedVectorDragIdsRef)
  const selectKeyframe = $derived(params().selectKeyframe)
  const selectKeyframes = $derived(params().selectKeyframes)
  const clearKeyframeSelection = $derived(params().clearKeyframeSelection)
  const vectorGraphMode = $derived(params().vectorGraphMode)
  const setVectorGraphMode = $derived(params().setVectorGraphMode)
  const isVectorFrameBlocked = (frame = relativeFrame) =>
    transitionBlockedRanges.some((range) => frame >= range.start && frame < range.end)

  const promoteVectorProperty = (
    property: VectorAnimatableProperty,
    override?: { axis: 'x' | 'y'; value: number },
    frame = relativeFrame,
  ) => {
    if (!selectedItemForEditor || !vectorBaseTransform || isVectorFrameBlocked(frame)) {
      if (isVectorFrameBlocked(frame)) {
        toast.error(t('timeline.keyframeEditor.transitionBlocked'))
      }
      return
    }
    const plan = buildVectorPromotionPlan({
      property,
      itemKeyframes: selectedItemKeyframes ?? undefined,
      baseTransform: vectorBaseTransform,
      includeFrame: frame,
    })
    if (override) {
      plan.vectorProperty = {
        ...plan.vectorProperty,
        keyframes: plan.vectorProperty.keyframes.map((keyframe) =>
          keyframe.frame === frame
            ? {
                ...keyframe,
                value: getNextVectorAxisValue(
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
    timelineActions.promoteTransformToVector(
      selectedItemForEditor.id,
      plan.vectorProperty,
      plan.removeScalarProperties,
    )
  }

  const ensureVectorKeyframeForLiveEdit = (
    ref: KeyframeRef,
  ): {
    property: VectorAnimatableProperty
    axis: 'x' | 'y'
    keyframe: VectorKeyframe
  } | null => {
    if (!selectedItemForEditor || !vectorBaseTransform) return null
    const proxy = getEditableVectorProxy(ref.property, selectedItemKeyframes)
    if (!proxy) return null

    const dragKey = `${proxy.property}:${ref.keyframeId}`
    const mappedId = promotedVectorDragIdsRef.current.get(dragKey)
    const storedId = mappedId ?? getStoredVectorKeyframeId(ref.keyframeId, proxy.axis)
    const currentKeyframe = findStoredVectorKeyframe(
      useKeyframesStore.getState().keyframesByItemId[selectedItemForEditor.id],
      proxy.property,
      storedId,
    )
    if (currentKeyframe) return { ...proxy, keyframe: currentKeyframe }

    const previewKeyframe = keyframesByProperty[ref.property]?.find(
      (keyframe) => keyframe.id === ref.keyframeId,
    )
    if (!previewKeyframe) return null
    const promotion = buildLegacyVectorPromotionAtFrame({
      property: proxy.property,
      itemKeyframes: selectedItemKeyframes ?? undefined,
      baseTransform: vectorBaseTransform,
      frame: previewKeyframe.frame,
    })
    if (!promotion) return null

    const identityRemap = remapLegacyVectorPromotionIdentities({
      itemId: selectedItemForEditor.id,
      property: proxy.property,
      vectorKeyframes: promotion.plan.vectorProperty.keyframes,
      keyframesByProperty,
      selectedKeyframes: useKeyframeSelectionStore.getState().selectedKeyframes,
    })
    recordPromotedVectorDragIds(promotedVectorDragIdsRef.current, proxy.property, identityRemap)

    useKeyframesStore
      .getState()
      ._replaceScalarPropertiesWithVectorProperty(
        selectedItemForEditor.id,
        promotion.plan.vectorProperty,
        promotion.plan.removeScalarProperties,
      )
    promotedVectorDragIdsRef.current.set(dragKey, promotion.keyframe.id)
    selectPromotedVectorKeyframe({
      identityRemap,
      itemId: selectedItemForEditor.id,
      ref,
      proxy,
      promotedKeyframe: promotion.keyframe,
      selectKeyframes,
      selectKeyframe,
    })
    return { ...proxy, keyframe: promotion.keyframe }
  }

  const applyVectorKeyframeUpdates = (
    ref: KeyframeRef,
    updates: Partial<Omit<VectorKeyframe, 'id'>>,
    commit: boolean,
  ): boolean => {
    if (!selectedItemForEditor || !vectorBaseTransform) return false
    const proxy = getEditableVectorProxy(ref.property, selectedItemKeyframes)
    if (!proxy) return false

    const storedId = getStoredVectorKeyframeId(ref.keyframeId, proxy.axis)
    const storedKeyframe = findStoredVectorKeyframe(
      useKeyframesStore.getState().keyframesByItemId[selectedItemForEditor.id],
      proxy.property,
      storedId,
    )
    if (storedKeyframe) {
      updateStoredVectorKeyframe({
        itemId: ref.itemId,
        property: proxy.property,
        keyframeId: storedKeyframe.id,
        updates,
        commit,
      })
      return true
    }

    const previewKeyframe = keyframesByProperty[ref.property]?.find(
      (keyframe) => keyframe.id === ref.keyframeId,
    )
    if (!previewKeyframe) return true
    const promotion = buildLegacyVectorPromotionAtFrame({
      property: proxy.property,
      itemKeyframes: selectedItemKeyframes ?? undefined,
      baseTransform: vectorBaseTransform,
      frame: previewKeyframe.frame,
    })
    if (!promotion) return true
    promotion.plan.vectorProperty = {
      ...promotion.plan.vectorProperty,
      keyframes: promotion.plan.vectorProperty.keyframes.map((keyframe) =>
        keyframe.id === promotion.keyframe.id ? { ...keyframe, ...updates } : keyframe,
      ),
    }
    applyVectorPromotion({ itemId: selectedItemForEditor.id, plan: promotion.plan, commit })
    selectKeyframe({
      itemId: selectedItemForEditor.id,
      property: ref.property,
      keyframeId: getEditorVectorKeyframeId(promotion.keyframe.id, proxy.axis),
    })
    return true
  }

  const handleVectorValueCommit = (
    property: VectorAnimatableProperty,
    axis: 'x' | 'y',
    value: number,
    options: { allowCreate: boolean },
  ) => {
    if (!selectedItemForEditor) return
    const row = vectorControlRows.find((candidate) => candidate.property === property)
    if (!row) return
    const lane = selectedItemKeyframes?.vectorProperties?.find(
      (candidate) => candidate.property === property,
    )
    if (!lane || lane.keyframes.length === 0) {
      if (options.allowCreate) promoteVectorProperty(property, { axis, value })
      return
    }

    const nextValue = getNextVectorAxisValue(property, row.value, axis, value)
    const currentKeyframe = lane.keyframes.find((keyframe) => keyframe.frame === relativeFrame)
    if (currentKeyframe) {
      timelineActions.updateVectorKeyframe(selectedItemForEditor.id, property, currentKeyframe.id, {
        value: nextValue,
      })
      return
    }
    if (!options.allowCreate) return
    timelineActions.upsertVectorKeyframe(selectedItemForEditor.id, property, {
      frame: relativeFrame,
      value: nextValue,
      easing: 'linear',
    })
  }

  const handleVectorTemporalEaseCommit = (
    property: VectorAnimatableProperty,
    keyframeId: string,
    temporalEase: TemporalEase | undefined,
  ) => {
    if (!selectedItemForEditor) return
    applyVectorKeyframeUpdates(
      {
        itemId: selectedItemForEditor.id,
        property: VECTOR_COMPOUND_PRIMARY[property],
        keyframeId,
      },
      { temporalEase },
      true,
    )
  }

  const vectorControlRows = $derived(params().vectorControlRows)

  const compoundPropertyRows = $derived(
    Object.fromEntries(
      vectorControlRows.map((row) => [
        row.proxyProperty,
        {
          label: row.label,
          value: row.value,
          preExpressionValue: row.preExpressionValue,
          unit: row.unit,
          scrubStep: row.property === 'position' ? 1 : undefined,
          decimals: row.property === 'position' ? 0 : undefined,
          linkProperty: row.property,
          onCommit: (axis: 'x' | 'y', value: number, options: { allowCreate: boolean }) =>
            handleVectorValueCommit(row.property, axis, value, options),
        },
      ]),
    ),
  )
  const hiddenVectorPropertyRows = $derived(
    vectorControlRows.map((row) => row.secondaryProxyProperty),
  )
  const compoundSecondaryProperties = $derived(
    Object.fromEntries(
      vectorControlRows.map((row) => [row.proxyProperty, row.secondaryProxyProperty]),
    ),
  )

  const handlePositionDimensionModeChange = (separated: boolean) => {
    if (!selectedItemForEditor || !vectorBaseTransform) return
    const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[selectedItemForEditor.id]
    if (hasPositionDimensionAuthoringConflict(itemKeyframes, separated)) {
      toast.error(
        separated
          ? 'Remove the Position link or expression before separating dimensions'
          : 'Remove the X/Y links or expressions before combining dimensions',
      )
      return
    }

    if (separated) {
      const scalarProperties = buildSeparatedPositionProperties(itemKeyframes, vectorBaseTransform)
      if (!scalarProperties) {
        toast.error('Separate this advanced Position animation in the Motion workspace')
        return
      }
      clearKeyframeSelection()
      timelineActions.setVectorDimensionsSeparated(selectedItemForEditor.id, 'position', true, {
        scalarProperties,
      })
      return
    }

    const plan = buildVectorPromotionPlan({
      property: 'position',
      itemKeyframes,
      baseTransform: vectorBaseTransform,
    })
    clearKeyframeSelection()
    timelineActions.setVectorDimensionsSeparated(selectedItemForEditor.id, 'position', false, {
      vectorProperty: plan.vectorProperty.keyframes.length > 0 ? plan.vectorProperty : undefined,
    })
  }
  const dimensionSeparationByProperty = $derived.by(() => {
    return surface === 'edit' && supportsVectorTransform(selectedItemForEditor)
      ? {
          x: {
            label: t('editor.layoutSection.position', { defaultValue: 'Position' }),
            separated: positionDimensionsSeparated,
            onChange: handlePositionDimensionModeChange,
          },
        }
      : {}
  })
  const classicAxisConstraints = $derived.by(() => {
    return selectedItemForEditor
      ? {
          x: {
            label: t('editor.layoutSection.position', { defaultValue: 'Position' }),
            constrained: !positionDimensionsSeparated,
            onChange: (constrained: boolean) => handlePositionDimensionModeChange(!constrained),
          },
          width: {
            label: t('editor.textProperties.scale', { defaultValue: 'Scale' }),
            constrained: scaleAxesConstrained,
            onChange: (constrained: boolean) =>
              timelineActions.updateItemTransform(selectedItemForEditor.id, {
                aspectRatioLocked: constrained,
              }),
          },
        }
      : {}
  })
  const activeVectorRow = $derived(
    vectorControlRows.find((row) => row.proxyProperty === effectiveSelectedProperty) ?? null,
  )
  const activeVectorKeyframeId = $derived.by(() => {
    const row = activeVectorRow
    if (!row) return undefined
    return (
      [...selectedKeyframeIds].find((id) => row.keyframes.some((keyframe) => keyframe.id === id)) ??
      row.currentKeyframeId ??
      row.keyframes[0]?.id
    )
  })

  $effect(() => {
    if (!activeVectorRow && vectorGraphMode === 'speed') setVectorGraphMode('value')
  })

  const vectorSpeedGraphProps = $derived.by<VectorSpeedGraphProps | undefined>(() => {
    const row = activeVectorRow
    if (!row) return undefined
    return {
      property: row.property,
      label: `${row.label} ${t('timeline.keyframeEditor.speedGraph', {
        defaultValue: 'Speed',
      })}`,
      keyframes: row.keyframes,
      currentKeyframeId: activeVectorKeyframeId,
      fps: canvas.fps,
      resetLabel: t('timeline.keyframeEditor.resetSpeed', {
        defaultValue: 'Reset velocity handles',
      }),
      onTemporalEaseCommit: (keyframeId, temporalEase) =>
        handleVectorTemporalEaseCommit(row.property, keyframeId, temporalEase),
      onSelectKeyframe: (keyframe) => {
        if (!selectedItemForEditor) return
        selectKeyframe({
          itemId: selectedItemForEditor.id,
          property: row.proxyProperty,
          keyframeId: keyframe.id,
        })
        usePlaybackStore.getState().setCurrentFrame(selectedItemForEditor.from + keyframe.frame)
      },
    }
  })

  return {
    isVectorFrameBlocked,
    promoteVectorProperty,
    ensureVectorKeyframeForLiveEdit,
    applyVectorKeyframeUpdates,
    handleVectorValueCommit,
    get compoundPropertyRows() {
      return compoundPropertyRows
    },
    get hiddenVectorPropertyRows() {
      return hiddenVectorPropertyRows
    },
    get compoundSecondaryProperties() {
      return compoundSecondaryProperties
    },
    get dimensionSeparationByProperty() {
      return dimensionSeparationByProperty
    },
    get classicAxisConstraints() {
      return classicAxisConstraints
    },
    get activeVectorRow() {
      return activeVectorRow
    },
    get vectorSpeedGraphProps() {
      return vectorSpeedGraphProps
    },
  }
}
