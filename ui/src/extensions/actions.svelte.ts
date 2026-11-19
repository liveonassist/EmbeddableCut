// SPDX-License-Identifier: MIT

/**
 * What a host does in place of the editor's own actions: saving, exporting,
 * taking the rendered file, opening help. Each handler replaces the
 * built-in behavior wherever the editor reaches it (button, shortcut, menu,
 * auto-save) and can still run it with `runDefault()`.
 */

import { toast } from 'svelte-sonner'
import { createLogger } from '@/shared/logging/logger'
import type { IconRef, UiContext } from './contributions'

const logger = createLogger('HostActions')

/** What asked for a save. */
export type SaveTrigger =
  /** The Save button or its shortcut. */
  | 'user'
  /** The auto-save interval (the `autoSaveInterval` setting). */
  | 'auto'
  /** Leaving the editor for the app's projects page with unsaved changes. */
  | 'leave'
  /**
   * Exporting the project as a zip, which saves it first. The zip is built
   * from the workspace's copy, so `runDefault()` keeps unsaved edits in it.
   */
  | 'export'

export interface ActionContext extends UiContext {
  /** Runs what the editor does without a handler. */
  runDefault(): Promise<void>
}

export interface SaveContext extends ActionContext {
  trigger: SaveTrigger
}

/** A file the export dialog rendered. */
export interface ExportedFile {
  blob: Blob
  mimeType: string
  /** The subtitle file rendered beside it, when the export asked for a sidecar. */
  subtitles?: { fileName: string; content: string }
}

export interface DeliverContext extends ActionContext {
  file: ExportedFile
}

export type ActionHandler<C extends ActionContext = ActionContext> = (
  context: C,
) => void | Promise<void>

export interface EditorActions {
  /**
   * Saving. By default the editor writes a workspace project back to its
   * workspace, and does nothing for a project loaded from a document. The
   * unsaved-changes marker clears once the handler resolves, unless the
   * timeline changed meanwhile.
   */
  save?: ActionHandler<SaveContext>
  /** Export › Video and its shortcut. By default it opens the export dialog. */
  exportVideo?: ActionHandler
  /** Export › Project zip. By default it asks where to save the zip and writes it. */
  exportBundle?: ActionHandler
  /**
   * The export dialog's last step: `label` replaces Download, and `run` takes
   * the file. `runDefault()` downloads it.
   */
  deliver?: { label: string; icon?: IconRef; run: ActionHandler<DeliverContext> }
  /**
   * The toolbar's help button. By default it opens the user guide, which only
   * the app has: a mounted editor shows the button only with a handler.
   */
  help?: ActionHandler
}

export type ActionName = keyof EditorActions

/** The host's handlers, read reactively so the UI follows `setActions`. */
export class HostActions {
  current = $state.raw<EditorActions>({})

  constructor(actions: EditorActions = {}) {
    this.current = actions
  }

  set(actions: EditorActions): void {
    this.current = actions
  }
}

/** Runs a host handler, telling the user what it throws as the editor's own failures do. */
export async function runAction<C extends ActionContext>(
  handler: ActionHandler<C>,
  context: C,
): Promise<void> {
  try {
    await handler(context)
  } catch (error) {
    logger.error('A host action failed:', error)
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
