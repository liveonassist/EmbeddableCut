<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'

  interface FloatingReadoutProps {
    anchor: HTMLElement | null
    children: Snippet
    measureKey?: string
    offsetY?: number
  }

  let { anchor, children, measureKey = '', offsetY = 6 }: FloatingReadoutProps = $props()

  const target = portalTarget()
  let position = $state.raw<{ x: number; y: number } | null>(null)

  function updatePosition() {
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    position = {
      x: rect.left + rect.width / 2,
      y: Math.max(4, rect.top - offsetY),
    }
  }

  $effect(() => {
    void [measureKey, anchor, offsetY]
    return untrack(() => {
      updatePosition()
      const rafId = window.requestAnimationFrame(updatePosition)
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.cancelAnimationFrame(rafId)
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    })
  })
</script>

{#if position}
  <Portal to={target}>
    <div
      class="pointer-events-none fixed z-[10000] -translate-x-1/2 -translate-y-full rounded bg-slate-950/95 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-lg whitespace-nowrap"
      style:left="{position.x}px"
      style:top="{position.y}px"
    >
      {@render children()}
    </div>
  </Portal>
{/if}
