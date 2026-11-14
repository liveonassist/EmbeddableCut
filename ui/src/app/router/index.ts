// SPDX-License-Identifier: MIT

/**
 * The app's router, standing in for `@tanstack/react-router`: `Link`,
 * `Navigate`, `useNavigate`, `useRouter`, and `RouterProvider`.
 */

export { default as Link } from './link.svelte'
export { default as Navigate } from './navigate.svelte'
export { default as RouterProvider } from './router-provider.svelte'
export {
  Router,
  buildHref,
  findRouter,
  interpolatePath,
  useNavigate,
  useRouter,
  type RouterState,
} from './router.svelte'
export type {
  ErrorComponentProps,
  NavigateOptions,
  RouteComponent,
  RouteComponentProps,
  RouteContext,
  RouteDefinition,
  RouteLocation,
  RouteMatch,
  RouteOptions,
  RouteParams,
} from './types'
