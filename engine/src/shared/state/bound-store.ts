// SPDX-License-Identifier: MIT

/**
 * zustand's `create`, without React.
 *
 * zustand's own `create` builds a vanilla store and wraps it in a React hook,
 * which puts React in the engine's module graph. This builds the same vanilla
 * store and returns it callable, with zustand's `UseBoundStore` shape: calling
 * it as a hook is delegated to whatever UI binding the host installed with
 * {@link bindStoreHook}. Engine code never calls it; it reads and writes
 * through `getState`, `setState` and `subscribe`, which work everywhere.
 */

import {
  createStore,
  type Mutate,
  type StateCreator,
  type StoreApi,
  type StoreMutatorIdentifier,
} from 'zustand/vanilla'

export type { StoreApi }

type ExtractState<S> = S extends { getState: () => infer T } ? T : never

/** A store that can also be called as a hook once a UI binding is installed. */
export type UseBoundStore<S extends Pick<StoreApi<unknown>, 'getState' | 'subscribe'>> = {
  (): ExtractState<S>
  <U>(selector: (state: ExtractState<S>) => U): U
} & S

/**
 * Reads a store from inside a component, re-rendering it when the selected
 * slice changes. For React this is zustand's `useStore`.
 */
export type StoreHookBinding = <S extends Pick<StoreApi<unknown>, 'getState' | 'subscribe'>, U>(
  api: S,
  selector: (state: ExtractState<S>) => U,
) => U

let hookBinding: StoreHookBinding | null = null

/**
 * Installs the UI framework's store hook. The app calls this once, before
 * anything renders; `null` uninstalls it.
 */
export function bindStoreHook(binding: StoreHookBinding | null): void {
  hookBinding = binding
}

type ListenerScope = (run: () => void) => void

let listenerScope: ListenerScope = (run) => run()

/**
 * Runs every store listener inside `scope`. Stores notify synchronously,
 * inside whatever wrote them; a UI framework that tracks reads (Svelte's
 * `untrack`) keeps a listener's reads from becoming dependencies of the effect
 * that wrote the store, which would re-run it on its own notification.
 */
export function bindListenerScope(scope: ListenerScope | null): void {
  listenerScope = scope ?? ((run) => run())
}

const identity = <T>(value: T): T => value

const createdStores = new Set<StoreApi<unknown>>()

/**
 * Puts every store `create` made back to its initial state, for an SDK
 * editor's `dispose()`. Persisted stores (user preferences) keep theirs.
 */
export function resetBoundStores(): void {
  for (const api of createdStores) {
    if ('persist' in api) continue
    api.setState(api.getInitialState(), true)
  }
}

function createBoundStore<T, Mos extends [StoreMutatorIdentifier, unknown][]>(
  initializer: StateCreator<T, [], Mos>,
): UseBoundStore<Mutate<StoreApi<T>, Mos>> {
  const api = createStore(initializer)
  createdStores.add(api as StoreApi<unknown>)
  // Listeners, and the selectors subscribeWithSelector takes, run in the bound
  // scope; the scope is read on each notification, so binding it late works.
  const subscribe = api.subscribe as (...args: unknown[]) => () => void
  api.subscribe = ((...args: unknown[]) =>
    subscribe(
      ...args.map((arg) =>
        typeof arg === 'function'
          ? (...params: unknown[]) => {
              let result: unknown
              listenerScope(() => {
                result = (arg as (...p: unknown[]) => unknown)(...params)
              })
              return result
            }
          : arg,
      ),
    )) as typeof api.subscribe
  const useBoundStore = <U>(selector: (state: T) => U = identity as (state: T) => U): U => {
    if (!hookBinding) {
      throw new Error(
        'Store read as a hook with no UI binding installed. Outside a component, use getState() and subscribe().',
      )
    }
    return hookBinding(api, selector as never) as U
  }
  return Object.assign(useBoundStore, api) as unknown as UseBoundStore<Mutate<StoreApi<T>, Mos>>
}

type Create = {
  <T, Mos extends [StoreMutatorIdentifier, unknown][] = []>(
    initializer: StateCreator<T, [], Mos>,
  ): UseBoundStore<Mutate<StoreApi<T>, Mos>>
  <T>(): <Mos extends [StoreMutatorIdentifier, unknown][] = []>(
    initializer: StateCreator<T, [], Mos>,
  ) => UseBoundStore<Mutate<StoreApi<T>, Mos>>
}

/** Same signature as zustand's `create`, curried form included. */
export const create = (<T, Mos extends [StoreMutatorIdentifier, unknown][] = []>(
  initializer?: StateCreator<T, [], Mos>,
) => (initializer ? createBoundStore(initializer) : createBoundStore)) as Create
