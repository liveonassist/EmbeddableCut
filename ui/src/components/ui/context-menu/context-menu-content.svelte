<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { portalTarget } from '$lib/context'

  type Props = ContextMenuPrimitive.ContentProps & { container?: HTMLElement | null }

  let { ref = $bindable(null), class: className, container, ...rest }: Props = $props()
  const target = portalTarget()
</script>

<ContextMenuPrimitive.Portal to={container ?? target}>
  <ContextMenuPrimitive.Content
    bind:ref
    class={cn(
      'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...rest}
  />
</ContextMenuPrimitive.Portal>
