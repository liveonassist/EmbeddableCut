<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  type Props = Omit<ScrollAreaPrimitive.ScrollbarProps, 'orientation'> & {
    orientation?: ScrollAreaPrimitive.ScrollbarProps['orientation']
  }

  let {
    ref = $bindable(null),
    class: className,
    orientation = 'vertical',
    ...rest
  }: Props = $props()
</script>

<ScrollAreaPrimitive.Scrollbar
  bind:ref
  {orientation}
  class={cn(
    'flex touch-none select-none transition-colors',
    orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
    orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
    className,
  )}
  {...rest}
>
  <ScrollAreaPrimitive.Thumb class="relative flex-1 rounded-full bg-border" />
</ScrollAreaPrimitive.Scrollbar>
