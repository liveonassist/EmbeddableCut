// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

/**
 * Tracks whether a scroll container has vertical overflow.
 * Only updates when overflow state changes (resize/content change),
 * NOT on scroll events.
 */
export function useTrackSectionHasOverflow(
  scroll: () => HTMLDivElement | null | undefined,
  hasTrackSections?: () => boolean,
  paneHeight?: () => number,
  trackCount?: () => number,
  primaryContentHeight?: () => number,
  secondaryContentHeight?: () => number,
): { readonly current: boolean } {
  let hasOverflow = $state(false)

  $effect(() => {
    const element = scroll()
    void [
      hasTrackSections?.(),
      paneHeight?.(),
      trackCount?.(),
      primaryContentHeight?.(),
      secondaryContentHeight?.(),
    ]
    return untrack(() => {
      if (!element) {
        hasOverflow = false
        return
      }

      const checkOverflow = () => {
        hasOverflow = element.scrollHeight > element.clientHeight
      }

      checkOverflow()

      const resizeObserver = new ResizeObserver(checkOverflow)
      resizeObserver.observe(element)

      const contentElement = element.firstElementChild
      if (contentElement instanceof HTMLElement) {
        resizeObserver.observe(contentElement)
      }

      return () => {
        resizeObserver.disconnect()
      }
    })
  })

  return {
    get current() {
      return hasOverflow
    },
  }
}
