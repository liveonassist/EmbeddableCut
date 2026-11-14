<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { portalTarget } from '$lib/context'
  import AlertDialogOverlay from './alert-dialog-overlay.svelte'

  type Props = AlertDialogPrimitive.ContentProps & { container?: HTMLElement | null }

  let { ref = $bindable(null), class: className, container, ...rest }: Props = $props()
  const target = portalTarget()
</script>

<AlertDialogPrimitive.Portal to={container ?? target}>
  <AlertDialogOverlay />
  <AlertDialogPrimitive.Content
    bind:ref
    class={cn(
      'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
      className,
    )}
    {...rest}
  />
</AlertDialogPrimitive.Portal>
