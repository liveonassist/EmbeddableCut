// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { EditorUi } from '$lib/context'
import { i18n } from '$lib/i18n.svelte'
import type { PanelContribution } from '../../../extensions/contributions'
import { FeatureGate } from '../../../extensions/feature-gate.svelte'
import { useEditorStore } from '@/shared/state/editor'
import MediaSidebarHarness from './media-sidebar.harness.svelte'

function fakeUi(panels: PanelContribution[]): EditorUi {
  const editor = { id: 'fake-editor', mediaSources: { url: true, local: true } }
  return {
    editor,
    contributions: {
      panels: (region: PanelContribution['region']) => panels.filter((p) => p.region === region),
    },
    theme: {},
    portalTarget: document.body,
  } as unknown as EditorUi
}

describe('MediaSidebar contributed panels', () => {
  beforeEach(() => {
    useEditorStore.setState({ activeTab: 'text', leftSidebarOpen: true })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('adds a contributed media panel as a tab and renders it when selected', async () => {
    const renderPanel = vi.fn((container: HTMLElement, context: { editor: unknown }) => {
      container.textContent = `Notes for ${(context.editor as { id: string }).id}`
    })
    render(MediaSidebarHarness, {
      props: {
        ui: fakeUi([
          { id: 'notes', title: 'Notes', region: 'media', content: { render: renderPanel } },
          {
            id: 'side',
            title: 'Inspector only',
            region: 'inspector',
            content: { render: vi.fn() },
          },
        ]),
      },
    })

    const tab = screen.getByRole('button', { name: 'Notes' })
    expect(screen.queryByRole('button', { name: 'Inspector only' })).toBeNull()
    // Mounted on first open, like the Lottie tab.
    expect(renderPanel).not.toHaveBeenCalled()

    await fireEvent.click(tab)

    expect(renderPanel).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Notes for fake-editor')).toBeVisible()
    expect(tab.className).toContain('bg-primary')
    // The header names the contributed panel, and the built-in tab is hidden.
    expect(screen.getAllByText('Notes').length).toBeGreaterThan(0)
    expect(useEditorStore.getState().activeTab).toBe('text')

    // Selecting a built-in tab again hides the panel but keeps it mounted.
    const shapesTab = document.querySelector<HTMLElement>(
      `[data-tooltip="${i18n.t('editor.mediaSidebar.shapes')}"]`,
    )!
    await fireEvent.click(shapesTab)
    expect(screen.getByText('Notes for fake-editor').closest('[data-panel-id]')).toHaveClass(
      'hidden',
    )
    expect(useEditorStore.getState().activeTab).toBe('shapes')
    expect(renderPanel).toHaveBeenCalledTimes(1)
  })
})

describe('MediaSidebar feature switches', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('leaves out hidden tabs, disables locked ones, and never shows either as active', () => {
    // The persisted tab is one the host hides.
    useEditorStore.setState({ activeTab: 'ai', leftSidebarOpen: true })
    const ui = fakeUi([])
    ui.features = new FeatureGate(ui.editor, { ai: false, 'sidebar.media': 'locked' })
    render(MediaSidebarHarness, { props: { ui } })

    const tab = (key: string) =>
      document.querySelector<HTMLButtonElement>(`[data-tooltip="${i18n.t(key)}"]`)
    expect(tab('editor.mediaSidebar.ai')).toBeNull()
    expect(tab('transcript.tabLabel')).toBeNull()
    expect(tab('editor.mediaSidebar.media')).toBeDisabled()
    // The first tab left on stands in for the hidden one.
    expect(tab('editor.mediaSidebar.text')!.className).toContain('bg-primary')
    ui.features.dispose()
  })
})
