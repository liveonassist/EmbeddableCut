// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import TimelineDropGhostPreviews from './timeline-drop-ghost-previews.svelte'

describe('TimelineDropGhostPreviews', () => {
  it('does not render a lane-wide overlay', () => {
    const { container } = render(TimelineDropGhostPreviews, { props: { variant: 'track' } })

    expect(container.querySelector('.border-primary\\/50')).toBeNull()
  })

  it('renders track ghost previews with track-specific classes', () => {
    const { component } = render(TimelineDropGhostPreviews, { props: { variant: 'track' } })

    component.sync([{ left: 12, width: 48, label: 'Drop media', type: 'external-file' }])
    flushSync()

    const ghost = screen.getByText('Drop media').parentElement
    expect(ghost?.className).toContain('inset-y-0')
    expect(ghost?.className).toContain('border-primary')
    expect(ghost).toHaveStyle({ left: '12px', width: '48px' })
  })

  it('renders zone ghost previews with full-height styling', () => {
    const { component } = render(TimelineDropGhostPreviews, { props: { variant: 'zone' } })

    component.sync([{ left: 20, width: 80, label: 'Clip', type: 'video' }])
    flushSync()

    const ghost = screen.getByText('Clip').parentElement
    expect(ghost?.className).not.toContain('inset-y-0')
    expect(ghost).toHaveStyle({ left: '20px', width: '80px', top: '0px', height: '100%' })
  })
})
