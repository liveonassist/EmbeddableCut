// SPDX-License-Identifier: MIT

import { createSubscriber } from 'svelte/reactivity'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'

/** Re-reads when any blob URL is acquired, released or invalidated. */
export function useBlobUrlVersion(): { readonly current: number } {
  const track = createSubscriber((update) => blobUrlManager.subscribe(update))
  return {
    get current() {
      track()
      return blobUrlManager.getSnapshot()
    },
  }
}
