<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from 'bits-ui'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { cn } from '$lib/cn'

  type Props = ContextMenuPrimitive.SubTriggerProps & { inset?: boolean }

  let { ref = $bindable(null), class: className, inset, children, ...rest }: Props = $props()
</script>

<ContextMenuPrimitive.SubTrigger
  bind:ref
  class={cn(
    'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    inset && 'pl-8',
    className,
  )}
  {...rest}
>
  {@render children?.()}
  <ChevronRight class="ml-auto" />
</ContextMenuPrimitive.SubTrigger>
