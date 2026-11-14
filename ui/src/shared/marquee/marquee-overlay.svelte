<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import {
    getMarqueeRect,
    type MarqueeController,
    type MarqueeState,
  } from '@/shared/marquee/use-marquee-selection.svelte'

  interface MarqueeOverlayProps {
    /** Subscription-based controller returned from `useMarqueeSelection` */
    marquee: MarqueeController

    /** Custom class for styling */
    class?: string
  }

  /**
   * Visual overlay for marquee selection rectangle
   *
   * Renders a draggable selection box that appears when the user
   * click-drags to select multiple items. Subscribes directly to the
   * marquee controller so only this component updates per pointer move —
   * the tree above stays quiet.
   */
  let { marquee, class: className }: MarqueeOverlayProps = $props()

  let snapshot = $state.raw<MarqueeState>(untrack(() => marquee.getSnapshot()))
  $effect.pre(() => {
    const controller = marquee
    snapshot = controller.getSnapshot()
    return controller.subscribe(() => {
      snapshot = controller.getSnapshot()
    })
  })

  const rect = $derived(getMarqueeRect(snapshot.startX, snapshot.startY, snapshot.currentX, snapshot.currentY))
</script>

{#if snapshot.active}
  <div
    class="
        absolute pointer-events-none z-50
        border-2 border-dashed border-primary bg-primary/10
        {className || ''}
      "
    style:left="{rect.left}px"
    style:top="{rect.top}px"
    style:width="{rect.width}px"
    style:height="{rect.height}px"
  ></div>
{/if}
