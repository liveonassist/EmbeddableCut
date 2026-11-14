// SPDX-License-Identifier: MIT

/** Why an editor call failed. Stable: hosts switch on these. */
export type EditorErrorCode =
  /** Another editor is live in this page; dispose it, or mount editors in iframes. */
  | 'EDITOR_ACTIVE'
  /** The editor was disposed. */
  | 'EDITOR_DISPOSED'
  /** The call needs a loaded project. */
  | 'NO_PROJECT'
  /** The document uses an effect, transition or media provider no installed extension provides. */
  | 'EXTENSION_MISSING'
  /** An extension tried to register something another already has. */
  | 'EXTENSION_CONFLICT'
  /** The host turned this kind of media source off. */
  | 'MEDIA_SOURCE_DISABLED'
  /** Importing local files needs a workspace folder. */
  | 'WORKSPACE_REQUIRED'
  /** An edit operation was refused; nothing after it ran. */
  | 'OPERATION_FAILED'

export class EditorError extends Error {
  readonly code: EditorErrorCode
  readonly details?: unknown

  constructor(code: EditorErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'EditorError'
    this.code = code
    this.details = details
  }
}
