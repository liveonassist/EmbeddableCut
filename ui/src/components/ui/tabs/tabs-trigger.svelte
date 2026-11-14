<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let { ref = $bindable(null), class: className, ...rest }: TabsPrimitive.TriggerProps = $props()
</script>

<TabsPrimitive.Trigger
  bind:ref
  class={cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-[transform,color,background-color,box-shadow] duration-150 ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
    className,
  )}
  {...rest}
/>
