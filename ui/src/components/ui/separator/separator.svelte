<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Separator as SeparatorPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    orientation = 'horizontal',
    decorative = true,
    ...rest
  }: SeparatorPrimitive.RootProps = $props()
</script>

<SeparatorPrimitive.Root
  bind:ref
  {decorative}
  {orientation}
  class={cn(
    'shrink-0 bg-border',
    orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
    className,
  )}
  {...rest}
/>
