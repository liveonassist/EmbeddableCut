<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Dopesheet row culler.
   * Unmounts a row's timeline cell while it is scrolled well out of view.
   */
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  let root = $state<HTMLDivElement | null>(null)
  let isNearViewport = $state(true)

  $effect(() => {
    const node = root
    if (!node || typeof IntersectionObserver === 'undefined') return
    // Classic Edit has its own scroller. Observing against the browser viewport
    // can report every row as hidden while the panel is opening and stay stale.
    const scrollRoot =
      node.closest('[data-dopesheet-scroll-viewport]') ??
      node.closest('[data-testid="motion-layer-scroll-area"]')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (!entry.isIntersecting && node.contains(document.activeElement)) return
        isNearViewport = entry.isIntersecting
      },
      {
        root: scrollRoot,
        rootMargin: '96px 0px',
      },
    )
    observer.observe(node)
    return () => observer.disconnect()
  })
</script>

<div bind:this={root} class="min-w-0 overflow-hidden">
  {#if isNearViewport}
    {@render children()}
  {/if}
</div>
