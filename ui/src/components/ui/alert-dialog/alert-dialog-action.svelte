<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { buttonVariants } from '../button-variants'

  let {
    ref = $bindable(null),
    class: className,
    ...rest
  }: AlertDialogPrimitive.ActionProps = $props()
</script>

<!--
  Radix's Action closes the dialog after its onClick (unless it prevents the
  default); bits-ui's doesn't, so this renders a Close instead.
-->
<DialogPrimitive.Close bind:ref class={cn(buttonVariants(), className as string)} {...rest} />
