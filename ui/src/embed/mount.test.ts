// @vitest-environment jsdom

import { tick } from 'svelte'
import { fireEvent, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import type { Editor } from '@embeddablecut/sdk'
import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download'
import Upload from '@lucide/svelte/icons/upload'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import type { ActionHandler, EditorActions, SaveContext } from '../extensions/actions.svelte'
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
    const save = vi.fn<ActionHandler<SaveContext>>()
    const editor = await mountHosting({ save })
    await addTitle(editor)
    expect(isDirty()).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: 'Save project' }))

    await waitFor(() => expect(isDirty()).toBe(false))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ editor, trigger: 'user' }))
  })

  it('keeps the project dirty when it changed while the host was saving', async () => {
    let saved = false
    const editor = await mountHosting({
      save: async ({ editor }) => {
        await addTitle(editor, 'Typed during the upload')
        saved = true
      },
    })
    await addTitle(editor)

    await fireEvent.click(screen.getByRole('button', { name: 'Save project' }))

    await waitFor(() => expect(saved).toBe(true))
    // Past the save's own continuations, where it would mark the project clean.
    await new Promise((resolve) => setTimeout(resolve))
    expect(isDirty()).toBe(true)
  })

  it('names the actions as the host does, and saves elsewhere from beside Save', async () => {
    const publish = vi.fn()
    const save = vi.fn<ActionHandler<SaveContext>>()
    const saveAs = vi.fn()
    const target = document.createElement('div')
    document.body.append(target)
    mounted = await mountEditor(target, {
      isolation: 'none',
      // Publishing is the only way out, so it's a button rather than a menu.
      features: { 'export.bundle': false },
      actions: {
        // Components, not names: a named icon loads the whole icon set, which a test environment
        // compiles icon by icon, for longer than the test runs.
        save: { label: 'Save to disk', icon: HardDriveDownload, run: save },
        saveAs: { label: 'Save as a new file', run: saveAs },
        exportVideo: { label: 'Publish', icon: Upload, run: publish },
      },
    })
    await mounted.editor.createProject({ name: 'Hosted' })
    await tick()
    expect(screen.getByRole('button', { name: 'Publish' }).querySelector('svg')).toHaveClass(
      'lucide-upload',
    )
    expect(screen.getByRole('button', { name: 'Save to disk' }).querySelector('svg')).toHaveClass(
      'lucide-hard-drive-download',
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(publish).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Save to disk' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'user' })),
    )

    await addTitle(mounted.editor)
    await fireEvent.keyDown(screen.getByRole('button', { name: 'More ways to save' }), {
      key: 'Enter',
    })
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Save as a new file' }))
    await waitFor(() => expect(isDirty()).toBe(false))
    expect(saveAs).toHaveBeenCalledWith(expect.objectContaining({ editor: mounted.editor }))
    // The host says how its saves went.
    expect(screen.queryByText('Project saved')).toBeNull()
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
