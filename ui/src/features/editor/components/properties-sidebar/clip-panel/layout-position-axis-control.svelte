<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import type { ItemKeyframes } from '@/types/keyframe'
  import { resolveTransform, getSourceDimensions } from '@/features/editor/deps/composition-runtime'
  import { resolveAnimatedTransform } from '@/features/editor/deps/keyframes'

  type MixedValue = number | 'mixed'
  type PositionAxis = 'x' | 'y'

  function resolveMixedPositionValue({
    axis,
    itemIds,
    canvas,
    currentFrame,
    itemsById,
    keyframesByItemId,
  }: {
    axis: PositionAxis
    itemIds: readonly string[]
    canvas: CanvasSettings
    currentFrame: number
    itemsById: Readonly<Record<string, TimelineItem | undefined>>
    keyframesByItemId: Readonly<Record<string, ItemKeyframes | undefined>>
  }): MixedValue {
    const values = itemIds.flatMap((itemId) => {
      const item = itemsById[itemId]
      if (!item) return []
      const baseResolved = resolveTransform(item, canvas, getSourceDimensions(item))
      const resolved = resolveAnimatedTransform(
        baseResolved,
        keyframesByItemId[item.id],
        currentFrame - item.from,
        {
          globalFrame: currentFrame,
          canvas,
          getItem: (candidateId) => itemsById[candidateId],
          getKeyframes: (candidateId) => keyframesByItemId[candidateId],
        },
      )
      return [resolved[axis]]
    })
    if (values.length === 0) return 0

    const firstValue = values[0]!
    return values.every((value) => Math.abs(value - firstValue) < 0.1) ? firstValue : 'mixed'
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import { useItemsStore, useKeyframesStore } from '@/features/editor/deps/timeline-store'
  import { KeyframeToggle } from '@/features/editor/deps/keyframes'
  import { NumberInput } from '../components'
  import { demixValue } from '../utils'

  interface PositionAxisControlProps {
    axis: PositionAxis
    itemIds: string[]
    canvas: CanvasSettings
    onChange: (value: number) => void
    onLiveChange: (value: number) => void
  }

  /**
   * One position axis of the transform section. The live gizmo value is
   * subscribed here so a canvas drag updates only this leaf, keeping the full
   * section and its keyframe controls out of the pointer hot path.
   */
  let { axis, itemIds, canvas, onChange, onLiveChange }: PositionAxisControlProps = $props()

  const currentFrame = useThrottledFrame()
  const canonicalValueFromItems = $derived(
    select(useItemsStore, (state) =>
      resolveMixedPositionValue({
        axis,
        itemIds,
        canvas,
        currentFrame: currentFrame.current,
        itemsById: state.itemById,
        keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
      }),
    ),
  )
  const canonicalValueFromKeyframes = $derived(
    select(useKeyframesStore, (state) =>
      resolveMixedPositionValue({
        axis,
        itemIds,
        canvas,
        currentFrame: currentFrame.current,
        itemsById: useItemsStore.getState().itemById,
        keyframesByItemId: state.keyframesByItemId,
      }),
    ),
  )
  const selectedItemIdSet = $derived(new Set(itemIds))
  const liveValue = $derived(
    select(useGizmoStore, (state) => {
      if (
        !state.activeGizmo ||
        !state.previewTransform ||
        !selectedItemIdSet.has(state.activeGizmo.itemId)
      ) {
        return null
      }
      return state.previewTransform[axis]
    }),
  )
  // Both selectors recompute against the other store's current snapshot. The
  // second subscription exists so a keyframe/link-only commit wakes this leaf;
  // by render time both values describe the same canonical state.
  const canonicalValue = $derived.by(() => {
    const fromItems = canonicalValueFromItems.current
    const fromKeyframes = canonicalValueFromKeyframes.current
    return fromItems === fromKeyframes
      ? fromItems
      : resolveMixedPositionValue({
          axis,
          itemIds,
          canvas,
          currentFrame: currentFrame.current,
          itemsById: useItemsStore.getState().itemById,
          keyframesByItemId: useKeyframesStore.getState().keyframesByItemId,
        })
  })
  // Read lazily by the keyframe toggle, so the toggle doesn't update per value change.
  const getCurrentValue = () => demixValue(canonicalValue, 0)
  const displayedValue = $derived(liveValue.current ?? canonicalValue)
</script>

<div class="flex items-center gap-0.5">
  <NumberInput
    value={displayedValue}
    {onChange}
    {onLiveChange}
    label={axis.toUpperCase()}
    unit="px"
    step={1}
    class="flex-1"
  />
  <KeyframeToggle {itemIds} property={axis} currentValue={0} {getCurrentValue} />
</div>
