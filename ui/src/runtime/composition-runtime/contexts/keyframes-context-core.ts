// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { ItemKeyframes } from '@/types/keyframe'
import type { TimelineItem } from '@/types/timeline'
import type { CanvasSettings } from '@/types/transform'

/** Reactive: providers expose these as getters over their current values. */
export interface KeyframesContextValue {
  readonly keyframes: ItemKeyframes[]
  readonly getItemKeyframes: (itemId: string) => ItemKeyframes | undefined
  readonly getItem: (itemId: string) => TimelineItem | undefined
  readonly canvas?: CanvasSettings
}

const KEYFRAMES_KEY = Symbol('freecut.keyframes')

/** React's `KeyframesContext.Provider`. */
export function setKeyframesContext(value: KeyframesContextValue | null): void {
  setContext(KEYFRAMES_KEY, value)
}

/** React's `useContext(KeyframesContext)`. */
export function useKeyframesContext(): KeyframesContextValue | null {
  return getContext<KeyframesContextValue | null | undefined>(KEYFRAMES_KEY) ?? null
}

export function useItemKeyframesFromContext(itemId: () => string): {
  readonly current: ItemKeyframes | undefined
} {
  const context = useKeyframesContext()
  return {
    get current() {
      return context?.getItemKeyframes(itemId())
    },
  }
}
