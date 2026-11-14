// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, screen } from '@testing-library/svelte'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { mountApp, type MountedApp } from './mount-app'

vi.mock('@/shared/utils/github-stars', () => ({
  readGitHubStarsCache: () => null,
  isGitHubStarsCacheFresh: () => true,
  refreshGitHubStarCount: async () => null,
}))

let mounted: MountedApp | null = null
// Routes load their pages lazily; under a full parallel run, transforming them takes seconds.
const ROUTE_LOAD = { timeout: 10_000 }

beforeAll(() => {
  // jsdom has no constructable stylesheets.
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.assign(CSSStyleSheet.prototype, { replaceSync() {} })
  }
  window.scrollTo = () => {}
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('mountApp', () => {
  it('renders the landing page without a workspace, and routes to the docs from it', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    window.history.replaceState(null, '', '/')

    mounted = await mountApp(target)

    expect(target.querySelector('.ec-root')?.getAttribute('data-theme')).toBe('dark')
    expect(await screen.findByRole('heading', { level: 1 }, ROUTE_LOAD)).toHaveTextContent(
      'Edit videos. In your browser.',
    )

    const [docsLink] = await screen.findAllByRole('link', { name: 'Docs' })
    await fireEvent.click(docsLink!)

    expect(
      await screen.findByRole('heading', { name: 'FreeCut User Guide' }, ROUTE_LOAD),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/docs')
  })

  it('removes everything it mounted on unmount', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    window.history.replaceState(null, '', '/docs/getting-started')

    const app = await mountApp(target)
    expect(
      await screen.findByRole('heading', { name: 'Getting Started' }, ROUTE_LOAD),
    ).toBeInTheDocument()

    await app.unmount()
    expect(target.querySelector('.ec-root')).toBeNull()
    expect(target.querySelector('.ec-portal')).toBeNull()
  })
})
