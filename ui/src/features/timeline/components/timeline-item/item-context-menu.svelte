<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { LazyContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'
  import { captureContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'
  import ItemContextMenuFull from './item-context-menu-full.svelte'
  import type { ItemContextMenuProps } from './item-context-menu'

  /**
   * Context menu for timeline items
   * Provides delete, ripple delete, join, and keyframe clearing operations
   *
   * Uses lazy mounting: the bits-ui ContextMenu tree (and the selection/grade
   * selectors behind it) is only mounted after the user first right-clicks.
   * Before that, children render inside a plain span with a contextmenu
   * listener, so 100+ items carry no menu machinery during drag, playback and
   * scrub, where context menus are never needed.
   */
  let {
    children,
    trackLocked,
    joinActions,
    destructiveActions,
    linkActions,
    keyframeActions,
    layoutActions,
    mediaActions,
    sceneDetectionActions,
    captionActions,
    compositionActions,
  }: ItemContextMenuProps = $props()

  let hasActivated = $state(false)
  let pendingActivation = $state.raw<LazyContextMenuEventInit | null>(null)

  function handleTriggerOnlyContextMenu(e: MouseEvent) {
    if (trackLocked) return
    e.stopPropagation()
    e.preventDefault()
    pendingActivation = captureContextMenuEventInit(e)
    hasActivated = true
  }
</script>

{#if !hasActivated}
  <!-- Lightweight placeholder: just renders children with a contextmenu listener. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span data-item-context-anchor style:display="contents" oncontextmenu={handleTriggerOnlyContextMenu}
    >{@render children()}</span
  >
{:else}
  <ItemContextMenuFull
    {trackLocked}
    {joinActions}
    {destructiveActions}
    {linkActions}
    {keyframeActions}
    {layoutActions}
    {mediaActions}
    {sceneDetectionActions}
    {captionActions}
    {compositionActions}
    {pendingActivation}
    onPendingActivationHandled={() => (pendingActivation = null)}
    {children}
  />
{/if}
