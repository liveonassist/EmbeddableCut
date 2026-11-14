<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Label as LabelPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let { ref = $bindable(null), class: className, ...rest }: LabelPrimitive.RootProps = $props()
</script>

<LabelPrimitive.Root
  bind:ref
  class={cn(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    className,
  )}
  {...rest}
/>
