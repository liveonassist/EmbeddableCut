// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createEditor, type Editor } from '../editor'
import { serveBridge } from './guest'
import { BridgeError, RemoteEditor } from './host'
import { fromBase64, portTransport, stringTransport, toBase64 } from './protocol'

let editor: Editor | null = null
let stop: (() => void) | null = null

afterEach(() => {
  stop?.()
  editor?.dispose()
  editor = null
})

async function connectOverPorts(): Promise<RemoteEditor> {
  editor = await createEditor()
  const channel = new MessageChannel()
  const remote = new RemoteEditor(portTransport(channel.port2))
  stop = serveBridge(editor, portTransport(channel.port1))
  await remote.whenReady()
  return remote
}

describe('bridge', () => {
  it('drives an editor through a port', async () => {
    const remote = await connectOverPorts()
    const changes: unknown[] = []
    remote.on('change', () => changes.push(true))

    expect(await remote.call('project.create', { name: 'Remote', fps: 25 })).toMatchObject({
      name: 'Remote',
      fps: 25,
    })
    const [, text] = await remote.call('timeline.apply', {
      operations: [
        { op: 'addTrack', kind: 'video' },
        { op: 'addText', text: 'Over the bridge' },
      ],
    })
    const document = (await remote.call('project.toDocument')) as {
      project: { timeline: { items: unknown[] } }
    }

    expect(document.project.timeline.items).toEqual([
      expect.objectContaining({ id: (text!.detail as { id: string }).id, text: 'Over the bridge' }),
    ])
    expect(changes.length).toBeGreaterThan(0)
    remote.close()
  })

  it('passes the editor error codes back to the host', async () => {
    const remote = await connectOverPorts()

    const error = await remote
      .call('timeline.apply', { operations: [{ op: 'addText' }] })
      .catch((e) => e)

    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe('NO_PROJECT')
    remote.close()
  })

  it('speaks the same protocol over a string channel, as a WebView does', async () => {
    editor = await createEditor()
    const toHost = new Set<(json: string) => void>()
    const toGuest = new Set<(json: string) => void>()
    const subscribe = (set: Set<(json: string) => void>) => (listener: (json: string) => void) => {
      set.add(listener)
      return () => set.delete(listener)
    }
    const remote = new RemoteEditor(
      stringTransport((json) => toGuest.forEach((l) => l(json)), subscribe(toHost)),
    )
    stop = serveBridge(
      editor,
      stringTransport((json) => toHost.forEach((l) => l(json)), subscribe(toGuest)),
    )

    const description = await remote.call('editor.describe')

    expect(description.bridgeVersion).toBe(1)
    expect(description.operations).toContain('addClip')
  })

  it('round-trips binary results as base64', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256)

    expect(new Uint8Array(fromBase64(toBase64(bytes.buffer)))).toEqual(bytes)
    expect(
      RemoteEditor.toBlob({
        mimeType: 'image/png',
        data: toBase64(bytes.buffer),
        encoding: 'base64',
      }).size,
    ).toBe(70_000)
  })
})
