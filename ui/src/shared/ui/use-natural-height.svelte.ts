// SPDX-License-Identifier: MIT

/**
 * Observe an element's natural (content) height while `enabled`, via a
 * ResizeObserver. Used to drive height-morph animations (settings/shortcut
 * dialogs) from the active content's size.
 *
 * The observed element is expected to live inside a scroll viewport or an
 * `overflow-hidden` animated wrapper, so its `clientHeight` stays the true
 * content height even when the wrapper around it is clamped or scrolling —
 * there's no measurement feedback loop.
 *
 * Call it while a component initializes; `node` and `enabled` are read
 * reactively, so pass the element bound with `bind:this` to a `$state`.
 */
export function useNaturalHeight(
  node: () => HTMLElement | null | undefined,
  enabled: () => boolean = () => true,
): { readonly current: number } {
  let height = $state(0)
  $effect(() => {
    if (!enabled()) return
    const element = node()
    if (!element) return
    const update = () => {
      height = element.clientHeight
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  })
  return {
    get current() {
      return height
    },
  }
}
