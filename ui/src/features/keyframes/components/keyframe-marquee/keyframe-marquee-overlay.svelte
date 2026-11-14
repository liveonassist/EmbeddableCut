<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { KEYFRAME_MARQUEE_CLASSNAME, type KeyframeMarqueeRect } from './types'

  interface KeyframeMarqueeOverlayProps {
    rect: KeyframeMarqueeRect | null
    /** Keep the node mounted so pointer hot paths can update it without re-rendering. */
    persistent?: boolean
    class?: string
    style?: string
    ref?: HTMLDivElement | null
  }

  let {
    rect,
    persistent = false,
    class: className,
    style,
    ref = $bindable(null),
  }: KeyframeMarqueeOverlayProps = $props()
</script>

{#if rect || persistent}
  <div
    bind:this={ref}
    aria-hidden="true"
    hidden={!rect}
    class={cn(KEYFRAME_MARQUEE_CLASSNAME, 'left-0 top-0 will-change-transform', className)}
    {style}
    style:transform={rect ? `translate3d(${rect.x}px, ${rect.y}px, 0)` : undefined}
    style:width="{rect?.width ?? 0}px"
    style:height="{rect?.height ?? 0}px"
  ></div>
{/if}
