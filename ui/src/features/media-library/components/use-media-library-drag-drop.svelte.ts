// SPDX-License-Identifier: MIT

import {
  extractValidMediaFileEntriesFromDataTransfer,
  formatMediaDropRejectionMessage,
} from '@/features/media-library/utils/file-drop'
import type { MediaLibraryNotification } from '@/features/media-library/types'
import { t } from '$lib/i18n.svelte'

interface UseMediaLibraryDragDropParams {
  showNotification: (notification: MediaLibraryNotification) => void
  importHandles: (handles: FileSystemFileHandle[]) => Promise<void>
  /** False when the host turned local media off: files dropped on the panel are ignored. */
  enabled?: boolean
}

/**
 * Panel-level drag/drop handling for importing media files. Uses an enter/leave
 * counter so the drop overlay doesn't flicker when dragging over child elements,
 * ignores in-app media/composition drags, and routes valid file handles to the
 * import path.
 */
export function useMediaLibraryDragDrop(params: () => UseMediaLibraryDragDropParams) {
  let isDragging = $state(false)
  let dragCounter = 0

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (params().enabled === false) return
    dragCounter++
    if (dragCounter === 1 && !e.dataTransfer?.types.includes('application/json')) {
      isDragging = true
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.dataTransfer) return
    e.dataTransfer.dropEffect = params().enabled === false ? 'none' : 'copy'
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      isDragging = false
    }
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter = 0
    isDragging = false
    const { enabled, showNotification, importHandles } = params()
    if (enabled === false || !e.dataTransfer) return

    // Ignore media items being dragged from the grid itself
    try {
      const jsonData = e.dataTransfer.getData('application/json')
      if (jsonData) {
        const data = JSON.parse(jsonData)
        if (
          data.type === 'media-item' ||
          data.type === 'media-items' ||
          data.type === 'composition'
        ) {
          return
        }
      }
    } catch {
      // Not JSON data, continue with file handling
    }

    const { supported, entries, errors } = await extractValidMediaFileEntriesFromDataTransfer(
      e.dataTransfer,
    )
    if (!supported) {
      showNotification({
        type: 'warning',
        message: t('media.library.dragDropUnsupported'),
      })
      return
    }

    if (errors.length > 0) {
      showNotification({
        type: 'error',
        message: formatMediaDropRejectionMessage(errors),
      })
    }
    if (entries.length > 0) {
      await importHandles(entries.map((entry) => entry.handle))
    }
  }

  return {
    get isDragging() {
      return isDragging
    },
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
