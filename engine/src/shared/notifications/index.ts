// SPDX-License-Identifier: MIT

/**
 * User-facing notices the engine raises while editing ("Cannot split inside a
 * transition zone"). The engine has no toaster: whoever presents the editor
 * subscribes and shows them, as the app does through sonner and an SDK host
 * may through its own UI.
 */

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface EngineNotification {
  level: NotificationLevel
  message: string
}

type Listener = (notification: EngineNotification) => void

const listeners = new Set<Listener>()

/** Calls `listener` for every notice from now on; returns the unsubscribe. */
export function onNotification(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(level: NotificationLevel, message: string): void {
  for (const listener of listeners) listener({ level, message })
}

/** sonner's call shape, so engine code reads as it did when it toasted directly. */
export const toast = {
  info: (message: string) => notify('info', message),
  success: (message: string) => notify('success', message),
  warning: (message: string) => notify('warning', message),
  error: (message: string) => notify('error', message),
}
