// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { Router, interpolatePath } from './router.svelte'
import RouterProvider from './router-provider.svelte'
import RoutePage from './route-page.harness.svelte'
import RouteFailure from './route-failure.harness.svelte'
import LinkPage from './link-page.harness.svelte'
import type { RouteDefinition } from './types'

function start(routes: RouteDefinition[], path: string) {
  window.history.replaceState(null, '', path)
  const router = new Router(routes)
  render(RouterProvider, { router, defaultErrorComponent: RouteFailure })
  return router
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('Router', () => {
  it('matches static segments before params, and trailing slashes either way', () => {
    const router = new Router([
      { path: '/projects/$projectId', component: RoutePage },
      { path: '/projects/new', component: RoutePage },
      { path: '/projects/', component: RoutePage },
    ])

    expect(router.match('/projects/new')?.routeId).toBe('/projects/new')
    expect(router.match('/projects/abc')).toEqual({
      routeId: '/projects/$projectId',
      params: { projectId: 'abc' },
    })
    expect(router.match('/projects')?.routeId).toBe('/projects/')
    expect(router.match('/projects/')?.routeId).toBe('/projects/')
    expect(router.match('/nowhere')).toBeNull()
  })

  it('fills params into paths, encoded', () => {
    expect(interpolatePath('/docs/$slug', { slug: 'a b' })).toBe('/docs/a%20b')
    expect(() => interpolatePath('/docs/$slug')).toThrow(/slug/)
  })

  it('runs beforeLoad then the loader, and hands the component its data', async () => {
    const order: string[] = []
    start(
      [
        {
          path: '/editor/$projectId',
          beforeLoad: () => {
            order.push('beforeLoad')
          },
          loader: async ({ params }) => {
            order.push('loader')
            return { name: `project ${params.projectId}` }
          },
          lazyComponent: async () => ({ default: RoutePage }),
        },
      ],
      '/editor/p1',
    )

    expect(
      await screen.findByText('/editor/p1 {"projectId":"p1"} {"name":"project p1"}'),
    ).toBeInTheDocument()
    expect(order).toEqual(['beforeLoad', 'loader'])
  })

  it('navigates from links in place, and follows history back', async () => {
    start(
      [
        { path: '/', component: LinkPage },
        { path: '/docs/$slug', component: RoutePage },
      ],
      '/',
    )

    await fireEvent.click(await screen.findByRole('link', { name: 'Getting started' }))
    expect(
      await screen.findByText('/docs/getting-started {"slug":"getting-started"} null'),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/docs/getting-started')

    window.history.back()
    expect(await screen.findByRole('link', { name: 'Getting started' })).toBeInTheDocument()
  })

  it('renders the error component when a loader throws, and reloads on invalidate', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk gone'))
      .mockResolvedValueOnce('back')
    const router = start([{ path: '/', loader, component: RoutePage }], '/')

    expect(await screen.findByText('failed: disk gone')).toBeInTheDocument()

    await router.invalidate()
    await waitFor(() => expect(screen.getByText('/ {} "back"')).toBeInTheDocument())
  })

  it('renders FreeCut’s not-found fallback for an unknown path', async () => {
    start([{ path: '/', component: RoutePage }], '/missing')

    expect(await screen.findByText('Not Found')).toBeInTheDocument()
  })
})
