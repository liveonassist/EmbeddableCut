<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: SelectPrimitive.ScrollDownButtonProps = $props()
</script>

<SelectPrimitive.ScrollDownButton
  bind:ref
  class={cn('flex cursor-default items-center justify-center py-1', className)}
  {...rest}
>
  <ChevronDown class="h-4 w-4" />
</SelectPrimitive.ScrollDownButton>
