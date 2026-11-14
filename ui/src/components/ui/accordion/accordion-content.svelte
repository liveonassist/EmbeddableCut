<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Accordion as AccordionPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...rest
  }: AccordionPrimitive.ContentProps = $props()
</script>

<AccordionPrimitive.Content
  bind:ref
  class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
  {...rest}
>
  <div class={cn('pb-4 pt-0', className)}>{@render children?.()}</div>
</AccordionPrimitive.Content>
