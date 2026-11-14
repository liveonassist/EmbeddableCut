<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: DropdownMenuPrimitive.SeparatorProps = $props()
</script>

<DropdownMenuPrimitive.Separator
  bind:ref
  class={cn('-mx-1 my-1 h-px bg-muted', className)}
  {...rest}
/>
