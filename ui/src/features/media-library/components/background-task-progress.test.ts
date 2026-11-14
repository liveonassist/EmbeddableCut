// SPDX-License-Identifier: MIT

import { createRawSnippet } from 'svelte'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import BackgroundTaskProgress from './background-task-progress.svelte'

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }))

describe('BackgroundTaskProgress', () => {
  it('renders determinate progress with custom meta actions', async () => {
    const onCancel = vi.fn()
    const meta = createRawSnippet(() => ({
      render: () => '<span><span>42%</span><button type="button">Cancel all</button></span>',
      setup: (node) => {
        node.querySelector('button')?.addEventListener('click', onCancel)
      },
    }))

    render(BackgroundTaskProgress, {
      icon: html('<span>icon</span>'),
      label: 'Generating transcripts',
      progressAriaLabel: 'Transcript generation progress',
      progressPercent: 42.4,
      meta,
      fillClass: 'bg-blue-500',
    })

    expect(screen.getByText('Generating transcripts')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Transcript generation progress' }),
    ).toHaveAttribute('aria-valuenow', '42')

    await fireEvent.click(screen.getByText('Cancel all'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders indeterminate progress without a numeric value', () => {
    render(BackgroundTaskProgress, {
      icon: html('<span>icon</span>'),
      label: 'Analyzing with AI',
      progressAriaLabel: 'AI analysis progress',
      indeterminate: true,
      meta: html('<span>Working...</span>'),
      fillClass: 'bg-purple-500',
    })

    expect(screen.getByRole('progressbar', { name: 'AI analysis progress' })).not.toHaveAttribute(
      'aria-valuenow',
    )
    expect(screen.getByText('Working...')).toBeInTheDocument()
  })
})
