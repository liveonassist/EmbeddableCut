// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { Editor, UiContributions } from '@embeddablecut/sdk'
import { ContributionRegistry } from '@/extensions/registry.svelte'
import type { EditorUi } from '$lib/context'
import { ThemeController } from '@/theme/theme'
import type { TimelineItem, VideoItem } from '@/types/timeline'
import Harness from './inspector-contributions.harness.svelte'
import ContributedSection from './inspector-contribution.stub.svelte'

const VIDEO_ITEM: VideoItem = {
  id: 'clip-video-1',
  type: 'video',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-video-1',
}

function createUi(host: UiContributions): EditorUi {
  const editor = {
    extensions: { list: () => [], subscribe: () => () => {} },
  } as unknown as Editor
  return {
    editor,
    contributions: new ContributionRegistry(editor, host),
    theme: new ThemeController(document.body),
    portalTarget: document.body,
  }
}

describe('InspectorContributions', () => {
  it('renders contributed sections in order, each given the editor and the item', () => {
    const ui = createUi({
      inspector: [
        {
          id: 'host-notes',
          title: 'Host notes',
          order: 200,
          content: { render: (container) => void (container.textContent = 'Rendered by host') },
        },
        { id: 'clip-notes', title: 'Clip notes', order: 100, content: ContributedSection },
      ],
    })

    render(Harness, { ui, item: VIDEO_ITEM })

    const sections = document.querySelectorAll('[data-inspector-contribution]')
    expect(
      [...sections].map((section) => section.getAttribute('data-inspector-contribution')),
    ).toEqual(['clip-notes', 'host-notes'])
    expect(screen.getByRole('button', { name: 'Clip notes' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByTestId('contributed-section')).toHaveTextContent('Notes for clip.mp4')
    expect(screen.getByTestId('contributed-section')).toHaveAttribute('data-has-editor', 'true')
    expect(screen.getByText('Rendered by host')).toBeInTheDocument()
  })

  it('offers only the sections whose `when` accepts the item', () => {
    const ui = createUi({
      inspector: [
        {
          id: 'audio-only',
          title: 'Audio tools',
          when: (item: TimelineItem) => item.type === 'audio',
          content: ContributedSection,
        },
        {
          id: 'video-only',
          title: 'Video tools',
          when: (item: TimelineItem) => item.type === 'video',
          content: ContributedSection,
        },
      ],
    })

    render(Harness, { ui, item: VIDEO_ITEM })

    expect(screen.getByRole('button', { name: 'Video tools' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Audio tools' })).not.toBeInTheDocument()
  })

  it('tears a host-rendered section down when the host replaces its contributions', () => {
    const teardown = vi.fn()
    const ui = createUi({
      inspector: [
        {
          id: 'host-panel',
          title: 'Host panel',
          content: {
            render: (container, context) => {
              container.textContent = `Host view of ${context.item.label}`
              return teardown
            },
          },
        },
      ],
    })

    render(Harness, { ui, item: VIDEO_ITEM })
    expect(screen.getByText('Host view of clip.mp4')).toBeInTheDocument()

    flushSync(() => ui.contributions.setHost({}))

    expect(teardown).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Host panel' })).not.toBeInTheDocument()
  })
})
