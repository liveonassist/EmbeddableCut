// SPDX-License-Identifier: MIT

/**
 * The app's client-side router: the part of TanStack Router FreeCut uses.
 * History API navigation, `$param` path matching, `beforeLoad` and `loader`
 * on every navigation (FreeCut's loaders are cheap and must be fresh, as the
 * editor route's `gcTime: 0` asks), lazily loaded route components, and the
 * previous route kept on screen until the next one has loaded.
 */

import { getContext, setContext } from 'svelte'
import type {
  NavigateOptions,
  RouteComponent,
  RouteDefinition,
  RouteLocation,
  RouteMatch,
  RouteParams,
} from './types'

/** The route on screen: loaded, failed, or not found. */
export type RouterState =
  | { kind: 'idle' }
  | {
      kind: 'ready'
      route: RouteDefinition
      params: RouteParams
      component: RouteComponent
      loaderData: unknown
    }
  | { kind: 'error'; route: RouteDefinition; params: RouteParams; error: unknown }
  | { kind: 'not-found' }

interface CompiledRoute {
  route: RouteDefinition
  segments: string[]
  /** Static segments rank above params, so `/projects/new` wins over `/projects/$projectId`. */
  rank: number[]
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function currentLocation(): RouteLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }
}

/** Fills `$param` segments of `to` with `params`: `/editor/$projectId` → `/editor/abc`. */
export function interpolatePath(to: string, params: RouteParams = {}): string {
  return to.replace(/\$([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`Missing route param "${name}" for ${to}`)
    return encodeURIComponent(value)
  })
}

export function buildHref(options: NavigateOptions): string {
  const pathname = interpolatePath(options.to, options.params)
  const search = options.search
    ? options.search.startsWith('?')
      ? options.search
      : `?${options.search}`
    : ''
  const hash = options.hash
    ? options.hash.startsWith('#')
      ? options.hash
      : `#${options.hash}`
    : ''
  return `${pathname}${search}${hash}`
}

export class Router {
  /** The route on screen. Replaced wholesale, once the next route has loaded. */
  state = $state.raw<RouterState>({ kind: 'idle' })
  /** The URL now, which leads `state` while a navigation loads. */
  location = $state.raw<RouteLocation>({ pathname: '/', search: '', hash: '' })

  private readonly routes: CompiledRoute[]
  private loadId = 0
  private started = false

  constructor(routes: RouteDefinition[]) {
    this.routes = routes
      .map((route) => {
        const segments = splitPath(route.path)
        return { route, segments, rank: segments.map((s) => (s.startsWith('$') ? 1 : 0)) }
      })
      .sort((a, b) => {
        for (let i = 0; i < Math.min(a.rank.length, b.rank.length); i++) {
          const diff = (a.rank[i] ?? 0) - (b.rank[i] ?? 0)
          if (diff !== 0) return diff
        }
        return 0
      })
  }

  /** Starts following the URL; returns the stop. */
  start(): () => void {
    this.started = true
    const onPopState = () => {
      void this.load({ resetScroll: false })
    }
    window.addEventListener('popstate', onPopState)
    void this.load({ resetScroll: false })
    return () => {
      this.started = false
      this.loadId++
      window.removeEventListener('popstate', onPopState)
    }
  }

  match(pathname: string): RouteMatch | null {
    const segments = splitPath(pathname)
    for (const { route, segments: pattern } of this.routes) {
      if (pattern.length !== segments.length) continue
      const params: RouteParams = {}
      let matched = true
      for (let i = 0; i < pattern.length; i++) {
        const part = pattern[i]!
        const actual = segments[i]!
        if (part.startsWith('$')) {
          try {
            params[part.slice(1)] = decodeURIComponent(actual)
          } catch {
            matched = false
            break
          }
        } else if (part !== actual) {
          matched = false
          break
        }
      }
      if (matched) return { routeId: route.path, params }
    }
    return null
  }

  buildHref(options: NavigateOptions): string {
    return buildHref(options)
  }

  async navigate(options: NavigateOptions): Promise<void> {
    const href = buildHref(options)
    if (options.replace) window.history.replaceState(window.history.state, '', href)
    else window.history.pushState(null, '', href)
    await this.load({ resetScroll: true })
  }

  /**
   * Re-runs the current route's `beforeLoad` and `loader`. With `filter`, only
   * when the current match passes it (TanStack's `invalidate({ filter })`).
   */
  async invalidate(options: { filter?: (match: RouteMatch) => boolean } = {}): Promise<void> {
    const state = this.state
    if (options.filter) {
      if (state.kind !== 'ready' && state.kind !== 'error') return
      if (!options.filter({ routeId: state.route.path, params: state.params })) return
    }
    await this.load({ resetScroll: false })
  }

  private async load({ resetScroll }: { resetScroll: boolean }): Promise<void> {
    if (!this.started) return
    const id = ++this.loadId
    const location = currentLocation()
    this.location = location
    const match = this.match(location.pathname)
    if (!match) {
      this.state = { kind: 'not-found' }
      return
    }
    const compiled = this.routes.find((r) => r.route.path === match.routeId)!
    const { route } = compiled
    const context = { params: match.params, location }
    try {
      await route.beforeLoad?.(context)
      if (id !== this.loadId) return
      const [loaderData, component] = await Promise.all([
        route.loader?.(context),
        route.component ?? route.lazyComponent!().then((module) => module.default),
      ])
      if (id !== this.loadId) return
      this.state = { kind: 'ready', route, params: match.params, component, loaderData }
      if (resetScroll) window.scrollTo(0, 0)
    } catch (error) {
      if (id !== this.loadId) return
      this.state = { kind: 'error', route, params: match.params, error }
    }
  }
}

const KEY = Symbol('embeddablecut.router')

export function setRouter(router: Router): void {
  setContext(KEY, router)
}

/** The router, or null outside one (a component rendered on its own, in a test). */
export function findRouter(): Router | null {
  return getContext<Router | undefined>(KEY) ?? null
}

/** TanStack's `useRouter`. @throws outside a router. */
export function useRouter(): Router {
  const router = findRouter()
  if (!router) throw new Error('useRouter() outside a RouterProvider')
  return router
}

/** TanStack's `useNavigate`: call at component init, navigate from handlers. */
export function useNavigate(): (options: NavigateOptions) => Promise<void> {
  const router = useRouter()
  return (options) => router.navigate(options)
}
