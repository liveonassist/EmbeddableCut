// @vitest-environment jsdom
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const processMedia = vi.hoisted(() => vi.fn())

vi.mock('@embeddablecut/engine/features/media-library/services/media-processor-service', () => ({
  mediaProcessorService: {
    processMedia,
    hasUnsupportedAudioCodec: () => ({ unsupported: false }),
  },
}))

import { useMediaLibraryStore } from '@embeddablecut/engine/features/media-library/stores/media-library-store'
import { resolveMediaUrl } from '@embeddablecut/engine/features/media-library/utils/media-resolver'
import { useZoomStore } from '@embeddablecut/engine/features/timeline/stores/zoom-store'
import { createEditor, type Editor } from './editor'
import type { MediaResolver } from './media'

let editor: Editor | null = null

// jsdom's Blob can't be read; browsers' and Node's can.
Object.defineProperty(Blob.prototype, 'arrayBuffer', {
  configurable: true,
  value(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  },
})

beforeEach(() => {
  processMedia.mockResolvedValue({
    metadata: { type: 'video', duration: 2, width: 1920, height: 1080, fps: 30, codec: 'avc1' },
    thumbnail: null,
  })
})

afterEach(() => {
  editor?.dispose()
  editor = null
  vi.unstubAllGlobals()
})

async function newEditor(...args: Parameters<typeof createEditor>): Promise<Editor> {
  editor = await createEditor(...args)
  return editor
}

/** A media server: every URL serves one byte, unless `refuses` it. */
function serve(refuses: (url: string) => boolean = () => false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      return refuses(url)
        ? new Response(null, { status: 403 })
        : new Response('x', {
            status: 206,
            headers: { 'Content-Range': 'bytes 0-0/100', 'Content-Type': 'video/mp4' },
          })
    }),
  )
}

describe('project settings', () => {
  it("changes a document project's settings with its timeline, undoably, and says so", async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Recap', width: 1920, height: 1080, fps: 30 })
    e.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Title', from: 30, durationInFrames: 45, fontSize: 80 },
    ])
    const changes: unknown[] = []
    e.on('projectChange', (info) => changes.push(info))

    const info = e.updateProject({ width: 1080, height: 1920, fps: 60 })
    expect(info).toMatchObject({ width: 1080, height: 1920, fps: 60 })
    expect(changes).toEqual([info])
    expect(e.timeline.items[0]).toMatchObject({ from: 60, durationInFrames: 90, fontSize: 45 })
    expect(e.toDocument().project.metadata).toMatchObject({ width: 1080, height: 1920, fps: 60 })

    e.undo()
    expect(e.project).toMatchObject({ width: 1920, height: 1080, fps: 30 })
    expect(e.timeline.items[0]).toMatchObject({ from: 30, durationInFrames: 45, fontSize: 80 })

    e.updateProject({ name: 'Week 10' })
    expect(e.project?.name).toBe('Week 10')
  })

  it('refuses settings no project can have', async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Recap', fps: 30 })
    for (const update of [{ fps: 0 }, { width: 10 }, { height: Number.NaN }, { name: ' ' }]) {
      expect(() => e.updateProject(update)).toThrowError(
        expect.objectContaining({ code: 'SETTING_INVALID' }),
      )
    }
    expect(e.project).toMatchObject({ name: 'Recap', fps: 30 })
  })

  it('tells the host about unsaved changes until it says they are saved', async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Recap' })
    const dirty: boolean[] = []
    e.on('dirty', (value) => dirty.push(value))
    expect(e.dirty).toBe(false)
    e.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addText', text: 'Title' },
    ])
    expect(e.dirty).toBe(true)
    e.markSaved()
    e.updateProject({ backgroundColor: '#112233' })
    expect(dirty).toEqual([true, false, true])
  })
})

it('saves a timeline zoomed out further than a document can say', async () => {
  const e = await newEditor()
  await e.createProject({ name: 'Long' })
  useZoomStore.getState().setZoomLevelSynchronized(0.002)
  expect(e.toDocument().project.timeline?.zoomLevel).toBe(0.01)
})

