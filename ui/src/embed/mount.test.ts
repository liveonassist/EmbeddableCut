// @vitest-environment jsdom

import { tick } from 'svelte'
import { fireEvent, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import type { Editor } from '@embeddablecut/sdk'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import type { EditorActions } from '../extensions/actions.svelte'
import { mountEditor, type MountedEditor } from './mount'

let mounted: MountedEditor | null = null

beforeAll(() => {
  // jsdom has no constructable stylesheets.
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.assign(CSSStyleSheet.prototype, { replaceSync() {} })
  }
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
})

describe('mountEditor', () => {
  it('renders inside its own shadow root and themes only itself', async () => {
    const target = document.createElement('div')
    document.body.append(target)

    mounted = await mountEditor(target, { theme: 'dark' })

    const host = target.querySelector<HTMLElement>('.ec-host')!
    expect(host.shadowRoot?.querySelector('.ec-root')).not.toBeNull()
    expect(document.querySelector('.ec-root')).toBeNull()
    expect(host.dataset.theme).toBe('dark')

    mounted.setTheme({ mode: 'light', tokens: { primary: 'oklch(0.6 0.2 250)' } })
    expect(host.dataset.theme).toBe('light')
    expect(host.style.getPropertyValue('--primary')).toBe('oklch(0.6 0.2 250)')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('opens the document it is given, and frees the page for the next editor on unmount', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const first = await mountEditor(target, { isolation: 'none' })
    await first.editor.createProject({ name: 'Handed over' })
    const document_ = first.editor.toDocument()
    await first.unmount()
    expect(target.querySelector('.ec-root')).toBeNull()

    mounted = await mountEditor(target, { isolation: 'none', document: document_ })
    await tick()

    expect(mounted.editor.project?.name).toBe('Handed over')
    expect(target.querySelector('.ec-root')?.textContent).toContain('Handed over')
  })
})

describe('mountEditor actions', { timeout: 15_000 }, () => {
  async function mountHosting(actions: EditorActions): Promise<Editor> {
    const target = document.createElement('div')
    document.body.append(target)
    mounted = await mountEditor(target, { isolation: 'none', actions })
    await mounted.editor.createProject({ name: 'Hosted' })
    await tick()
    return mounted.editor
  }

  const addTitle = (editor: Editor, text = 'Title') =>
    editor.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text },
    ])

  const isDirty = () => useTimelineSettingsStore.getState().isDirty

  it('saves through the host, and the project is clean once it has', async () => {
    const save = vi.fn<NonNullable<EditorActions['save']>>()
    const editor = await mountHosting({ save })
    await addTitle(editor)
    expect(isDirty()).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: 'Save project' }))

    await waitFor(() => expect(isDirty()).toBe(false))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ editor, trigger: 'user' }))
  })

  it('keeps the project dirty when it changed while the host was saving', async () => {
    const editor = await mountHosting({
      save: async ({ editor }) => {
        await addTitle(editor, 'Typed during the upload')
      },
    })
    await addTitle(editor)

    await fireEvent.click(screen.getByRole('button', { name: 'Save project' }))

    await waitFor(() => expect(screen.getByText('Project saved')).toBeInTheDocument())
    expect(isDirty()).toBe(true)
  })

  it('exports through the host, which can still open the export dialog', async () => {
    let openDialog: (() => Promise<void>) | undefined
    await mountHosting({
      exportVideo: ({ runDefault }) => {
        openDialog = runDefault
      },
    })

    await fireEvent.keyDown(screen.getByRole('button', { name: /^Export/ }), { key: 'Enter' })
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Export Video' }))

    expect(openDialog).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    await openDialog!()
    // The dialog loads lazily; under a full parallel run, transforming it takes seconds.
    expect(await screen.findByRole('dialog', {}, { timeout: 10_000 })).toBeInTheDocument()
  })

  it('offers help only when the host has some', async () => {
    const help = vi.fn()
    await mountHosting({})
    expect(screen.queryByRole('button', { name: 'User Guide' })).toBeNull()

    mounted!.setActions({ help })
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: 'User Guide' }))

    expect(help).toHaveBeenCalledTimes(1)
  })
})
