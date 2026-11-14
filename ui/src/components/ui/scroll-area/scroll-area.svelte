<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import ScrollBar from './scroll-bar.svelte'

  type Props = ScrollAreaPrimitive.RootProps & {
    /** The scrolling element, which Radix's `ref` doesn't reach. */
    viewportRef?: HTMLElement | null
  }

  let {
    ref = $bindable(null),
    viewportRef = $bindable(null),
    class: className,
    children,
    ...rest
  }: Props = $props()
</script>

<ScrollAreaPrimitive.Root bind:ref class={cn('relative overflow-hidden', className)} {...rest}>
  <ScrollAreaPrimitive.Viewport bind:ref={viewportRef} class="h-full w-full rounded-[inherit]">
    {@render children?.()}
  </ScrollAreaPrimitive.Viewport>
  <ScrollBar />
  <ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
