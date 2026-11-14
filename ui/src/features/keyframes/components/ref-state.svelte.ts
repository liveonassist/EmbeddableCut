// SPDX-License-Identifier: MIT

/**
 * The two shapes FreeCut's keyframe editors thread through their hooks and
 * pane builders, kept so the ported modules line up with the React ones:
 * setters that take a value or an updater, and `{ current }` boxes for
 * mutable values and for elements one component creates and a descendant
 * attaches (`bind:this={timelineRef.current}`).
 */

/** React's `Dispatch<SetStateAction<T>>`: a setter taking the next value or an updater. */
export type SetState<T> = (next: T | ((previous: T) => T)) => void

/** A mutable `{ current }` box (React's `RefObject`/`MutableRefObject`). */
export interface Ref<T> {
  current: T
}

/** A `{ current }` box whose reads are reactive, for element refs an effect or derived waits on. */
export function stateRef<T>(initial: T): Ref<T> {
  let value = $state.raw(initial)
  return {
    get current() {
      return value
    },
    set current(next: T) {
      value = next
    },
  }
}

/** Applies a `SetState` argument to the previous value. */
export function resolveSetState<T>(next: T | ((previous: T) => T), previous: T): T {
  return typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
}
