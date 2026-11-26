<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Select as SelectPrimitive } from 'bits-ui'
  import Check from '@lucide/svelte/icons/check'
  import { cn } from '$lib/cn'
  import { getSelectState, isCollecting } from './context'

  type Props = Omit<SelectPrimitive.ItemProps, 'children'> & { children?: Snippet }

  let { ref = $bindable(null), class: className, children: content, value, ...rest }: Props = $props()

  const select = getSelectState()
  const collecting = isCollecting()

  $effect.pre(() => select?.register(value, content))
</script>

{#if !collecting}
  <!--
    bits-ui highlights select items with `data-highlighted` instead of moving
    focus, so Radix's `focus:` accent classes are matched on it as well.
  -->
  <SelectPrimitive.Item
    bind:ref
    {value}
    class={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...rest}
  >
    {#snippet children({ selected })}
      <span class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        {#if selected}
          <Check class="h-4 w-4" />
        {/if}
      </span>
      <span>{@render content?.()}</span>
    {/snippet}
  </SelectPrimitive.Item>
{/if}
