// SPDX-License-Identifier: MIT

/**
 * The bridge protocol: an `Editor` driven from outside its page. An iframe's
 * host page speaks it over a `MessagePort`; a native shell (Flutter's
 * WebView) speaks the same JSON over a string channel. docs/BRIDGE.md is the
 * reference other implementations follow.
 *
 * Versioned on its own: `BRIDGE_VERSION` changes when a message's shape does,
 * not when the SDK's does.
 */

export const BRIDGE_PROTOCOL = 'embeddablecut.bridge'
export const BRIDGE_VERSION = 1

/** Every method a host can call, and what it takes and returns. */
export interface BridgeMethods {
  /** Versions and capabilities, so a host can check what it's talking to. */
  'editor.describe': {
    params: undefined
    result: {
      sdkVersion: string
      bridgeVersion: number
      schemaVersions: Record<string, unknown>
      operations: string[]
    }
  }
  'project.create': {
    params: {
      name: string
      width?: number
      height?: number
      fps?: number
      backgroundColor?: string
    }
    result: ProjectSummary
  }
  /** A project document, as JSON. */
  'project.load': {
    params: { document: unknown }
    result: { project: ProjectSummary; migrated: boolean; warnings: unknown[] }
  }
  'project.open': { params: { projectId: string; allowUpgrade?: boolean }; result: ProjectSummary }
  'project.toDocument': { params: undefined; result: unknown }
  'project.save': { params: undefined; result: null }
  'project.close': { params: undefined; result: null }
  'timeline.apply': {
    params: { operations: Array<Record<string, unknown> & { op: string }> }
    result: Array<{ op: string; callerId?: string; detail?: unknown }>
  }
  'timeline.undo': { params: undefined; result: null }
  'timeline.redo': { params: undefined; result: null }
  'timeline.get': { params: undefined; result: unknown }
  'playback.play': { params: undefined; result: null }
  'playback.pause': { params: undefined; result: null }
  'playback.seek': { params: { frame: number }; result: null }
  'playback.state': { params: undefined; result: { frame: number; playing: boolean } }
  'media.list': { params: undefined; result: unknown[] }
  'media.addUrl': {
    params: { url: string; fileName?: string; mimeType?: string; key?: string; expiresAt?: number }
    result: unknown
  }
  'render.frame': {
    params: {
      frame?: number
      atSeconds?: number
      width?: number
      height?: number
      format?: string
      quality?: number
    }
    result: BinaryResult
  }
  'render.export': {
    params: { settings?: Record<string, unknown>; inFrame?: number; outFrame?: number }
    result: BinaryResult & { durationSeconds: number; settings: unknown; warnings: unknown[] }
  }
  /** Replaces the editor's settings policy (`EditorOptions.settings`); `null` removes it. */
  'settings.setPolicy': {
    params: {
      policy: { values?: Record<string, unknown>; locked?: string[]; hidden?: string[] } | null
    }
    result: null
  }
  /** Editor UI only: switch the theme by preset name, or override tokens. */
  'ui.setTheme': { params: { theme: string | Record<string, string> }; result: null }
  /** Editor UI only: hide (`false`) or lock (`'locked'`) built-in features by id; replaces the last set. */
  'ui.setFeatures': { params: { features: Record<string, boolean | 'locked'> }; result: null }
  /**
   * Editor UI only: the actions the host takes over, replacing the last set.
   * Each then reaches the host as an `action` event, and waits for its
   * `ui.completeAction`.
   */
  'ui.setActions': { params: { actions: BridgeActions }; result: null }
  /** Runs the editor's own behavior for a waiting action, as `runDefault()` does in the page. */
  'ui.runDefaultAction': { params: { id: number }; result: null }
  /** Ends a waiting action; an `error` is shown to the user as its failure. */
  'ui.completeAction': { params: { id: number; error?: string }; result: null }
}

/** The editor actions a host takes over (`EditorActions` in the UI), by name. */
export interface BridgeActions {
  save?: boolean
  exportVideo?: boolean
  exportBundle?: boolean
  /** Replaces the export dialog's Download with `label` (and a Lucide `icon` name). */
  deliver?: { label: string; icon?: string }
  help?: boolean
}

export type BridgeActionName = keyof BridgeActions

/** The payload of an `action` event. */
export interface BridgeActionEvent {
  /** Names the action in `ui.runDefaultAction` and `ui.completeAction`. */
  id: number
  action: BridgeActionName
  /** `save`'s: `user`, `auto`, `leave` or `export`. */
  trigger?: string
  /** `deliver`'s: the rendered file. */
  file?: BinaryResult & { subtitles?: { fileName: string; content: string } }
}

export type BridgeMethod = keyof BridgeMethods

export interface ProjectSummary {
  id: string
  name: string
  width: number
  height: number
  fps: number
}

/**
 * Bytes a method returns. Over a `MessagePort` `data` is an `ArrayBuffer`,
 * transferred; over a string channel it's base64 and `encoding` says so.
 */
export interface BinaryResult {
  mimeType: string
  fileName?: string
  data: ArrayBuffer | string
  encoding?: 'base64'
}

/**
 * Events the guest sends unasked: the editor's own, `ready` once it can take
 * calls, and `action` for an action the host took over.
 */
export type BridgeEvent = 'ready' | 'project' | 'change' | 'playback' | 'notification' | 'action'

interface Envelope {
  protocol: typeof BRIDGE_PROTOCOL
  version: number
}

export interface BridgeRequest extends Envelope {
  id: number
  method: BridgeMethod
  params?: unknown
}

export type BridgeResponse = Envelope & { id: number } & (
    | { ok: true; result: unknown }
    | { ok: false; error: { code: string; message: string; details?: unknown } }
  )

export interface BridgeEventMessage extends Envelope {
  event: BridgeEvent
  payload?: unknown
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEventMessage

/** Sends and receives bridge messages; a port carries objects, a string channel JSON. */
export interface BridgeTransport {
  /** Whether `data` in binary results must be base64 (true for string channels). */
  readonly textOnly: boolean
  send(message: BridgeMessage, transfer?: Transferable[]): void
  onMessage(listener: (message: BridgeMessage) => void): () => void
  close?(): void
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Envelope).protocol === BRIDGE_PROTOCOL &&
    typeof (value as Envelope).version === 'number'
  )
}

/** A transport over a `MessagePort`: structured clone, transferable buffers. */
export function portTransport(port: MessagePort): BridgeTransport {
  port.start()
  return {
    textOnly: false,
    send: (message, transfer = []) => port.postMessage(message, transfer),
    onMessage(listener) {
      const handle = (event: MessageEvent) => {
        if (isBridgeMessage(event.data)) listener(event.data)
      }
      port.addEventListener('message', handle)
      return () => port.removeEventListener('message', handle)
    },
    close: () => port.close(),
  }
}

/**
 * A transport over strings: what a WebView offers. `post` hands a JSON
 * string to the host (a Flutter `JavaScriptChannel`'s `postMessage`);
 * `subscribe` registers for the strings the host injects.
 */
export function stringTransport(
  post: (json: string) => void,
  subscribe: (listener: (json: string) => void) => () => void,
): BridgeTransport {
  return {
    textOnly: true,
    send: (message) => post(JSON.stringify(message)),
    onMessage(listener) {
      return subscribe((json) => {
        try {
          const message: unknown = JSON.parse(json)
          if (isBridgeMessage(message)) listener(message)
        } catch {
          // Not ours.
        }
      })
    },
  }
}

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
