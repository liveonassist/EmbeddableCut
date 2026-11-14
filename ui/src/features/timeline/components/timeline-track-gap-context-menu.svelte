<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import { replayContextMenuEvent } from '@/features/timeline/utils/lazy-context-menu'
  import type { TrackGapContextMenuRequest } from './timeline-track-types'

  /**
   * Lightweight on-demand context menu for track gaps.
   * Only mounts the ContextMenu tree when the user actually right-clicks a gap,
   * avoiding the per-frame Popper/Menu provider cascade during drag operations.
   */
  interface Props {
    request: TrackGapContextMenuRequest
    onCloseGap: () => void
    onDismiss: () => void
  }

  let { request, onCloseGap, onDismiss }: Props = $props()

  let trigger = $state<HTMLSpanElement | null>(null)

  $effect(() => {
    void [request, trigger]
    untrack(() => {
      if (!trigger) {
        return
      }

      replayContextMenuEvent(trigger, request.pointer)
    })
  })
</script>

<ContextMenu
  onOpenChange={(open) => {
    if (!open) onDismiss()
  }}
>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      <span
        {...props}
        bind:this={trigger}
        aria-hidden="true"
        style:position="fixed"
        style:left="{request.pointer.clientX}px"
        style:top="{request.pointer.clientY}px"
        style:width="0px"
        style:height="0px"
        style:pointer-events="none"
      ></span>
    {/snippet}
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onclick={onCloseGap}>
      {t('timeline.contextMenu.rippleDelete')}
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
