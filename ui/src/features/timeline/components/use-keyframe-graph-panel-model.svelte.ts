// SPDX-License-Identifier: MIT

/**
 * Keyframe graph panel — selection/keyframes derived model.
 *
 * The panel's derived-values cluster: the item / keyframe / transition store
 * selectors, the selected item's keyframe map, the editor's selected keyframes
 * (ids, entries, shared easing), the playhead frame the editor commits, the
 * transition-blocked ranges and the trim banner, the resolved vector
 * transforms and control rows, and the procedural-preview inputs the
 * dopesheet/graph draw before a bake.
 *
 * Selectors that depend on the selected item re-subscribe when it changes;
 * the empty `[]` / `Set` results are fresh only when their inputs change. The
 * panel keeps ownership of every ref and passes it in.
 */

import { toast } from 'svelte-sonner'
import {
  getTransitionBlockedRanges,
  countTrimmedKeyframes,
  resolveAnimatedTransform,
} from '@/features/timeline/deps/keyframes'
import {
  getAnimatablePropertiesForItem,
  type ProceduralPreviewInput,
} from '@/features/timeline/deps/keyframe-editors'
import { hasEnabledProceduralMotion } from '@/shared/timeline/procedural-motion'
import { resolveTransform, getSourceDimensions } from '@/features/timeline/deps/composition-runtime'
import { useSelectionStore } from '@/shared/state/selection'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store'
import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
import * as timelineActions from '@/features/timeline/stores/timeline-actions'
import { getDirectPropertyLinks } from '@/types/keyframe'
import type {
  AnimatableProperty,
  Keyframe,
  KeyframeRef,
  VectorAnimatableProperty,
} from '@/types/keyframe'
import type { CanvasSettings } from '@/types/transform'
import { select, shallow } from '$lib/store.svelte'
import { shouldShowSeparatedPosition } from './edit-keyframe-panel-model'
import {
  buildEditorKeyframesByProperty,
  buildVectorControlRows,
  filterVectorControlRows,
  supportsVectorTransform,
  type KeyframeEditorSurface,
  type TFunction,
  type VectorEditorRow,
} from './keyframe-graph-panel-model'
import { useKeyframeEditorPlaybackFrame } from './use-keyframe-editor-playback-frame.svelte'

interface UseKeyframeGraphPanelModelParams {
  surface: KeyframeEditorSurface
  canvas: CanvasSettings
  selectedProperty: AnimatableProperty | null
  t: TFunction
  keyframeEditorScrubbingRef: { current: boolean }
}

