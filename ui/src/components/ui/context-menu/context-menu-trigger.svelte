<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from 'bits-ui'

  let {
    ref = $bindable(null),
    child: ownChild,
    children,
    ...rest
  }: ContextMenuPrimitive.TriggerProps = $props()
</script>

<!-- Radix renders the trigger as a <span>, bits-ui as a <div>: keep Radix's markup. -->
<ContextMenuPrimitive.Trigger bind:ref {...rest}>
  {#snippet child({ props })}
    {#if ownChild}
      {@render ownChild({ props })}
    {:else}
      <span {...props}>{@render children?.()}</span>
    {/if}
  {/snippet}
</ContextMenuPrimitive.Trigger>
