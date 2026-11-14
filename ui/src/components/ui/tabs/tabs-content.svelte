<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let { ref = $bindable(null), class: className, ...rest }: TabsPrimitive.ContentProps = $props()
</script>

<TabsPrimitive.Content
  bind:ref
  class={cn(
    'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  )}
  {...rest}
/>
