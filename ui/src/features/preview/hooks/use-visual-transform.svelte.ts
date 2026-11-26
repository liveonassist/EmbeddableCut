// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
import type { TimelineItem } from '@/types/timeline'
import type { ResolvedTransform } from '@/types/transform'
import {
  useItemsStore,
  useKeyframesStore,
  useTimelineSettingsStore,
} from '@/features/preview/deps/timeline-store'
import { resolveAnimatedTextItem } from '@/features/preview/deps/keyframes'
import { useResolvedPlaybackFrame } from '@/shared/state/playback/use-resolved-playback-frame.svelte'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
import {
  hasCornerPin,
  resolveItemTransformAtFrame,
} from '@/features/preview/deps/composition-runtime'
import { resolveGizmoWorldPreviewAsLocal } from '@/features/preview/utils/gizmo-world-preview'
import { expandTextTransformForPreview } from '@/features/preview/utils/text-layout'

interface ProjectSize {
  width: number
  height: number
}

function applyTextExpansion(
  item: TimelineItem,
  transform: ResolvedTransform,
  previewProperties?: Parameters<typeof expandTextTransformForPreview>[2],
  skipExpansion = false,
): ResolvedTransform {
  if (item.type !== 'text') return transform
  if (skipExpansion) return transform
  return expandTextTransformForPreview(item, transform, previewProperties)
}

/**
 * Resolve visual transforms for multiple items (base -> keyframes -> preview).
 */
export function useVisualTransforms(
  getItems: () => TimelineItem[],
  getProjectSize: () => ProjectSize,
  getAllItemsOverride: () => TimelineItem[] | undefined = () => undefined,
  getFrameOverride: () => number | undefined = () => undefined,
): { readonly current: Map<string, ResolvedTransform> } {
  const items = $derived(getItems())
  const projectSize = $derived(getProjectSize())
  const allItemsOverride = $derived(getAllItemsOverride())
  const frameOverride = $derived(getFrameOverride())
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const allItems = selectDerived(useItemsStore, (state) => allItemsOverride ?? state.items)
  const keyframesByItemId = select(useKeyframesStore, (state) => state.keyframesByItemId)
  // Translate previews are presented imperatively by the item wrapper and
  // transform gizmo. Keeping them out of this scene-wide resolver prevents
  // every pointer sample from recomputing every visible item's transform.
  const activeGizmoItemId = select(useGizmoStore, (s) =>
    s.activeGizmo?.mode === 'translate' ? undefined : s.activeGizmo?.itemId,
  )
  const gizmoPreviewTransform = select(useGizmoStore, (s) =>
    s.activeGizmo?.mode === 'translate' ? null : s.previewTransform,
  )
  const preview = select(useGizmoStore, (s) => s.preview)
  // Frozen editor chrome (notably GizmoOverlay during playback) can provide
  // its presentation frame explicitly. Keeping the external-store snapshot
  // disabled in that mode prevents live playback ticks from re-rendering a
  // scene-wide overlay whose controls are not being presented.
  const resolvedPlaybackFrame = useResolvedPlaybackFrame(
    () => frameOverride === undefined && items.length > 0,
  )
  const animationFrame = $derived(frameOverride ?? resolvedPlaybackFrame.current)

  // Its own derived, so a frame change doesn't rebuild it.
  const itemsById = $derived(new Map(allItems.current.map((item) => [item.id, item])))

  const visualTransforms = $derived.by(() => {
    const transforms = new Map<string, ResolvedTransform>()
    const canvas = { width: projectSize.width, height: projectSize.height, fps: fps.current }
    const getLocalPreviewTransform = (itemId: string) => preview.current?.[itemId]?.transform
    const activeGizmoLocalPreview =
      activeGizmoItemId.current && gizmoPreviewTransform.current
        ? resolveGizmoWorldPreviewAsLocal({
            itemId: activeGizmoItemId.current,
            worldPreviewTransform: gizmoPreviewTransform.current,
            canvas,
            frame: animationFrame,
            getItem: (itemId) => itemsById.get(itemId),
            getKeyframes: (itemId) => keyframesByItemId.current[itemId],
            getLocalPreviewTransform,
          })
        : undefined
    const getPreviewTransform = (itemId: string) =>
      activeGizmoItemId.current === itemId && activeGizmoLocalPreview
        ? activeGizmoLocalPreview
        : getLocalPreviewTransform(itemId)

    for (const item of items) {
      const itemKeyframe = keyframesByItemId.current[item.id]
      const previewProperties = preview.current?.[item.id]?.properties
      const animatedTextItem =
        item.type === 'text'
          ? resolveAnimatedTextItem(
              item,
              itemKeyframe ?? undefined,
              animationFrame - item.from,
              canvas,
            )
          : item
      const animatedTransform = resolveItemTransformAtFrame(item, {
        canvas,
        frame: animationFrame,
        keyframes: itemKeyframe,
        getItem: (itemId) => itemsById.get(itemId),
        getKeyframes: (itemId) => keyframesByItemId.current[itemId],
        getPreviewTransform,
      })

      transforms.set(
        item.id,
        applyTextExpansion(
          animatedTextItem,
          animatedTransform,
          previewProperties,
          hasCornerPin(item.cornerPin),
        ),
      )
    }

    return transforms
  })

  return {
    get current() {
      return visualTransforms
    },
  }
}
