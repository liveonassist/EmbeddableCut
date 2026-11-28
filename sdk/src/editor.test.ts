// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ProjectDocument } from '@embeddablecut/engine/schema/index'
import {
  asHandle,
  createRoot,
} from '@embeddablecut/engine/infrastructure/storage/workspace-fs/__tests__/in-memory-handle'
import { createEditor, type Editor } from './editor'
import { EditorError } from './errors'
import type { Extension } from './extensions'
import { useSettingsStore } from '@embeddablecut/engine/features/settings/stores/settings-store'
import { useCompositionsStore } from '@embeddablecut/engine/features/timeline/stores/compositions-store'
import { createPreComp } from '@embeddablecut/engine/features/timeline/stores/actions/composition-actions'

let editor: Editor | null = null

afterEach(() => {
  editor?.dispose()
  editor = null
})

async function newEditor(...args: Parameters<typeof createEditor>): Promise<Editor> {
  editor = await createEditor(...args)
  return editor
}

function codeOf(error: unknown): string | undefined {
  return error instanceof EditorError ? error.code : undefined
}

const urlAsset = {
  id: 'media-url',
  fileName: 'clip.mp4',
  mimeType: 'video/mp4',
  fileSize: 4096,
  duration: 4,
  width: 1280,
  height: 720,
  fps: 30,
  codec: 'avc1.64001f',
  bitrate: 1000,
  source: { type: 'url' as const, url: 'https://cdn.example.com/clip.mp4' },
}

describe('editor', () => {
  it('edits a new project and saves it as a document', async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Demo', width: 1280, height: 720, fps: 30 })

    const [track, text] = e.apply([
      { op: 'addTrack', callerId: 'track', kind: 'video' },
      {
        op: 'addText',
        trackId: { $ref: 'track#/detail/trackId' },
        text: 'Hello',
        durationInFrames: 60,
      },
    ])

    const document = e.toDocument()
    const item = document.project.timeline?.items.find(
      (i) => i.id === (text!.detail as { id: string }).id,
    )
    expect(item).toMatchObject({
      type: 'text',
      text: 'Hello',
      trackId: (track!.detail as { trackId: string }).trackId,
    })
    expect(document.requires).toEqual([])
  })

  it('undoes a batch of operations as one step', async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Demo' })
    e.apply({ op: 'addTrack', kind: 'video' })

    e.apply([
      { op: 'addText', text: 'One' },
      { op: 'addText', text: 'Two' },
    ])
    expect(e.timeline.items).toHaveLength(2)

    e.undo()
    expect(e.timeline.items).toHaveLength(0)
    e.redo()
    expect(e.timeline.items).toHaveLength(2)
  })

  it('announces an edit once, however many stores it writes', async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Demo' })
    await Promise.resolve()
    let changes = 0
    e.on('change', () => changes++)

    e.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'One' },
    ])
    await Promise.resolve()

    expect(changes).toBe(1)
  })

  it("renders without rewriting the editor's compositions", async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Demo' })
    const [, text] = e.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Nested', durationInFrames: 30 },
    ])
    expect(createPreComp('Nest', [(text!.detail as { id: string }).id])).not.toBeNull()
    await Promise.resolve()
    const compositions = useCompositionsStore.getState().compositions
    expect(compositions).toHaveLength(1)
    let changes = 0
    e.on('change', () => changes++)

    // jsdom can't draw, so the render fails, but only after it has read its inputs.
    await e.renderFrame({ frame: 0 }).catch(() => {})
    await Promise.resolve()

    expect(useCompositionsStore.getState().compositions).toBe(compositions)
    expect(changes).toBe(0)
  })

  it('reloads its own documents without loss', async () => {
    const first = await newEditor()
    await first.createProject({ name: 'Round trip' })
    first.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Kept' },
    ])
    const saved = JSON.parse(JSON.stringify(first.toDocument())) as ProjectDocument
    first.dispose()

    const second = await newEditor()
    const { project, warnings } = await second.loadDocument(saved)

    expect(project.name).toBe('Round trip')
    expect(warnings).toEqual([])
    expect(second.timeline.items).toEqual(saved.project.timeline?.items)
  })

  it('allows one live editor per page', async () => {
    await newEditor()
    await expect(createEditor()).rejects.toSatisfy((error) => codeOf(error) === 'EDITOR_ACTIVE')
  })

  it('says whether projects live in a folder, private storage or nowhere', async () => {
    // jsdom has no private storage, as some private windows don't.
    expect((await newEditor()).workspaceKind).toBe('none')
    editor!.dispose()

    const origin = createRoot('origin')
    const storage = {
      getDirectory: async () =>
        Object.assign(asHandle(origin), {
          resolve: async (handle: FileSystemHandle) =>
            handle.name === 'embeddablecut' ? ['embeddablecut'] : null,
        }),
    }
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage }))
    try {
      expect((await newEditor()).workspaceKind).toBe('private')
      editor!.dispose()
      // A folder the user picked, as only Chromium can give.
      expect((await newEditor({ workspace: asHandle(createRoot('Projects')) })).workspaceKind).toBe(
        'folder',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses media sources the host turned off', async () => {
    const source = await newEditor()
    await source.createProject({ name: 'Remote' })
    const document = { ...source.toDocument(), assets: [urlAsset] }
    source.dispose()

    const e = await newEditor({ media: { url: false } })
    expect(e.mediaSources).toEqual({ local: true, url: false })
    await expect(e.loadDocument(document)).rejects.toSatisfy(
      (error) => codeOf(error) === 'MEDIA_SOURCE_DISABLED',
    )
  })
})

