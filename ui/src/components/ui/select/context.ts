// SPDX-License-Identifier: MIT

/**
 * Radix's `Select.Value` shows the selected item's `ItemText`, even while the
 * content is closed: Radix renders the items offscreen to read it. bits-ui has
 * no equivalent, so each `SelectItem` registers its children here, and
 * `SelectContent` mounts its children in a hidden collect-only pass while
 * closed, so `SelectValue` can render the selected item's label at any time.
 */

import { getContext, setContext, type Snippet } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'

interface Entry {
  label: Snippet | undefined
}

export class SelectState {
  readonly #labels = new SvelteMap<string, Entry>()

  constructor(
    readonly getValue: () => string,
    readonly getOpen: () => boolean,
  ) {}

  get value(): string {
    return this.getValue()
  }

  get open(): boolean {
    return this.getOpen()
  }

  /** Registers an item's label; the returned cleanup removes only this registration. */
  register(value: string, label: Snippet | undefined): () => void {
    const entry: Entry = { label }
    this.#labels.set(value, entry)
    return () => {
      if (this.#labels.get(value) === entry) this.#labels.delete(value)
    }
  }

  label(value: string): Snippet | undefined {
    return this.#labels.get(value)?.label
  }
}

const STATE = Symbol('embeddablecut.select')
const COLLECTING = Symbol('embeddablecut.select.collecting')

export const setSelectState = (state: SelectState): SelectState => setContext(STATE, state)
export const getSelectState = (): SelectState | undefined => getContext(STATE)
export const setCollecting = (): void => {
  setContext(COLLECTING, true)
}
export const isCollecting = (): boolean => getContext<boolean | undefined>(COLLECTING) === true
