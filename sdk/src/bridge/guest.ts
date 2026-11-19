// SPDX-License-Identifier: MIT

import { SCHEMA_VERSIONS } from '@embeddablecut/engine/schema/index'
import type { Editor, ExportRequest, FrameRequest } from '../editor'
import { EditorError } from '../errors'
import { SDK_VERSION } from '../version'
import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  isBridgeMessage,
  portTransport,
  toBase64,
  type BinaryResult,
  type BridgeActionEvent,
  type BridgeActionName,
  type BridgeActions,
  type BridgeEvent,
  type BridgeMethod,
  type BridgeMethods,
  type BridgeRequest,
  type BridgeTransport,
} from './protocol'

type Handlers = {
  [M in BridgeMethod]: (
    params: BridgeMethods[M]['params'],
  ) => Promise<BridgeMethods[M]['result']> | BridgeMethods[M]['result']
}

/**
 * Hands an action to the host and resolves when the host completes it;
 * `runDefault` is what `ui.runDefaultAction` runs meanwhile.
 */
export type ActionDispatch = (
  action: BridgeActionName,
  payload: { trigger?: string; file?: Blob; subtitles?: { fileName: string; content: string } },
  runDefault: () => Promise<void>,
) => Promise<void>

export interface ServeBridgeOptions {
  /** Applies `ui.setTheme`; without it the method fails with `UNSUPPORTED`. */
  setTheme?: (theme: string | Record<string, string>) => void
  /** Applies `ui.setFeatures`; without it the method fails. */
  setFeatures?: (features: Record<string, boolean | 'locked'>) => void
  /** Applies `ui.setActions`, routing each action the host took to `dispatch`; without it the method fails. */
  setActions?: (actions: BridgeActions, dispatch: ActionDispatch) => void
}

/**
 * Serves `editor` to a host over `transport`, until the returned function
 * stops it. Sends `ready` first, then the editor's events as they happen.
 */
