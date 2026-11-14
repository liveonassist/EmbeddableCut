// SPDX-License-Identifier: MIT

import {
  buildExternalPreviewSignature,
  resolveExternalDragPreviewEntries,
  type ExternalDragPreviewEntry,
} from '@/features/timeline/utils/drag-drop-preview'

interface UseExternalDragPreviewOptions {
  onError?: (error: unknown) => void
}

export function useExternalDragPreview(options: () => UseExternalDragPreviewOptions) {
  const externalPreviewItemsRef = { current: null } as {
    current: ExternalDragPreviewEntry[] | null
  }
  const externalPreviewSignatureRef = { current: null } as { current: string | null }
  const externalPreviewPromiseRef = { current: null } as { current: Promise<void> | null }
  const externalPreviewTokenRef = { current: 0 }
  const lastDragFrameRef = { current: 0 }

  const clearExternalPreviewSession = () => {
    externalPreviewItemsRef.current = null
    externalPreviewSignatureRef.current = null
    externalPreviewPromiseRef.current = null
    externalPreviewTokenRef.current += 1
  }

  const primeExternalPreviewEntries = (dataTransfer: DataTransfer) => {
    const signature = buildExternalPreviewSignature(dataTransfer)

    if (externalPreviewSignatureRef.current === signature && externalPreviewItemsRef.current) {
      return
    }

    if (externalPreviewSignatureRef.current === signature && externalPreviewPromiseRef.current) {
      return
    }

    clearExternalPreviewSession()
    externalPreviewSignatureRef.current = signature
    const token = externalPreviewTokenRef.current

    const previewPromise = (async () => {
      const previewEntries = await resolveExternalDragPreviewEntries(dataTransfer)
      if (!previewEntries || token !== externalPreviewTokenRef.current) {
        return
      }

      externalPreviewItemsRef.current = previewEntries
      externalPreviewPromiseRef.current = null
    })().catch((error) => {
      if (token === externalPreviewTokenRef.current) {
        externalPreviewPromiseRef.current = null
        options().onError?.(error)
      }
    })

    externalPreviewPromiseRef.current = previewPromise
  }

  return {
    clearExternalPreviewSession,
    externalPreviewItemsRef,
    lastDragFrameRef,
    primeExternalPreviewEntries,
  }
}
