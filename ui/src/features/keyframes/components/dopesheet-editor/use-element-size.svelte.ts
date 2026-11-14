// SPDX-License-Identifier: MIT

export interface ElementSize {
  width: number
  height: number
}

/**
 * Observes an element's client size via ResizeObserver, returning the latest
 * dimensions. Re-runs when the element or `enabled` changes, or when extra
 * dependencies (read inside the effect) change.
 *
 * While the element is unmounted the size falls back to
 * `{ width: 0, height: 0 }` so callers don't need to guard against undefined.
 */
export function useElementSize(
  element: () => HTMLElement | null | undefined,
  options: () => { enabled?: boolean; deps?: ReadonlyArray<unknown> } = () => ({}),
): ElementSize {
  let size = $state.raw<ElementSize>({ width: 0, height: 0 })

  $effect(() => {
    const { enabled = true, deps = [] } = options()
    // Extra dependencies only re-run the observer, as React's dependency list did.
    void [...deps]
    if (!enabled) return
    const node = element()
    if (!node) return

    const update = () => {
      size = { width: node.clientWidth, height: node.clientHeight }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  })

  return {
    get width() {
      return size.width
    },
    get height() {
      return size.height
    },
  }
}
