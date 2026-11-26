// SPDX-License-Identifier: MIT

import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from 'zustand/middleware'
import { shallow } from 'zustand/vanilla/shallow'

/**
 * zustand's JSON storage, skipping writes of what it wrote last. `persist`
 * writes on every `set`, partialized or not, so a store that also holds hot
 * state (the playhead) would serialize and write storage every frame.
 */
export function createUnchangedSkippingStorage<S>(
  getStorage: () => StateStorage,
): PersistStorage<S> | undefined {
  const storage = createJSONStorage<S>(getStorage)
  if (!storage) return undefined
  const written = new Map<string, StorageValue<S>>()
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      const last = written.get(name)
      if (last && last.version === value.version && shallow(last.state, value.state)) return
      written.set(name, value)
      return storage.setItem(name, value)
    },
    removeItem: (name) => {
      written.delete(name)
      return storage.removeItem(name)
    },
  }
}
