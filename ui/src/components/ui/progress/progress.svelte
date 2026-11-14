<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Progress as ProgressPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let { ref = $bindable(null), class: className, value, ...rest }: ProgressPrimitive.RootProps = $props()
</script>

<ProgressPrimitive.Root
  bind:ref
  {value}
  class={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)}
  {...rest}
>
  <!-- bits-ui's Progress has no Indicator part; this is Radix's. -->
  <div
    class="h-full w-full flex-1 bg-primary transition-all"
    style:transform="translateX(-{100 - (value || 0)}%)"
  ></div>
</ProgressPrimitive.Root>