export function useKeyframeGraphPanelModel(params: () => UseKeyframeGraphPanelModelParams) {
  const surface = $derived(params().surface)
  const canvas = $derived(params().canvas)
  const selectedProperty = $derived(params().selectedProperty)
  const t = $derived(params().t)

  // Selected items
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)

  const selectedItemForEditorSelection = $derived.by(() => {
    const itemIds = selectedItemIds.current
    return select(useItemsStore, (s) => {
      for (const itemId of itemIds) {
        const item = s.itemById[itemId]
        if (item) {
          return item
        }
      }

      return null
    })
  })
  const selectedItemForEditor = $derived(selectedItemForEditorSelection.current)

  const selectedItemKeyframesSelection = $derived.by(() => {
    const item = selectedItemForEditor
    return select(useKeyframesStore, (s) => (item ? (s.keyframesByItemId[item.id] ?? null) : null))
  })
  const selectedItemKeyframes = $derived(selectedItemKeyframesSelection.current)
  const allItemsByIdSelection = select(useItemsStore, (s) => s.itemById)
  const allItemsById = $derived(allItemsByIdSelection.current)
  const maxItemEndFrameSelection = select(useItemsStore, (s) => s.maxItemEndFrame)
  const allKeyframesByItemIdSelection = select(useKeyframesStore, (s) => s.keyframesByItemId)
  const allKeyframesByItemId = $derived(allKeyframesByItemIdSelection.current)

  const selectedItemTransitionsSelection = $derived.by(() => {
    const item = selectedItemForEditor
    return select(
      useTransitionsStore,
      (s) => {
        if (!item) return []

        return s.transitions.filter(
          (transition) => transition.leftClipId === item.id || transition.rightClipId === item.id,
        )
      },
      shallow,
    )
  })
  const selectedItemTransitions = $derived(selectedItemTransitionsSelection.current)

  const selectedKeyframesSelection = select(useKeyframeSelectionStore, (s) => s.selectedKeyframes)
  const selectedKeyframes = $derived(selectedKeyframesSelection.current)

  const currentFrameState = useKeyframeEditorPlaybackFrame(
    () => selectedItemForEditor?.id ?? null,
    params().keyframeEditorScrubbingRef,
  )
  const currentFrame = $derived(currentFrameState.current)

  const allAvailableProperties = $derived.by(() => {
    if (!selectedItemForEditor) return []
    return getAnimatablePropertiesForItem(selectedItemForEditor)
  })

  const availableProperties = $derived(
    surface !== 'edit' && supportsVectorTransform(selectedItemForEditor)
      ? allAvailableProperties.filter((property) => property !== 'y' && property !== 'height')
      : allAvailableProperties,
  )

  // Inputs for the dopesheet/graph to draw procedural generators (dashed ghost
  // curves) before they're baked — base transform + active modifiers + canvas.
  const proceduralPreview = $derived.by<ProceduralPreviewInput | undefined>(() => {
    if (!selectedItemForEditor) return undefined
    const modifiers =
      selectedItemForEditor.motionModifiers?.filter(
        (modifier) => modifier.enabled && modifier.amplitude > 0,
      ) ?? []
    const layers = selectedItemForEditor.motionLayers?.filter((layer) => layer.enabled) ?? []
    if (modifiers.length === 0 && layers.length === 0) return undefined
    return {
      base: resolveTransform(
        selectedItemForEditor,
        canvas,
        getSourceDimensions(selectedItemForEditor),
      ),
      keyframes: allKeyframesByItemId[selectedItemForEditor.id],
      modifiers,
      layers,
      frameWidth: canvas.width,
      frameHeight: canvas.height,
    }
  })

  // The edited clip can be baked when it carries any procedural motion.
  const canBakeProceduralMotion = $derived(
    !!selectedItemForEditor && hasEnabledProceduralMotion(selectedItemForEditor),
  )

  const effectiveSelectedProperty = $derived.by(() => {
    if (surface === 'edit') {
      return selectedProperty && availableProperties.includes(selectedProperty)
        ? selectedProperty
        : null
    }
    const compoundPrimary =
      selectedProperty === 'y'
        ? 'x'
        : selectedProperty === 'height'
          ? 'width'
          : selectedProperty === 'anchorY'
            ? 'anchorX'
            : selectedProperty
    return compoundPrimary && availableProperties.includes(compoundPrimary) ? compoundPrimary : null
  })

  // Build keyframes by property for the graph editor
  const keyframesByProperty = $derived(
    buildEditorKeyframesByProperty({
      properties: allAvailableProperties,
      item: selectedItemForEditor,
      itemKeyframes: selectedItemKeyframes,
      canvas,
      trimToItemBounds: surface === 'edit',
    }),
  )

  const trimmedKeyframeCount = $derived(
    selectedItemForEditor
      ? countTrimmedKeyframes(selectedItemKeyframes, selectedItemForEditor.durationInFrames)
      : 0,
  )

  const handleTrimAnimation = () => {
    if (!selectedItemForEditor) return
    const itemId = selectedItemForEditor.id
    const removedCount = timelineActions.trimAnimationToItemBounds(itemId)
    if (removedCount === 0) return
    toast.success(
      t('timeline.keyframeEditor.trimAnimationToast', {
        count: removedCount,
      }),
      {
        action: {
          label: t('timeline.header.undo'),
          onClick: () => {
            const commandStore = useTimelineCommandStore.getState()
            const latest = commandStore.undoStack.at(-1)
            if (
              latest?.command.type === 'TRIM_ANIMATION_TO_BOUNDS' &&
              latest.command.payload?.itemId === itemId
            ) {
              commandStore.undo()
            }
          },
        },
      },
    )
  }

  // Selected keyframe IDs for the current item
  const selectedKeyframeIds = $derived.by(() => {
    if (!selectedItemForEditor) return new Set<string>()

    const ids = new Set<string>()
    for (const ref of selectedKeyframes) {
      if (ref.itemId === selectedItemForEditor.id) {
        ids.add(ref.keyframeId)
      }
    }
    return ids
  })

  const selectedEditorKeyframes = $derived.by(() => {
    if (!selectedItemForEditor) return []

    const entries: Array<{ ref: KeyframeRef; keyframe: Keyframe }> = []
    for (const ref of selectedKeyframes) {
      if (ref.itemId !== selectedItemForEditor.id) continue

      const keyframe = keyframesByProperty[ref.property]?.find(
        (candidate) => candidate.id === ref.keyframeId,
      )

      if (keyframe) {
        entries.push({ ref, keyframe })
      }
    }

    return entries
  })

  const selectedEditorEasing = $derived.by(() => {
    if (selectedEditorKeyframes.length === 0) return undefined

    const firstEasing = selectedEditorKeyframes[0]?.keyframe.easing
    if (!firstEasing) return undefined

    return selectedEditorKeyframes.every(({ keyframe }) => keyframe.easing === firstEasing)
      ? firstEasing
      : undefined
  })

  // Calculate relative frame for the current item
  const relativeFrame = $derived(
    selectedItemForEditor ? Math.max(0, currentFrame - selectedItemForEditor.from) : 0,
  )

  // Calculate transition-blocked frame ranges for the selected item
  const transitionBlockedRanges = $derived.by(() => {
    if (!selectedItemForEditor) return []
    return getTransitionBlockedRanges(
      selectedItemForEditor.id,
      selectedItemForEditor,
      selectedItemTransitions,
    )
  })

  const vectorBaseTransform = $derived.by(() => {
    if (!supportsVectorTransform(selectedItemForEditor)) return null
    return resolveTransform(
      selectedItemForEditor,
      canvas,
      getSourceDimensions(selectedItemForEditor),
    )
  })

  const vectorResolvedTransform = $derived.by(() => {
    if (!selectedItemForEditor || !vectorBaseTransform) return null
    const itemsById = allItemsById
    const keyframesByItemId = allKeyframesByItemId
    return resolveAnimatedTransform(
      vectorBaseTransform,
      selectedItemKeyframes ?? undefined,
      relativeFrame,
      {
        globalFrame: currentFrame,
        canvas,
        getItem: (itemId) => itemsById[itemId],
        getKeyframes: (itemId) => keyframesByItemId[itemId],
      },
    )
  })
  const vectorPreExpressionTransform = $derived.by(() => {
    if (!selectedItemForEditor || !vectorBaseTransform) return null
    const keyframesWithoutExpressions = selectedItemKeyframes
      ? {
          ...selectedItemKeyframes,
          propertyLinks: [...getDirectPropertyLinks(selectedItemKeyframes)],
          expressions: [],
        }
      : undefined
    const itemsById = allItemsById
    const keyframesByItemId = allKeyframesByItemId
    return resolveAnimatedTransform(
      vectorBaseTransform,
      keyframesWithoutExpressions,
      relativeFrame,
      {
        globalFrame: currentFrame,
        canvas,
        getItem: (itemId) => itemsById[itemId],
        getKeyframes: (itemId) => keyframesByItemId[itemId],
      },
    )
  })
  const positionDimensionsSeparated = $derived(shouldShowSeparatedPosition(selectedItemKeyframes))

  const vectorControlRows = $derived.by<VectorEditorRow[]>(() => {
    if (!vectorBaseTransform || !vectorResolvedTransform || !vectorPreExpressionTransform) return []
    return filterVectorControlRows(
      buildVectorControlRows({
        itemKeyframes: selectedItemKeyframes,
        base: vectorBaseTransform,
        resolved: vectorResolvedTransform,
        preExpression: vectorPreExpressionTransform,
        relativeFrame,
        t,
      }),
      selectedItemKeyframes,
      surface,
      positionDimensionsSeparated,
    )
  })
  const scaleAxesConstrained = $derived(
    selectedItemForEditor?.transform?.aspectRatioLocked !== false,
  )
  const getNextVectorAxisValue = (
    property: VectorAnimatableProperty,
    currentValue: { x: number; y: number },
    axis: 'x' | 'y',
    value: number,
  ) => {
    const nextValue = { ...currentValue, [axis]: value }
    if (property !== 'scale' || !scaleAxesConstrained) return nextValue

    const otherAxis = axis === 'x' ? 'y' : 'x'
    const ratio = Math.abs(currentValue[axis]) <= Number.EPSILON ? 1 : value / currentValue[axis]
    nextValue[otherAxis] = currentValue[otherAxis] * ratio
    return nextValue
  }

  return {
    get selectedItemForEditor() {
      return selectedItemForEditor
    },
    get selectedItemKeyframes() {
      return selectedItemKeyframes
    },
    get allItemsById() {
      return allItemsById
    },
    get maxItemEndFrame() {
      return maxItemEndFrameSelection.current
    },
    get allKeyframesByItemId() {
      return allKeyframesByItemId
    },
    get selectedKeyframes() {
      return selectedKeyframes
    },
    get currentFrame() {
      return currentFrame
    },
    get allAvailableProperties() {
      return allAvailableProperties
    },
    get availableProperties() {
      return availableProperties
    },
    get effectiveSelectedProperty() {
      return effectiveSelectedProperty
    },
    get keyframesByProperty() {
      return keyframesByProperty
    },
    get trimmedKeyframeCount() {
      return trimmedKeyframeCount
    },
    handleTrimAnimation,
    get selectedKeyframeIds() {
      return selectedKeyframeIds
    },
    get selectedEditorKeyframes() {
      return selectedEditorKeyframes
    },
    get selectedEditorEasing() {
      return selectedEditorEasing
    },
    get relativeFrame() {
      return relativeFrame
    },
    get transitionBlockedRanges() {
      return transitionBlockedRanges
    },
    get vectorBaseTransform() {
      return vectorBaseTransform
    },
    get vectorResolvedTransform() {
      return vectorResolvedTransform
    },
    get vectorPreExpressionTransform() {
      return vectorPreExpressionTransform
    },
    get positionDimensionsSeparated() {
      return positionDimensionsSeparated
    },
    get vectorControlRows() {
      return vectorControlRows
    },
    get scaleAxesConstrained() {
      return scaleAxesConstrained
    },
    getNextVectorAxisValue,
    get proceduralPreview() {
      return proceduralPreview
    },
    get canBakeProceduralMotion() {
      return canBakeProceduralMotion
    },
  }
}
