// SPDX-License-Identifier: MIT

/**
 * Step state machine for the export dialog: which view is showing, how long the
 * export has been running, and the preview URL of a finished render. The dialog
 * keeps the settings/session state; this hook owns only the step wiring.
 */

import type { ClientRenderResult } from '@/features/export/deps/renderer'

export type DialogView = 'settings' | 'progress' | 'complete' | 'error' | 'cancelled'

export interface ExportDialogViewOptions {
  /** Render status; the terminal statuses advance the step. */
  status: string
  /** Finished render, once there is one. */
  result: ClientRenderResult | null
  resetState: () => void
  onClose: () => void
}

export function useExportDialogView(options: () => ExportDialogViewOptions) {
  let view = $state<DialogView>('settings')
  let startTime = $state<number | null>(null)
  let elapsedSeconds = $state(0)
  let previewUrl = $state<string | null>(null)

  const status = $derived(options().status)
  const result = $derived(options().result)
  const blob = $derived(result?.blob)

  // Track elapsed time
  $effect(() => {
    if (view === 'progress' && !startTime) {
      startTime = Date.now()
    }
    if (view === 'settings') {
      startTime = null
      elapsedSeconds = 0
    }
  })

  $effect(() => {
    const started = startTime
    if (!started || view !== 'progress') return

    const interval = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - started) / 1000)
    }, 1000)

    return () => clearInterval(interval)
  })

  // Watch status changes to update view
  $effect(() => {
    if (status === 'completed') {
      view = 'complete'
    } else if (status === 'failed') {
      view = 'error'
    } else if (status === 'cancelled') {
      view = 'cancelled'
    }
  })

  // Preview blob URL for completed exports
  $effect(() => {
    if (!blob) {
      previewUrl = null
      return
    }
    const url = URL.createObjectURL(blob)
    previewUrl = url
    return () => URL.revokeObjectURL(url)
  })

  /** Back to the first step, forgetting the previous run's timing. */
  const resetView = () => {
    view = 'settings'
    startTime = null
    elapsedSeconds = 0
  }

  // Handle close
  const handleClose = () => {
    if (view === 'progress') return // Prevent closing during export
    view = 'settings'
    const { resetState, onClose } = options()
    resetState()
    onClose()
  }

  const setView = (next: DialogView) => {
    view = next
  }

  return {
    get view() {
      return view
    },
    setView,
    get elapsedSeconds() {
      return elapsedSeconds
    },
    get previewUrl() {
      return previewUrl
    },
    get isVideoResult() {
      return result?.mimeType?.startsWith('video/') ?? false
    },
    get preventClose() {
      return view === 'progress' || view === 'complete'
    },
    handleClose,
    resetView,
  }
}