describe('bundles', () => {
  it('opens elsewhere with the local media the timeline uses', async () => {
    const first = await newEditor({ workspace: 'none' })
    await first.createProject({ name: 'Local' })
    const bytes = new Uint8Array(5000).map((_, i) => i)
    const [asset] = await first.media.addFiles([
      new File([bytes], 'intro.mp4', { type: 'video/mp4' }),
    ])
    await first.media.addFiles([new File(['unused'], 'unused.mp4', { type: 'video/mp4' })])
    first.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addClip', mediaId: asset!.id },
    ])
    const items = first.timeline.items
    const bundle = await first.toBundle()
    first.dispose()

    const second = await newEditor({ workspace: 'none' })
    await second.loadBundle(bundle)
    expect(second.timeline.items).toEqual(items)
    const read = await second.media.read(asset!.id)
    expect(read.type).toBe('video/mp4')
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes)
    expect(useMediaLibraryStore.getState().brokenMediaIds).toEqual([])
    // And again: what was opened from a bundle saves to one.
    expect((await second.toBundle()).size).toBe(bundle.size)
  })

  it("opens a bare document, and refuses what isn't a project", async () => {
    const e = await newEditor()
    await e.createProject({ name: 'Plain' })
    const json = JSON.stringify(e.toDocument())
    const bundle = await e.toBundle()
    await e.loadBundle(new Blob([json]))
    expect(e.project?.name).toBe('Plain')
    for (const broken of ['not a project', bundle.slice(0, bundle.size - 30)]) {
      await expect(e.loadBundle(new Blob([broken]))).rejects.toMatchObject({
        code: 'BUNDLE_INVALID',
      })
    }
  })
})

describe('URL media', () => {
  it('asks the resolver once for an added URL, and not at all for a fresh one', async () => {
    serve()
    const resolve = vi.fn<MediaResolver>(async ({ source }) =>
      source.type === 'url' ? { url: source.url } : null,
    )
    const e = await newEditor({ media: { resolve } })
    await e.createProject({ name: 'URLs' })
    const plain = await e.media.addUrl({ url: 'https://cdn.example.com/a.mp4', key: 'k:a' })
    await resolveMediaUrl(plain.id)
    expect(resolve).toHaveBeenCalledTimes(1)

    const signed = await e.media.addUrl({
      url: 'https://cdn.example.com/b.mp4',
      key: 'k:b',
      expiresAt: Date.now() + 3_600_000,
    })
    const declared = await e.media.addUrl({
      url: 'https://cdn.example.com/c.mp4',
      fetchable: true,
    })
    expect(await resolveMediaUrl(signed.id)).toBe('https://cdn.example.com/b.mp4')
    expect(await resolveMediaUrl(declared.id)).toBe('https://cdn.example.com/c.mp4')
    expect(resolve).toHaveBeenCalledTimes(1)

    // One about to expire isn't fresh.
    await e.media.addUrl({ url: 'https://cdn.example.com/d.mp4', expiresAt: Date.now() + 1000 })
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('adds many in order, reporting the ones that fail', async () => {
    serve((url) => url.includes('gone'))
    const e = await newEditor()
    await e.createProject({ name: 'URLs' })
    const progress: number[] = []
    const results = await e.media.addUrls(
      ['a', 'gone', 'b', 'c'].map((name) => ({
        url: `https://cdn.example.com/${name}.mp4`,
        fileName: name,
        fetchable: true,
      })),
      { concurrency: 2, onProgress: (done) => progress.push(done) },
    )
    expect(results.map((r) => r.asset?.fileName ?? r.error?.message)).toEqual([
      'a',
      expect.stringContaining('HTTP 403'),
      'b',
      'c',
    ])
    expect(progress).toEqual([1, 2, 3, 4])
    expect(e.media.list().map((asset) => asset.fileName)).toEqual(['a', 'b', 'c'])
  })

  it('opens a document whose URLs expired by asking for them again, and finds what is gone', async () => {
    serve((url) => url.includes('old') || url.includes('deleted'))
    const asset = (id: string) => ({
      id,
      fileName: `${id}.mp4`,
      mimeType: 'video/mp4',
      fileSize: 100,
      duration: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'avc1',
      bitrate: 0,
      source: { type: 'url' as const, url: `https://cdn.example.com/old/${id}`, key: `k:${id}` },
    })
    const source = await newEditor()
    await source.createProject({ name: 'Old' })
    const document = {
      ...source.toDocument(),
      assets: ['kept', 'deleted', 'unknown'].map(asset),
    }
    source.dispose()

    const e = await newEditor({
      media: {
        resolve: async ({ id }) => {
          if (id === 'unknown') throw new Error('No such clip')
          return { url: `https://cdn.example.com/new/${id}` }
        },
      },
    })
    await e.loadDocument(document)
    expect(await resolveMediaUrl('kept')).toBe('https://cdn.example.com/new/kept')
    expect(await resolveMediaUrl('unknown')).toBe('')
    expect((await e.media.findMissing()).map((a) => a.id).sort()).toEqual(['deleted', 'unknown'])
    expect([...useMediaLibraryStore.getState().brokenMediaIds].sort()).toEqual([
      'deleted',
      'unknown',
    ])
  })
})
