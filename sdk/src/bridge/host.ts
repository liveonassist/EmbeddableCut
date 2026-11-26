// SPDX-License-Identifier: MIT

import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  fromBase64,
  portTransport,
  type BinaryResult,
  type BridgeEvent,
  type BridgeMethod,
  type BridgeMethods,
  type BridgeTransport,
} from './protocol'

/** A bridge call the guest refused; `code` is the guest's error code (`EditorError`, `SchemaError`). */
export class BridgeError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.details = details
  }
}

/**
 * An editor in another page or process, driven over a bridge transport. Every
 * method is the remote `Editor`'s, made asynchronous.
 */
export class RemoteEditor {
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private readonly listeners = new Map<BridgeEvent, Set<(payload: unknown) => void>>()
  private readonly ready: Promise<void>
  private readonly stop: () => void

  constructor(private readonly transport: BridgeTransport) {
    let markReady: () => void = () => {}
    this.ready = new Promise((resolve) => {
      markReady = resolve
    })
    this.stop = transport.onMessage((message) => {
      if ('event' in message) {
        if (message.event === 'ready') markReady()
        for (const listener of this.listeners.get(message.event) ?? []) listener(message.payload)
        return
      }
      if (!('ok' in message)) return
      const call = this.pending.get(message.id)
      if (!call) return
      this.pending.delete(message.id)
      if (message.ok) call.resolve(message.result)
      else
        call.reject(
          new BridgeError(message.error.code, message.error.message, message.error.details),
        )
    })
  }

  /** Resolves once the guest says it can take calls. */
  whenReady(): Promise<void> {
    return this.ready
  }

  on(event: BridgeEvent, listener: (payload: unknown) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  async call<M extends BridgeMethod>(
    method: M,
    ...params: BridgeMethods[M]['params'] extends undefined ? [] : [BridgeMethods[M]['params']]
  ): Promise<BridgeMethods[M]['result']> {
    await this.ready
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.transport.send({
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id,
        method,
        params: params[0],
      })
    })
  }

  /** A binary result as a Blob, whichever transport carried it. */
  static toBlob(result: BinaryResult): Blob {
    if (typeof result.data !== 'string') return result.data
    return new Blob([fromBase64(result.data)], { type: result.mimeType })
  }

  close(): void {
    this.stop()
    for (const call of this.pending.values())
      call.reject(new BridgeError('CLOSED', 'The bridge closed'))
    this.pending.clear()
    this.transport.close?.()
  }
}

/**
 * Connects to an editor page in `frame`, which serves the bridge with
 * `acceptFrameConnection`. Call it before or right after the frame is added:
 * the port goes over on the guest's `hello` or the frame's `load`, whichever
 * comes first, and only to `origin`.
 */
export function connectToFrame(frame: HTMLIFrameElement, origin: string): Promise<RemoteEditor> {
  const channel = new MessageChannel()
  const remote = new RemoteEditor(portTransport(channel.port1))
  let sent = false
  const connect = () => {
    if (sent || !frame.contentWindow) return
    sent = true
    window.removeEventListener('message', onHello)
    frame.contentWindow.postMessage(
      { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, type: 'connect' },
      origin,
      [channel.port2],
    )
  }
  const onHello = (event: MessageEvent) => {
    const message = event.data as { protocol?: string; type?: string } | undefined
    if (
      event.source === frame.contentWindow &&
      message?.protocol === BRIDGE_PROTOCOL &&
      message.type === 'hello'
    ) {
      connect()
    }
  }
  window.addEventListener('message', onHello)
  frame.addEventListener('load', connect, { once: true })
  return remote.whenReady().then(() => remote)
}
