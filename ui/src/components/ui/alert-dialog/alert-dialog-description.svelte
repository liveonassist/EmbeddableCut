<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: AlertDialogPrimitive.DescriptionProps = $props()
</script>

<AlertDialogPrimitive.Description
  bind:ref
  class={cn('text-sm text-muted-foreground', className)}
  {...rest}
/>
