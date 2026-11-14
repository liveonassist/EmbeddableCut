// SPDX-License-Identifier: MIT

/**
 * FreeCut's routes (its generated `routeTree.gen.ts`): each route module's
 * `Route` options, and its component, lazily loaded where FreeCut's is a
 * `.lazy` file.
 */

import type { RouteDefinition } from '$lib/router'
import LandingPage from '../routes/index.svelte'
import ProjectRouteRedirect from '../routes/projects/$projectId.svelte'
import { Route as EditorRoute } from '../routes/editor/$projectId'
import { Route as ProjectsIndexRoute } from '../routes/projects/index'
import { Route as NewProjectRoute } from '../routes/projects/new'

export const routeTree: RouteDefinition[] = [
  { path: '/', component: LandingPage },
  { path: '/changelog', lazyComponent: () => import('../routes/changelog.lazy.svelte') },
  { path: '/docs/', lazyComponent: () => import('../routes/docs/index.lazy.svelte') },
  { path: '/docs/$slug', lazyComponent: () => import('../routes/docs/$slug.lazy.svelte') },
  {
    path: '/editor/$projectId',
    ...EditorRoute,
    lazyComponent: () => import('../routes/editor/$projectId.lazy.svelte'),
  },
  {
    path: '/projects/',
    ...ProjectsIndexRoute,
    lazyComponent: () => import('../routes/projects/index.lazy.svelte'),
  },
  {
    path: '/projects/new',
    ...NewProjectRoute,
    lazyComponent: () => import('../routes/projects/new.lazy.svelte'),
  },
  { path: '/projects/$projectId', component: ProjectRouteRedirect },
]
