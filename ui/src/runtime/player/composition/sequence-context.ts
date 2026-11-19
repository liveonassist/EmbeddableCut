// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

/** Reactive: providers expose these as getters over their current values. */
export interface SequenceContextValue {
  readonly from: number
  readonly durationInFrames: number
  readonly localFrame: number
  readonly parentFrom: number
}

const SEQUENCE_KEY = Symbol('embeddablecut.sequence')

/** Provides the sequence context to children (React's `SequenceContext.Provider`). */
export function setSequenceContext(value: SequenceContextValue | null): void {
  setContext(SEQUENCE_KEY, value)
}

export function useSequenceContext(): SequenceContextValue | null {
  return getContext<SequenceContextValue | null | undefined>(SEQUENCE_KEY) ?? null
}
