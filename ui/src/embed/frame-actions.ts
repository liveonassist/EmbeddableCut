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
  type BridgeActions,
} from '@embeddablecut/sdk'
import type { EditorActions, ExportedFile, SaveTrigger } from '../extensions/actions.svelte'

/** In the editor page: handlers forwarding each action the host took. */
export function bridgedActions(actions: BridgeActions, dispatch: ActionDispatch): EditorActions {
  return {
    ...(actions.save && {
      save: ({ trigger, runDefault }) => dispatch('save', { trigger }, runDefault),
    }),
    ...(actions.exportVideo && {
      exportVideo: ({ runDefault }) => dispatch('exportVideo', {}, runDefault),
    }),
    ...(actions.exportBundle && {
      exportBundle: ({ runDefault }) => dispatch('exportBundle', {}, runDefault),
    }),
    ...(actions.deliver && {
      deliver: {
        label: actions.deliver.label,
        icon: actions.deliver.icon,
        run: ({ file, runDefault }) =>
          dispatch('deliver', { file: file.blob, subtitles: file.subtitles }, runDefault),
      },
    }),
    ...(actions.help && { help: ({ runDefault }) => dispatch('help', {}, runDefault) }),
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

/** `EditorActions` for an editor in a frame: the same actions, driven over the bridge. */
export interface FrameActions {
  save?: FrameActionHandler<FrameActionContext & { trigger: SaveTrigger }>
  exportVideo?: FrameActionHandler
  exportBundle?: FrameActionHandler
  /** `icon` is a Lucide icon's name: components can't cross to the frame. */
  deliver?: {
    label: string
    icon?: string
    run: FrameActionHandler<FrameActionContext & { file: ExportedFile }>
  }
  help?: FrameActionHandler
}

export function toBridgeActions(actions: FrameActions): BridgeActions {
  return {
    ...(actions.save && { save: true }),
    ...(actions.exportVideo && { exportVideo: true }),
    ...(actions.exportBundle && { exportBundle: true }),
    ...(actions.deliver && {
      deliver: { label: actions.deliver.label, icon: actions.deliver.icon },
    }),
    ...(actions.help && { help: true }),
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
            ? current.save({ ...context, trigger: trigger as SaveTrigger })
            : runDefault()
        case 'deliver': {
          if (!current.deliver || !file) return runDefault()
          const delivered: ExportedFile = {
            blob: RemoteEditor.toBlob(file),
            mimeType: file.mimeType,
            ...(file.subtitles && { subtitles: file.subtitles }),
          }
          return current.deliver.run({ ...context, file: delivered })
        }
        default: {
          const handler = current[action]
          return handler ? handler(context) : runDefault()
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
