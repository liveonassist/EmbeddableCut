<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements'
  import { buildHref, findRouter } from './router.svelte'
  import type { RouteParams } from './types'

  type Props = Omit<HTMLAnchorAttributes, 'href'> & {
    to: string
    params?: RouteParams
    search?: string
    hash?: string
    replace?: boolean
    ref?: HTMLAnchorElement | null
  }

  /**
   * TanStack's `Link`: an anchor whose plain left clicks navigate in place.
   * Outside a router it is a plain link.
   */
  let {
    to,
    params,
    search,
    hash,
    replace = false,
    ref = $bindable(null),
    onclick,
    children,
    ...rest
  }: Props = $props()

  const router = findRouter()
  const href = $derived(buildHref({ to, params, search, hash }))

  function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLAnchorElement }) {
    onclick?.(event)
    if (!router || event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
    const target = event.currentTarget.target
    if (target && target !== '_self') return
    event.preventDefault()
    void router.navigate({ to, params, search, hash, replace })
  }
</script>

<a bind:this={ref} {href} onclick={handleClick} {...rest}>{@render children?.()}</a>
