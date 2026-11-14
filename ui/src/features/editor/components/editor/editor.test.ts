// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { UiContributions } from '@embeddablecut/sdk'
import { mountEditor, type MountedEditor } from '../../../../embed/mount'
import type { ReplaceableSlot } from '../../../../extensions/contributions'
import { useEditorStore } from '@/shared/state/editor'

let mounted: MountedEditor | null = null

/** A host replacement that writes its slot's name, so a test can see where it rendered. */
const probe = (slot: ReplaceableSlot) => ({
  render(container: HTMLElement) {
    container.dataset.testid = `host-${slot}`
    container.textContent = `host ${slot}`
  },
})

async function mountWith(ui: UiContributions): Promise<MountedEditor> {
  const target = document.createElement('div')
  document.body.append(target)
  mounted = await mountEditor(target, { isolation: 'none', ui })
  await mounted.editor.createProject({ name: 'Contributed' })
  await tick()
  return mounted
}

beforeAll(() => {
  vi.stubGlobal('requestIdleCallback', () => 1)
  vi.stubGlobal('cancelIdleCallback', () => {})
})

beforeEach(() => {
  useEditorStore.setState({
    workspace: 'edit',
    propertiesFullColumn: false,
    mediaFullColumn: false,
  })
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
})

describe('Editor', () => {
  it('renders nothing until the SDK opens a project, then the project in the toolbar', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    mounted = await mountEditor(target, { isolation: 'none' })
    expect(screen.queryByRole('application')).toBeNull()

    await mounted.editor.createProject({ name: 'Opened by the host' })
    await tick()

    expect(screen.getByRole('application')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Opened by the host' })).toBeInTheDocument()

    mounted.editor.closeProject()
    await tick()
    expect(screen.queryByRole('application')).toBeNull()
  })

  it('renders a contributed toolbar item and runs it with the editor', async () => {
    const onSelect = vi.fn()
    const { editor } = await mountWith({
      toolbar: [{ id: 'share', label: 'Share with team', region: 'right', onSelect }],
    })

    const toolbar = screen.getByRole('toolbar')
    const share = screen.getByRole('button', { name: 'Share with team' })
    expect(toolbar).toContainElement(share)

    await fireEvent.click(share)
    expect(onSelect).toHaveBeenCalledWith({ editor })
  })

  it('renders host replacements in place of the built-in pieces', async () => {
    await mountWith({
      components: {
        'media-sidebar': probe('media-sidebar'),
        preview: probe('preview'),
        'properties-sidebar': probe('properties-sidebar'),
        timeline: probe('timeline'),
      },
    })

    for (const slot of ['media-sidebar', 'preview', 'properties-sidebar', 'timeline'] as const) {
      expect(screen.getByTestId(`host-${slot}`)).toHaveTextContent(`host ${slot}`)
    }
    // The built-in toolbar still renders: only what's replaced goes.
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('replaces the whole toolbar when the host gives one', async () => {
    await mountWith({ components: { toolbar: probe('toolbar') } })

    expect(screen.getByTestId('host-toolbar')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('renders a bottom panel beside the timeline', async () => {
    await mountWith({
      panels: [
        {
          id: 'notes',
          title: 'Review notes',
          region: 'bottom',
          content: {
            render(container) {
              container.textContent = 'Three notes'
            },
          },
        },
      ],
      components: { timeline: probe('timeline') },
    })

    const panel = screen.getByRole('region', { name: 'Review notes' })
    expect(panel).toHaveTextContent('Three notes')
    expect(screen.getByTestId('host-timeline').parentElement?.parentElement).toContainElement(panel)
  })

  it('drops the timeline and both sidebars in the color workspace', async () => {
    useEditorStore.setState({ workspace: 'color', propertiesFullColumn: true })
    await mountWith({
      components: {
        'media-sidebar': probe('media-sidebar'),
        preview: probe('preview'),
        'properties-sidebar': probe('properties-sidebar'),
        timeline: probe('timeline'),
      },
    })

    expect(screen.getByTestId('host-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('host-timeline')).toBeNull()
    expect(screen.queryByTestId('host-media-sidebar')).toBeNull()
    expect(screen.queryByTestId('host-properties-sidebar')).toBeNull()
  })

  it('keeps the shared sidebars in Motion and swaps only the preview and timeline', async () => {
    useEditorStore.setState({ workspace: 'motion' })
    await mountWith({
      components: {
        'media-sidebar': probe('media-sidebar'),
        preview: probe('preview'),
        'properties-sidebar': probe('properties-sidebar'),
        timeline: probe('timeline'),
      },
    })

    expect(screen.getByTestId('host-media-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('host-properties-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('host-preview')).toBeNull()
    expect(screen.queryByTestId('host-timeline')).toBeNull()
  })
})
