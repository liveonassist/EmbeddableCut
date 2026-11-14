<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'

  interface InteractionLockRegionProps {
    locked: boolean
    children: Snippet
    class?: string
    overlayClass?: string
    style?: string
  }

  /**
   * Blocks pointer interaction for a region while leaving the DOM mounted.
   * Used to keep mask editing modal without tearing down editor panels.
   */
  let { locked, children, class: className, overlayClass, style }: InteractionLockRegionProps =
    $props()
</script>

<div
  class={cn('relative min-h-0', className)}
  data-interaction-locked={locked ? 'true' : 'false'}
  {style}
>
  <div class={cn('h-full min-h-0', locked ? 'pointer-events-none select-none opacity-60' : undefined)}>
    {@render children()}
  </div>
  {#if locked}
    <div
      aria-hidden="true"
      class={cn('absolute inset-0 z-10 cursor-not-allowed rounded-[inherit] bg-background/10', overlayClass)}
      title={t('editor.interactionLock.maskEditing')}
    ></div>
  {/if}
</div>
