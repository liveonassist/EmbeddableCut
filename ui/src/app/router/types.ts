// SPDX-License-Identifier: MIT

import type { Component } from 'svelte'

/** Path params by name: `/editor/$projectId` gives `{ projectId }`. */
export type RouteParams = Record<string, string>

export interface RouteLocation {
  pathname: string
  search: string
  hash: string
}

export interface RouteContext {
  params: RouteParams
  location: RouteLocation
}

/** What a route component receives: its params and what its loader returned. */
export interface RouteComponentProps<TLoaderData = unknown> {
  params: RouteParams
  loaderData: TLoaderData
}

/** What the error component receives, as TanStack's `ErrorComponentProps`. */
export interface ErrorComponentProps {
  error: unknown
  reset: () => void
}

/**
 * A route component: it takes `RouteComponentProps` (narrowing its own
 * loader data) or no props at all.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- any props shape is accepted
export type RouteComponent = Component<any>

/**
 * A route, in TanStack Router's terms. `path` uses its syntax (`$param`
 * segments, a trailing slash for an index route), so `to` strings stay as
 * FreeCut writes them.
 */
export interface RouteDefinition extends RouteOptions {
  path: string
  /** An eagerly bundled component. */
  component?: RouteComponent
  /** A component loaded on first navigation, as a `.lazy` route file is. */
  lazyComponent?: () => Promise<{ default: RouteComponent }>
}

/** What a route module exports as `Route`: its loading logic, apart from its component. */
export interface RouteOptions {
  /** Runs before the loader on every navigation into the route. */
  beforeLoad?: (context: RouteContext) => unknown
  /** Runs on every navigation into the route; the result is the component's `loaderData`. */
  loader?: (context: RouteContext) => unknown
}

export interface NavigateOptions {
  to: string
  params?: RouteParams
  /** A query string, with or without its leading `?`. */
  search?: string
  hash?: string
  replace?: boolean
}

export interface RouteMatch {
  /** The route's path pattern, which TanStack calls its id (`/editor/$projectId`). */
  routeId: string
  params: RouteParams
}
