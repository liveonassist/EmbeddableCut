// SPDX-License-Identifier: MIT

type Listener<T> = (payload: T) => void

/** A minimal typed event emitter; a listener that throws doesn't stop the others. */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<never>)
    return () => set.delete(listener as Listener<never>)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        ;(listener as Listener<Events[K]>)(payload)
      } catch (error) {
        console.error(`EmbeddableCut: a "${String(event)}" listener threw`, error)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
