// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { useSyncExternalStore } from '../../runtime/use-sync-external-store.svelte'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'

/** Re-runs its readers when any blob URL is acquired, released or invalidated. */
export function useBlobUrlVersion(): { readonly current: number } {
  return useSyncExternalStore(
    () => blobUrlManager.subscribe,
    () => blobUrlManager.getSnapshot(),
  )
}
