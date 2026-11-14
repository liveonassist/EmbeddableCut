// SPDX-License-Identifier: MIT

/**
 * Live pixel geometry sync for the linked Edit timeline axis.
 * The dopesheet pans on the compositor while the main timeline scrolls, so the
 * keyframe surfaces are rewritten straight to DOM through a rAF-throttled
 * scroll listener instead of a re-render. Nodes the editor adds or re-frames
 * since the last sync (drag previews, newly revealed rows) are brought onto the
 * same axis before paint: FreeCut re-applied the sync after every React
 * render; here a MutationObserver on the geometry hooks does it in the same
 * microtask the DOM changed in.
 */

import { untrack } from 'svelte'
import { TIMELINE_LIVE_SCROLL_EVENT } from '@/shared/timeline/live-scroll-sync'
import type { Ref } from '../ref-state.svelte'
import { syncDopesheetLivePixelGeometry } from './dopesheet-live-pixel-geometry'

const GEOMETRY_ATTRIBUTES = [
  'data-dopesheet-frame',
  'data-dopesheet-from-frame',
  'data-dopesheet-to-frame',
  'data-dopesheet-relative-frame',
  'data-motion-grid-frames',
]

export interface UseLivePixelGeometrySyncOptions {
  /** Mirror the last sync into the dragging/marquee DOM writers. */
  syncLivePixelGeometryRef: Ref<() => void>
  /** Editor root carrying the `data-dopesheet-live-*` geometry hooks. */
  rootRef: Ref<HTMLDivElement | null>
  timelineScrollContainerRef?: Ref<HTMLElement | null>
  getTimelineLivePixelsPerSecond?: () => number
  timelinePanBaseScrollLeft?: number
  timelinePanBasePixelsPerSecond?: number
  /** Fallback scale when the linked timeline exposes no live reader. */
  timelinePixelsPerSecond: number
  fps: number
  itemFrom: number
  hasLinkedTimelineAxis: boolean
  /**
   * Values whose change re-renders geometry the observer can't see (inline
   * `left`/`width` the cells recompute from the viewport): the editor passes
   * the sheet mappers here, and the sync re-applies after they change.
   */
  resyncDependencies?: readonly unknown[]
}

/** Keeps the sheet's DOM geometry on the linked timeline's live scroll axis. */
export function useLivePixelGeometrySync(options: () => UseLivePixelGeometrySyncOptions): void {
  const syncLivePixelGeometryRef = $derived(options().syncLivePixelGeometryRef)
  const rootRef = $derived(options().rootRef)
  const timelineScrollContainerRef = $derived(options().timelineScrollContainerRef)
  const getTimelineLivePixelsPerSecond = $derived(options().getTimelineLivePixelsPerSecond)
  const timelinePanBaseScrollLeft = $derived(options().timelinePanBaseScrollLeft)
  const timelinePanBasePixelsPerSecond = $derived(options().timelinePanBasePixelsPerSecond)
  const timelinePixelsPerSecond = $derived(options().timelinePixelsPerSecond)
  const fps = $derived(options().fps)
  const itemFrom = $derived(options().itemFrom)
  const hasLinkedTimelineAxis = $derived(options().hasLinkedTimelineAxis)

  $effect.pre(() => {
    const syncRef = syncLivePixelGeometryRef
    const scrollContainer = timelineScrollContainerRef?.current
    const root = rootRef.current
    const baseScrollLeft = timelinePanBaseScrollLeft
    const getLivePixelsPerSecond = getTimelineLivePixelsPerSecond
    const basePixelsPerSecond = timelinePanBasePixelsPerSecond
    const fallbackPixelsPerSecond = timelinePixelsPerSecond
    const framesPerSecond = fps
    const from = itemFrom
    const linked = hasLinkedTimelineAxis
    if (!scrollContainer || !root || baseScrollLeft === undefined) {
      syncRef.current = () => {}
      return
    }

    let scrollFrame: number | null = null
    let observer: MutationObserver | null = null
    const syncLiveGeometry = () => {
      const pixelsPerSecond =
        getLivePixelsPerSecond?.() ?? basePixelsPerSecond ?? fallbackPixelsPerSecond
      syncDopesheetLivePixelGeometry({
        root,
        pixelsPerSecond,
        fps: framesPerSecond,
        scrollLeft: scrollContainer.scrollLeft,
        itemFrom: from,
        // Linked Edit cells retain a one-pixel left border. Their absolutely
        // positioned contents begin just inside it, so compensate without
        // transforming or scaling the surface.
        originOffset: linked ? -1 : 0,
      })
      // Our own writes are not new geometry.
      observer?.takeRecords()
    }
    const scheduleScrollSync = () => {
      if (scrollFrame !== null) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null
        syncLiveGeometry()
      })
    }
    const syncLiveEvent = () => {
      if (scrollFrame !== null) {
        cancelAnimationFrame(scrollFrame)
        scrollFrame = null
      }
      syncLiveGeometry()
    }

    syncRef.current = syncLiveGeometry
    syncLiveGeometry()
    scrollContainer.addEventListener('scroll', scheduleScrollSync, { passive: true })
    scrollContainer.addEventListener(TIMELINE_LIVE_SCROLL_EVENT, syncLiveEvent)
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => syncLiveGeometry())
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: GEOMETRY_ATTRIBUTES,
      })
    }
    return () => {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
      observer?.disconnect()
      scrollContainer.removeEventListener('scroll', scheduleScrollSync)
      scrollContainer.removeEventListener(TIMELINE_LIVE_SCROLL_EVENT, syncLiveEvent)
      syncRef.current = () => {}
    }
  })

  // Cells write their settled geometry in the same flush as these inputs change;
  // bring them back onto the live axis right after.
  $effect(() => {
    void options().resyncDependencies?.slice()
    untrack(() => syncLivePixelGeometryRef.current())
  })
}
