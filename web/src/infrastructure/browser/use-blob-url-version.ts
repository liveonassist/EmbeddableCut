// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'

/** Re-renders when any blob URL is acquired, released or invalidated. */
export function useBlobUrlVersion(): number {
  return useSyncExternalStore(blobUrlManager.subscribe, blobUrlManager.getSnapshot)
}
