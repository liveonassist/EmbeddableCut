<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Accordion as AccordionPrimitive } from 'bits-ui'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...rest
  }: AccordionPrimitive.TriggerProps = $props()
</script>

<!-- Radix renders the header as an <h3>; bits-ui as a level-3 role="heading". -->
<AccordionPrimitive.Header level={3} class="flex">
  <AccordionPrimitive.Trigger
    bind:ref
    class={cn(
      'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-colors hover:underline text-left [&[data-state=open]>svg]:rotate-180',
      className,
    )}
    {...rest}
  >
    {@render children?.()}
    <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
  </AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>
