<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" generics="C extends object">
  import type { Renderable } from '../extensions/contributions'

  /** Renders a contributed piece: a Svelte component, or the host's own `render` into a container. */
  let { content, context, class: className = '' }: { content: Renderable<C>; context: C; class?: string } =
    $props()

  let container: HTMLElement | undefined = $state()

  $effect(() => {
    if (!container || !('render' in content)) return
    const teardown = content.render(container, context)
    return () => teardown?.()
  })
</script>

{#if 'render' in content}
  <div bind:this={container} class={className}></div>
{:else}
  {@const Piece = content}
  <Piece {context} />
{/if}
