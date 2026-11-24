// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { Editor, UiContributions } from '@embeddablecut/sdk'
import { ContributionRegistry } from '@/extensions/registry.svelte'
import { ThemeController } from '@/theme/theme'
import type { TimelineItem, VideoItem } from '@/types/timeline'
import Harness from './contributed-menu-items.harness.svelte'

vi.mock('@/features/timeline/deps/analysis', () => ({
  getSceneVerificationModelOptions: () => [],
}))

const clip = (id: string): VideoItem => ({
  id,
  type: 'video',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-1',
})

async function openMenu(item: TimelineItem, host: UiContributions) {
  const editor = {
    extensions: { list: () => [], subscribe: () => () => {} },
  } as unknown as Editor
  const nothing = () => {}
  render(Harness, {
    ui: {
      editor,
      contributions: new ContributionRegistry(editor, host),
      theme: new ThemeController(document.body),
      portalTarget: document.body,
    },
    menu: {
      children: createRawSnippet(() => ({ render: () => '<div>Clip</div>' })),
      item,
      trackLocked: false,
      joinActions: {
        canJoinSelected: false,
        hasJoinableLeft: false,
        hasJoinableRight: false,
        closerEdge: null,
        onJoinSelected: nothing,
        onJoinLeft: nothing,
        onJoinRight: nothing,
      },
      destructiveActions: { isSelected: true, onRippleDelete: nothing, onDelete: nothing },
    },
  })
  await fireEvent.contextMenu(screen.getByText('Clip'), { clientX: 10, clientY: 10 })
  await screen.findByRole('menu')
  return editor
}

describe('ContributedMenuItems', () => {
  it('gives a clip its menu entries, and an entry the clip', async () => {
    const onSelect = vi.fn()
    const item = clip('mine')
    const editor = await openMenu(item, {
      menus: [
        {
          id: 'review',
          menu: 'clip',
          label: 'Send for review',
          when: (target) => 'item' in target && target.item.id === 'mine',
          onSelect,
        },
        { id: 'not-here', menu: 'media', label: 'For media', onSelect },
        { id: 'not-it', menu: 'clip', label: 'For another', when: () => false, onSelect },
      ],
    })

    expect(screen.queryByText('For media')).toBeNull()
    expect(screen.queryByText('For another')).toBeNull()
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Send for review' }))
    expect(onSelect).toHaveBeenCalledWith({ editor, item })
  })
})
