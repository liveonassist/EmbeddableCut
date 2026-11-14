<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { buttonVariants } from '../button-variants'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: AlertDialogPrimitive.CancelProps = $props()
</script>

<AlertDialogPrimitive.Cancel
  bind:ref
  class={cn(buttonVariants({ variant: 'outline' }), 'mt-2 sm:mt-0', className)}
  {...rest}
/>
