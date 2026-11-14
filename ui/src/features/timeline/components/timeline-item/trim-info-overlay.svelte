<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'

  interface TrimInfoOverlayProps {
    anchor: HTMLDivElement | null
    side: 'start' | 'end'
    delta: string
    duration: string
    measureKey: string
  }

  /**
   * Floating timecode readout shown above a clip edge during a trim gesture.
   *
   * Rendered into the editor's portal layer so it escapes the clip's `contain: paint`
   * box and is positioned against the live `getBoundingClientRect()` of `anchor`.
   * `measureKey` forces a reposition whenever the anchored geometry changes.
   */
  let { anchor, side, delta, duration, measureKey }: TrimInfoOverlayProps = $props()

  const target = portalTarget()
  let position = $state.raw<{ x: number; y: number } | null>(null)

  function updatePosition() {
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const x = side === 'start' ? rect.left : rect.right
    position = {
      x,
      y: Math.max(4, rect.top - 6),
    }
  }

  $effect(() => {
    void [measureKey, anchor, side]
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
      class="pointer-events-none fixed z-[10000] min-w-[58px] rounded-sm bg-neutral-950/90 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-tight text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-white/15 tabular-nums"
      style:left="{position.x}px"
      style:top="{position.y}px"
      style:transform={side === 'start'
        ? 'translate(-2px, -100%)'
        : 'translate(calc(-100% + 2px), -100%)'}
    >
      <div>{delta}</div>
      <div class="text-white/80">{duration}</div>
    </div>
  </Portal>
{/if}
