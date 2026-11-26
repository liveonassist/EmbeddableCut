<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import Check from '@lucide/svelte/icons/check'
  import { cn } from '$lib/cn'

  // Radix renders `children` after an ItemIndicator; bits-ui hands `checked` to a snippet instead.
  type Props = Omit<DropdownMenuPrimitive.CheckboxItemProps, 'children'> & { children?: Snippet }

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    class: className,
    children: content,
    ...rest
  }: Props = $props()
</script>

<DropdownMenuPrimitive.CheckboxItem
  bind:ref
  bind:checked
  class={cn(
    'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className,
  )}
  {...rest}
>
  {#snippet children({ checked })}
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {#if checked}
        <Check class="h-4 w-4" />
      {/if}
    </span>{@render content?.()}
  {/snippet}
</DropdownMenuPrimitive.CheckboxItem>
