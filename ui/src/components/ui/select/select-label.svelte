<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { isCollecting } from './context'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: SelectPrimitive.GroupHeadingProps = $props()
  const collecting = isCollecting()
</script>

{#if !collecting}
  <SelectPrimitive.GroupHeading
    bind:ref
    class={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...rest}
  />
{/if}
