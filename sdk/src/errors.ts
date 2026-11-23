// SPDX-License-Identifier: MIT

/** Why an editor call failed. Stable: hosts switch on these. */
export type EditorErrorCode =
  /** Another editor is live in this page; dispose it, or mount editors in iframes. */
  | 'EDITOR_ACTIVE'
  /** The editor was disposed. */
  | 'EDITOR_DISPOSED'
  /** The call needs a loaded project. */
  | 'NO_PROJECT'
  /** The workspace has no project with that id. */
  | 'PROJECT_NOT_FOUND'
  /** The project is from an older schema; open it with `allowUpgrade` to migrate it. */
  | 'PROJECT_NEEDS_UPGRADE'
  /** The document uses an effect, transition or media provider no installed extension provides. */
  | 'EXTENSION_MISSING'
  /** An extension tried to register something another already has. */
  | 'EXTENSION_CONFLICT'
  /** The host turned this kind of media source off. */
  | 'MEDIA_SOURCE_DISABLED'
  /** The call needs a workspace folder. */
  | 'WORKSPACE_REQUIRED'
  /** The host's accept policy refused a file; `details` has its `fileName` and `reason`. */
  | 'MEDIA_REFUSED'
  /** The project has no such media, or none of the kind the call needs. */
  | 'MEDIA_NOT_FOUND'
  /** An edit operation was refused; nothing after it ran. */
  | 'OPERATION_FAILED'
  /** An edit operation would remove items the host's guards protect; nothing after it ran. */
  | 'EDIT_REFUSED'
  /** A project setting has a value no project can have; nothing changed. */
  | 'SETTING_INVALID'
  /** The file isn't a project bundle or document, or is damaged. */
  | 'BUNDLE_INVALID'
  /** The project and its media don't fit one file. */
  | 'BUNDLE_TOO_LARGE'

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