describe('host policy', () => {
  it('refuses an operation that removes a guarded item, stopping the batch there', async () => {
    const e = await newEditor({
      guards: { remove: (items) => !items.some((i) => 'text' in i && i.text === 'Keep') },
    })
    await e.createProject({ name: 'Guarded' })
    const [, keep, other] = e.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Keep' },
      { op: 'addText', text: 'Other' },
    ])
    const idOf = (result: typeof keep) => (result!.detail as { id: string }).id

    let refusal: unknown
    try {
      e.apply([
        { op: 'removeItems', ids: [idOf(keep)] },
        { op: 'removeItems', ids: [idOf(other)] },
      ])
    } catch (error) {
      refusal = error
    }

    expect(codeOf(refusal)).toBe('EDIT_REFUSED')
    expect((refusal as EditorError).details).toEqual([expect.objectContaining({ id: idOf(keep) })])
    expect(e.timeline.items).toHaveLength(2)
    e.apply({ op: 'removeItems', ids: [idOf(other)] })
    expect(e.timeline.items).toHaveLength(1)
  })

  it('holds its settings policy until disposed', async () => {
    useSettingsStore.getState().setSetting('showWaveforms', false)
    const e = await newEditor({
      settings: { values: { showWaveforms: true }, locked: ['showWaveforms'] },
    })

    useSettingsStore.getState().setSetting('showWaveforms', false)
    expect(useSettingsStore.getState().showWaveforms).toBe(true)

    e.dispose()
    expect(useSettingsStore.getState().showWaveforms).toBe(false)
  })
})

describe('extensions', () => {
  const effect = {
    id: 'acme.tint',
    name: 'Tint',
    category: 'color' as const,
    shader: '',
    entryPoint: 'main',
    uniformSize: 16,
    params: {},
    packUniforms: () => null,
  }

  it('runs custom operations as editing steps', async () => {
    const extension: Extension = {
      id: 'acme.ops',
      operations: {
        addTitleCard: (op) => ({ text: `Title: ${String(op.title)}` }),
      },
    }
    const e = await newEditor({ extensions: [extension] })
    await e.createProject({ name: 'Ops' })

    expect(e.operations).toContain('addTitleCard')
    expect(e.apply({ op: 'addTitleCard', title: 'Intro' })[0]?.detail).toEqual({
      text: 'Title: Intro',
    })
  })

  it('names custom effects a document needs, and refuses it where they are missing', async () => {
    const withEffect = await newEditor({ extensions: [{ id: 'acme.looks', effects: [effect] }] })
    await withEffect.createProject({ name: 'Look' })
    const [, text] = withEffect.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Tinted' },
    ])
    withEffect.apply({
      op: 'addEffect',
      itemId: (text!.detail as { id: string }).id,
      gpuEffectType: 'acme.tint',
    })
    const document = withEffect.toDocument()
    withEffect.dispose()

    expect(document.requires).toEqual([{ kind: 'effect', id: 'acme.tint' }])
    const without = await newEditor()
    await expect(without.loadDocument(document)).rejects.toSatisfy(
      (error) => codeOf(error) === 'EXTENSION_MISSING',
    )
  })

  it('installs all of an extension or none of it', async () => {
    const e = await newEditor({ extensions: [{ id: 'acme.first', effects: [effect] }] })

    expect(() =>
      e.extensions.install({
        id: 'acme.second',
        operations: { noop: () => null },
        effects: [effect],
      }),
    ).toThrow(EditorError)
    expect(e.operations).not.toContain('noop')
    expect(e.extensions.list().map((x) => x.id)).toEqual(['acme.first'])
  })
})
