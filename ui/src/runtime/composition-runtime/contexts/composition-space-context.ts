// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

export interface CompositionSpace {
  projectWidth: number
  projectHeight: number
  renderWidth: number
  renderHeight: number
  scaleX: number
  scaleY: number
  scale: number
}

const COMPOSITION_SPACE_KEY = Symbol('freecut.composition-space')

export function resolveCompositionScale(
  projectWidth: number,
  projectHeight: number,
  renderWidth: number,
  renderHeight: number,
): Pick<CompositionSpace, 'scaleX' | 'scaleY' | 'scale'> {
  const scaleX = projectWidth > 0 ? renderWidth / projectWidth : 1
  const scaleY = projectHeight > 0 ? renderHeight / projectHeight : 1
  return {
    scaleX,
    scaleY,
    scale: Math.min(scaleX, scaleY),
  }
}

/** Provided by `CompositionSpaceProvider`: `current` is the space, recomputed when its props change. */
export function setCompositionSpace(space: { readonly current: CompositionSpace }): void {
  setContext(COMPOSITION_SPACE_KEY, space)
}

/** Reactive: read `.current` where the space is used. */
export function useCompositionSpace(): { readonly current: CompositionSpace | null } {
  const space = getContext<{ readonly current: CompositionSpace } | undefined>(
    COMPOSITION_SPACE_KEY,
  )
  return space ?? { current: null }
}
