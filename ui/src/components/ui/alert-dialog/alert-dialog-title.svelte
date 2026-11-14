<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: AlertDialogPrimitive.TitleProps = $props()
</script>

<AlertDialogPrimitive.Title bind:ref class={cn('text-lg font-semibold', className)} {...rest} />
