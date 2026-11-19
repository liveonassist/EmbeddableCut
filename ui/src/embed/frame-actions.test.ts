// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  RemoteEditor,
  createEditor,
  portTransport,
  serveBridge,
  type Editor,
} from '@embeddablecut/sdk'
import type { EditorActions, ExportedFile } from '../extensions/actions.svelte'
import {
  answerFrameActions,
  bridgedActions,
  toBridgeActions,
  type FrameActions,
} from './frame-actions'

let editor: Editor | null = null

afterEach(() => {
  editor?.dispose()
  editor = null
})

describe('frame actions', () => {
  it('hands the actions a host took across the bridge, and gives them back when it leaves', async () => {
    editor = await createEditor()
    const channel = new MessageChannel()
    const remote = new RemoteEditor(portTransport(channel.port2))
    let installed: EditorActions = {}
    const stopServing = serveBridge(editor, portTransport(channel.port1), {
      setActions: (actions, dispatch) => {
        installed = bridgedActions(actions, dispatch)
      },
    })
    await remote.whenReady()
    const triggers: string[] = []
    let delivered: ExportedFile | null = null
    const hostActions: FrameActions = {
      save: async ({ trigger, runDefault }) => {
        triggers.push(trigger)
        await runDefault()
      },
      deliver: {
        label: 'Publish',
        run: ({ file }) => {
          delivered = file
          throw new Error('The upload failed')
        },
      },
    }
    const stopAnswering = answerFrameActions(remote, () => hostActions)
    await remote.call('ui.setActions', { actions: toBridgeActions(hostActions) })

    expect(installed.exportVideo).toBeUndefined()
    expect(installed.deliver?.label).toBe('Publish')

    const saveToWorkspace = vi.fn(async () => {})
    await installed.save!({ editor, trigger: 'auto', runDefault: saveToWorkspace })
    expect(triggers).toEqual(['auto'])
    expect(saveToWorkspace).toHaveBeenCalledTimes(1)

    // jsdom's Blob can't be read; the bridge reads the file to send it.
    const blob = new NodeBlob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' })
    await expect(
      installed.deliver!.run({
        editor,
        file: { blob: blob as unknown as Blob, mimeType: 'video/mp4' },
        runDefault: async () => {},
      }),
    ).rejects.toThrow('The upload failed')
    expect(delivered!.blob.size).toBe(3)
    expect(delivered!.mimeType).toBe('video/mp4')

    stopAnswering()
    stopServing()
    expect(installed).toEqual({})
    remote.close()
  })
})
