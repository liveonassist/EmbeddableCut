// SPDX-License-Identifier: MIT

/**
 * Editor actions across the bridge. The editor page turns the actions a host
 * took (`ui.setActions`) into handlers that hand each one over as an `action`
 * event; the host page answers them with `ui.completeAction`, running the
 * editor's own behavior first if it asks (`ui.runDefaultAction`).
 */

import {
  RemoteEditor,
  type ActionDispatch,
  type BridgeActionEvent,
  type BridgeActionLabel,
  type BridgeActions,
} from '@embeddablecut/sdk'
import type {
  ActionContext,
  ActionHandler,
  EditorActions,
  ExportedFile,
  SaveTrigger,
} from '../extensions/actions.svelte'

/** A bridged action named as the host named it. */
function named<C extends ActionContext>(taken: boolean | BridgeActionLabel, run: ActionHandler<C>) {
  return typeof taken === 'object' ? { run, label: taken.label, icon: taken.icon } : run
}

/** In the editor page: handlers forwarding each action the host took. */
export function bridgedActions(actions: BridgeActions, dispatch: ActionDispatch): EditorActions {
  return {
    ...(actions.save && {
      save: named(actions.save, ({ trigger, runDefault }) =>
        dispatch('save', { trigger }, runDefault),
      ),
    }),
    ...(actions.saveAs && {
      saveAs: {
        label: actions.saveAs.label,
        icon: actions.saveAs.icon,
        run: ({ runDefault }) => dispatch('saveAs', {}, runDefault),
      },
    }),
    ...(actions.exportVideo && {
      exportVideo: named(actions.exportVideo, ({ runDefault }) =>
        dispatch('exportVideo', {}, runDefault),
      ),
    }),
    ...(actions.exportBundle && {
      exportBundle: named(actions.exportBundle, ({ runDefault }) =>
        dispatch('exportBundle', {}, runDefault),
      ),
    }),
    ...(actions.deliver && {
      deliver: named(actions.deliver, ({ file, runDefault }) =>
        dispatch('deliver', { file: file.blob, subtitles: file.subtitles }, runDefault),
      ),
    }),
    ...(actions.help && {
      help: named(actions.help, ({ runDefault }) => dispatch('help', {}, runDefault)),
    }),
  }
}

export interface FrameActionContext {
  editor: RemoteEditor
  /** Runs what the editor does without a handler, in the frame. */
  runDefault(): Promise<void>
}

export type FrameActionHandler<C extends FrameActionContext = FrameActionContext> = (
  context: C,
) => void | Promise<void>

/** `NamedAction` in a frame: `icon` is a Lucide icon's name, since components can't cross to it. */
export interface FrameNamedAction<C extends FrameActionContext = FrameActionContext> {
  run: FrameActionHandler<C>
  label?: string
  icon?: string
}

export type FrameHostAction<C extends FrameActionContext = FrameActionContext> =
  | FrameActionHandler<C>
  | FrameNamedAction<C>

/** `EditorActions` for an editor in a frame: the same actions, driven over the bridge. */
export interface FrameActions {
  save?: FrameHostAction<FrameActionContext & { trigger: SaveTrigger }>
  saveAs?: FrameNamedAction & { label: string }
  exportVideo?: FrameHostAction
  exportBundle?: FrameHostAction
  deliver?: FrameHostAction<FrameActionContext & { file: ExportedFile }>
  help?: FrameHostAction
}

function frameHandler<C extends FrameActionContext>(action: FrameHostAction<C>) {
  return typeof action === 'function' ? action : action.run
}

/** `true` for a handler alone, what to call it for a named one. */
function taken(action: FrameHostAction<never>): true | BridgeActionLabel {
  return typeof action === 'function' ? true : { label: action.label, icon: action.icon }
}

export function toBridgeActions(actions: FrameActions): BridgeActions {
  return {
    ...(actions.save && { save: taken(actions.save) }),
    ...(actions.saveAs && { saveAs: { label: actions.saveAs.label, icon: actions.saveAs.icon } }),
    ...(actions.exportVideo && { exportVideo: taken(actions.exportVideo) }),
    ...(actions.exportBundle && { exportBundle: taken(actions.exportBundle) }),
    ...(actions.deliver && { deliver: taken(actions.deliver) }),
    ...(actions.help && { help: taken(actions.help) }),
  }
}

/** In the host page: answers the frame's `action` events with the handlers `actions()` returns. */
export function answerFrameActions(editor: RemoteEditor, actions: () => FrameActions): () => void {
  return editor.on('action', (payload) => {
    const { id, action, trigger, file } = payload as BridgeActionEvent
    const runDefault = async () => {
      await editor.call('ui.runDefaultAction', { id })
    }
    const context = { editor, runDefault }
    const current = actions()
    const run = async () => {
      switch (action) {
        case 'save':
          return current.save
            ? frameHandler(current.save)({ ...context, trigger: trigger as SaveTrigger })
            : runDefault()
        case 'deliver': {
          if (!current.deliver || !file) return runDefault()
          const delivered: ExportedFile = {
            blob: RemoteEditor.toBlob(file),
            mimeType: file.mimeType,
            ...(file.subtitles && { subtitles: file.subtitles }),
          }
          return frameHandler(current.deliver)({ ...context, file: delivered })
        }
        case 'saveAs':
          return current.saveAs ? current.saveAs.run(context) : runDefault()
        default: {
          const handler = current[action]
          return handler ? frameHandler(handler)(context) : runDefault()
        }
      }
    }
    void run()
      .then(
        () => editor.call('ui.completeAction', { id }),
        (error: unknown) =>
          editor.call('ui.completeAction', {
            id,
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      // The frame went away meanwhile: nothing is left waiting.
      .catch(() => {})
  })
}
