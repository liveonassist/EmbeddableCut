// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { useMarkersStore } from '@/features/timeline/stores/markers-store'
import { setInPoint, setOutPoint } from '@/features/timeline/stores/timeline-actions'

/**
 * Subscribes to the in/out render-range points and their setters.
 * Shared by the timeline header and ruler markers so the store
 * subscription shape stays identical everywhere.
 */
export function useInOutPoints() {
  const inPoint = select(useMarkersStore, (s) => s.inPoint)
  const outPoint = select(useMarkersStore, (s) => s.outPoint)
  return {
    get inPoint() {
      return inPoint.current
    },
    get outPoint() {
      return outPoint.current
    },
    setInPoint,
    setOutPoint,
  }
}
