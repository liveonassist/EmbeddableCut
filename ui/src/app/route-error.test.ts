// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { i18n } from '@/i18n'
import { ProjectNotFoundError } from './route-error-cause'
import RouteErrorScreen from './route-error.svelte'

describe('RouteErrorScreen', () => {
  const writeText = vi.fn<() => Promise<void>>()

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    writeText.mockReset()
    writeText.mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('turns a missing project into a recovery path with copyable diagnostics', async () => {
    render(RouteErrorScreen, { error: new ProjectNotFoundError('project-123'), reset: vi.fn() })

    expect(screen.getByRole('heading', { name: "We couldn't find this project" })).toBeTruthy()
    expect(screen.queryByText('Project not found: project-123')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe(
      '/projects',
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Error: ProjectNotFoundError: Project not found: project-123'),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Error details copied' })).toBeTruthy(),
    )
  })
})
