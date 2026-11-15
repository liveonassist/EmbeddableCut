// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const processMedia = vi.hoisted(() => vi.fn())

vi.mock('@embeddablecut/engine/features/media-library/services/media-processor-service', () => ({
  mediaProcessorService: {
    processMedia,
    hasUnsupportedAudioCodec: () => ({ unsupported: false }),
  },
}))

import { createEditor, type Editor } from './editor'
import { EditorError } from './errors'

let editor: Editor | null = null

beforeEach(() => {
  processMedia.mockResolvedValue({
    metadata: {
      type: 'video',
      duration: 12,
      width: 1080,
      height: 1920,
      fps: 30,
      codec: 'avc1.64001f',
      bitrate: 4000,
    },
    thumbnail: null,
  })
})

afterEach(() => {
  editor?.dispose()
  editor = null
})

const clip = () => new File([new Uint8Array(64)], 'reaction.mp4', { type: 'video/mp4' })

describe('deferred uploads', () => {
  it('keeps added files pending in memory until the host swaps in their URL', async () => {
    editor = await createEditor()
    await editor.createProject({ name: 'Short', width: 1080, height: 1920, fps: 30 })
    const file = clip()
    const [asset] = await editor.media.addFiles([file])
    editor.apply([
      { op: 'addTrack', kind: 'video' },
      { op: 'addClip', mediaId: asset!.id },
    ])
    const items = editor.timeline.items

    expect(editor.toDocument().assets).toEqual([
      expect.objectContaining({ id: asset!.id, duration: 12, source: { type: 'memory' } }),
    ])
    expect(editor.media.pending().map((pending) => pending.id)).toEqual([asset!.id])
    expect(await editor.media.read(asset!.id)).toBe(file)

    await editor.media.replaceWithUrl(asset!.id, {
      url: 'https://cdn.example.com/uploads/reaction.mp4',
      key: 'assist:upload-7',
    })

    const document = editor.toDocument()
    expect(document.assets).toEqual([
      expect.objectContaining({
        id: asset!.id,
        duration: 12,
        source: {
          type: 'url',
          url: 'https://cdn.example.com/uploads/reaction.mp4',
          key: 'assist:upload-7',
        },
      }),
    ])
    expect(document.project.timeline?.items).toEqual(items)
    expect(editor.media.pending()).toEqual([])
    expect(processMedia).toHaveBeenCalledOnce()
  })

  it("refuses files the host's policy refuses, with its reason", async () => {
    editor = await createEditor({
      media: {
        accept: ({ duration }) => duration <= 10 || 'Clips can be at most 10 seconds.',
      },
    })
    await editor.createProject({ name: 'Short' })

    const refusal = await editor.media.addFiles([clip()]).catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(EditorError)
    expect(refusal).toMatchObject({
      code: 'MEDIA_REFUSED',
      details: { fileName: 'reaction.mp4', reason: 'Clips can be at most 10 seconds.' },
    })
    expect(editor.media.list()).toEqual([])
  })
})
