// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { toast } from 'svelte-sonner'
import { t } from '$lib/i18n.svelte'
import type { DirectLinkableProperty } from '@/types/keyframe'
import { areDirectLinkPropertiesCompatible, isDirectLinkableProperty } from '@/types/keyframe'
import {
  removeDirectPropertyLink,
  setDirectPropertyLink,
} from '@/features/timeline/stores/actions/keyframe-actions'
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
import { wouldCreateDirectPropertyLinkCycle } from '@/features/timeline/deps/keyframes'
import { useMotionPickWhipDrag } from '@/shared/hooks/use-pick-whip-drag.svelte'

interface PropertyEndpoint {
  itemId: string
  property: DirectLinkableProperty
}

function resolvePropertyCandidateElement(element: Element | null, origin: PropertyEndpoint) {
  const row = element?.closest<HTMLElement>('[data-expression-item-id][data-expression-property]')
  const itemId = row?.dataset.expressionItemId
  const property = row?.dataset.expressionProperty
  if (!row || !itemId || !property || !isDirectLinkableProperty(property)) return null
  if (itemId === origin.itemId && property === origin.property) return null
  if (!areDirectLinkPropertiesCompatible(origin.property, property)) return null
  return { row, value: { itemId, property } }
}

function resolvePropertyCandidate(clientX: number, clientY: number, origin: PropertyEndpoint) {
  const candidate = resolvePropertyCandidateElement(
    document.elementFromPoint(clientX, clientY),
    origin,
  )
  return candidate ? { status: 'valid' as const, ...candidate } : null
}

function resolveEligiblePropertyRows(origin: PropertyEndpoint): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-expression-item-id][data-expression-property]'),
  ).filter((row) => resolvePropertyCandidateElement(row, origin) !== null)
}

/** Call while a component initializes; read `drag` from the returned object, never destructure it. */
export function usePropertyLinkPickWhip() {
  const commit = (target: PropertyEndpoint, source: PropertyEndpoint) => {
    const keyframesByItemId = useKeyframesStore.getState().keyframesByItemId
    if (
      wouldCreateDirectPropertyLinkCycle(
        target.itemId,
        target.property,
        source.itemId,
        source.property,
        (itemId) => keyframesByItemId[itemId],
      )
    ) {
      toast.error(t('editor.compose.propertyLinkCycle'))
      return
    }
    setDirectPropertyLink(target.itemId, {
      type: 'link',
      targetProperty: target.property,
      sourceItemId: source.itemId,
      sourceProperty: source.property,
      enabled: true,
      timeOffsetFrames: 0,
    })
  }
  const pickWhip = useMotionPickWhipDrag<PropertyEndpoint, PropertyEndpoint>(() => ({
    hoverAttribute: 'data-expression-link-hover',
    eligibleAttribute: 'data-expression-link-eligible',
    resolveEligibleRows: resolveEligiblePropertyRows,
    resolveTarget: resolvePropertyCandidate,
    onCommit: commit,
  }))

  const begin = (
    event: PointerEvent & { currentTarget: HTMLElement },
    itemId: string,
    property: DirectLinkableProperty,
  ) => pickWhip.begin(event, { itemId, property })
  const remove = (itemId: string, property: DirectLinkableProperty) => {
    removeDirectPropertyLink(itemId, property)
  }

  return {
    get drag() {
      const genericDrag = pickWhip.drag
      return genericDrag
        ? {
            pointerId: genericDrag.pointerId,
            targetItemId: genericDrag.origin.itemId,
            targetProperty: genericDrag.origin.property,
            startX: genericDrag.startX,
            startY: genericDrag.startY,
            currentX: genericDrag.currentX,
            currentY: genericDrag.currentY,
            moved: genericDrag.moved,
            sourceItemId: genericDrag.candidate?.value.itemId ?? null,
            sourceProperty: genericDrag.candidate?.value.property ?? null,
            clipBounds: genericDrag.clipBounds,
            presentation: genericDrag.presentation,
          }
        : null
    },
    begin,
    remove,
  }
}