export function serveBridge(
  editor: Editor,
  transport: BridgeTransport,
  options: ServeBridgeOptions = {},
): () => void {
  const binary = async (
    blob: Blob,
    fileName?: string,
  ): Promise<BinaryResult & { transfer?: ArrayBuffer }> => {
    const buffer = await blob.arrayBuffer()
    return transport.textOnly
      ? {
          mimeType: blob.type,
          ...(fileName ? { fileName } : {}),
          data: toBase64(buffer),
          encoding: 'base64',
        }
      : { mimeType: blob.type, ...(fileName ? { fileName } : {}), data: buffer, transfer: buffer }
  }

  let tookActions = false
  let nextActionId = 1
  const waitingActions = new Map<
    number,
    { runDefault: () => Promise<void>; resolve: () => void; reject: (error: Error) => void }
  >()
  const dispatch: ActionDispatch = async (action, { file, subtitles, trigger }, runDefault) => {
    const id = nextActionId++
    const done = new Promise<void>((resolve, reject) => {
      waitingActions.set(id, { runDefault, resolve, reject })
    })
    const encoded = file ? await binary(file) : null
    const transfer = encoded?.transfer
    if (encoded) delete encoded.transfer
    const payload: BridgeActionEvent = {
      id,
      action,
      ...(trigger ? { trigger } : {}),
      ...(encoded ? { file: { ...encoded, ...(subtitles ? { subtitles } : {}) } } : {}),
    }
    transport.send(
      { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, event: 'action', payload },
      transfer ? [transfer] : [],
    )
    return done
  }
  const waitingAction = (id: number) => {
    const waiting = waitingActions.get(id)
    if (!waiting) throw new EditorError('OPERATION_FAILED', `No action ${id} is waiting`)
    return waiting
  }

  const handlers: Handlers = {
    'editor.describe': () => ({
      sdkVersion: SDK_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      schemaVersions: { ...SCHEMA_VERSIONS },
      operations: editor.operations,
    }),
    'project.create': (params) => editor.createProject(params),
    'project.load': async ({ document }) => {
      const { project, migrated, warnings } = await editor.loadDocument(document)
      return { project, migrated, warnings }
    },
    'project.open': ({ projectId, allowUpgrade }) =>
      editor.openProject(projectId, { allowUpgrade }),
    'project.toDocument': () => editor.toDocument(),
    'project.save': async () => {
      await editor.save()
      return null
    },
    'project.close': () => {
      editor.closeProject()
      return null
    },
    'timeline.apply': ({ operations }) => editor.apply(operations),
    'timeline.undo': () => {
      editor.undo()
      return null
    },
    'timeline.redo': () => {
      editor.redo()
      return null
    },
    'timeline.get': () => editor.timeline,
    'playback.play': () => {
      editor.play()
      return null
    },
    'playback.pause': () => {
      editor.pause()
      return null
    },
    'playback.seek': ({ frame }) => {
      editor.seek(frame)
      return null
    },
    'playback.state': () => ({ frame: editor.frame, playing: editor.playing }),
    'media.list': () => editor.media.list(),
    'media.addUrl': (params) => editor.media.addUrl(params),
    'render.frame': async (params) => binary(await editor.renderFrame(params as FrameRequest)),
    'render.export': async ({ settings, inFrame, outFrame }) => {
      const result = await editor.export({
        settings: settings as ExportRequest['settings'],
        inFrame,
        outFrame,
      })
      return {
        ...(await binary(result.blob, result.fileName)),
        durationSeconds: result.durationSeconds,
        settings: result.settings,
        warnings: result.warnings,
      }
    },
    'settings.setPolicy': ({ policy }) => {
      editor.setSettingsPolicy(policy as Parameters<Editor['setSettingsPolicy']>[0])
      return null
    },
    'ui.setFeatures': ({ features }) => {
      if (!options.setFeatures)
        throw new EditorError('OPERATION_FAILED', 'This editor has no UI to configure')
      options.setFeatures(features)
      return null
    },
    'ui.setTheme': ({ theme }) => {
      if (!options.setTheme)
        throw new EditorError('OPERATION_FAILED', 'This editor has no UI to theme')
      options.setTheme(theme)
      return null
    },
    'ui.setActions': ({ actions }) => {
      if (!options.setActions)
        throw new EditorError('OPERATION_FAILED', 'This editor has no UI to take actions from')
      options.setActions(actions, dispatch)
      tookActions = true
      return null
    },
    'ui.runDefaultAction': async ({ id }) => {
      await waitingAction(id).runDefault()
      return null
    },
    'ui.completeAction': ({ id, error }) => {
      const waiting = waitingAction(id)
      waitingActions.delete(id)
      if (error === undefined) waiting.resolve()
      else waiting.reject(new Error(error))
      return null
    },
  }

  const emit = (event: BridgeEvent, payload?: unknown) =>
    transport.send({ protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, event, payload })

  const handle = async (request: BridgeRequest) => {
    const reply = { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, id: request.id } as const
    if (request.version !== BRIDGE_VERSION) {
      transport.send({
        ...reply,
        ok: false,
        error: { code: 'BRIDGE_VERSION', message: `This editor speaks bridge v${BRIDGE_VERSION}` },
      })
      return
    }
    const handler = Object.hasOwn(handlers, request.method)
      ? (handlers[request.method] as (params: unknown) => unknown)
      : null
    if (!handler) {
      transport.send({
        ...reply,
        ok: false,
        error: { code: 'UNKNOWN_METHOD', message: `No method ${request.method}` },
      })
      return
    }
    try {
      const result = (await handler(request.params)) as { transfer?: ArrayBuffer } | null
      const transfer =
        result && typeof result === 'object' && result.transfer ? [result.transfer] : []
      if (result && typeof result === 'object' && 'transfer' in result) delete result.transfer
      transport.send({ ...reply, ok: true, result: result ?? null }, transfer)
    } catch (error) {
      const code = (error as { code?: unknown }).code
      transport.send({
        ...reply,
        ok: false,
        error: {
          code: typeof code === 'string' ? code : 'ERROR',
          message: error instanceof Error ? error.message : String(error),
          ...((error as { details?: unknown }).details === undefined
            ? {}
            : { details: (error as { details?: unknown }).details }),
          ...((error as { issues?: unknown }).issues === undefined
            ? {}
            : { details: (error as { issues?: unknown }).issues }),
        },
      })
    }
  }

  const stop = [
    transport.onMessage((message) => {
      if ('method' in message) void handle(message)
    }),
    editor.on('project', (payload) => emit('project', payload)),
    editor.on('change', () => emit('change')),
    editor.on('playback', (payload) => emit('playback', payload)),
    editor.on('notification', (payload) => emit('notification', payload)),
  ]
  emit('ready')
  return () => {
    for (const step of stop) step()
    // Actions go back to the editor's own: no host is left to take them.
    if (tookActions) options.setActions?.({}, dispatch)
    for (const waiting of waitingActions.values())
      waiting.reject(new Error('The host disconnected'))
    waitingActions.clear()
    transport.close?.()
  }
}

/**
 * Inside an iframe: waits for the host page's `connect`, from one of
 * `allowedOrigins` (`'*'` allows any), and serves `editor` on the port it
 * brings. Call it as the page starts, before the editor exists if need be:
 * a connection that arrives early waits for `editor` to resolve. Returns a
 * function that stops listening and serving.
 */
export function acceptFrameConnection(
  editor: Editor | Promise<Editor>,
  allowedOrigins: readonly string[],
  options: ServeBridgeOptions = {},
): () => void {
  let stopServing: (() => void) | null = null
  let stopped = false
  const onMessage = (event: MessageEvent) => {
    const message = event.data as { type?: string } | undefined
    if (!isBridgeMessage(message) || message.type !== 'connect') return
    if (!allowedOrigins.includes('*') && !allowedOrigins.includes(event.origin)) return
    const port = event.ports[0]
    if (!port) return
    stopServing?.()
    void Promise.resolve(editor).then((ready) => {
      if (!stopped) stopServing = serveBridge(ready, portTransport(port), options)
    })
  }
  window.addEventListener('message', onMessage)
  // Tell a host that's already listening; one that isn't connects on `load`.
  window.parent?.postMessage(
    { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, type: 'hello' },
    '*',
  )
  return () => {
    stopped = true
    window.removeEventListener('message', onMessage)
    stopServing?.()
  }
}
