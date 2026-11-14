<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { portalTarget } from '$lib/context'

  type Props = DropdownMenuPrimitive.ContentProps & { container?: HTMLElement | null }

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    container,
    ...rest
  }: Props = $props()
  const target = portalTarget()
</script>

<DropdownMenuPrimitive.Portal to={container ?? target}>
  <DropdownMenuPrimitive.Content
    bind:ref
    {sideOffset}
    class={cn(
      'z-50 max-h-[var(--bits-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--bits-dropdown-menu-content-transform-origin]',
      className,
    )}
    {...rest}
  />
</DropdownMenuPrimitive.Portal>
