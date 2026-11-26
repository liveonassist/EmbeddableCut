<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '$lib/cn'
  import { portalTarget } from '$lib/context'
  import { t } from '$lib/i18n.svelte'
  import DialogOverlay from './dialog-overlay.svelte'

  type Props = DialogPrimitive.ContentProps & {
    hideCloseButton?: boolean
    container?: HTMLElement | null
  }

  let {
    ref = $bindable(null),
    class: className,
    children,
    hideCloseButton,
    container,
    ...rest
  }: Props = $props()
  const target = portalTarget()
</script>

<DialogPrimitive.Portal to={container ?? target}>
  <DialogOverlay />
  <DialogPrimitive.Content
    bind:ref
    class={cn(
      'fixed left-[50%] top-[50%] z-50 grid grid-cols-1 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
      className,
    )}
    {...rest}
  >
    {@render children?.()}
    {#if !hideCloseButton}
      <DialogPrimitive.Close
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X class="h-4 w-4" />
        <span class="sr-only">{t('common.close')}</span>
      </DialogPrimitive.Close>
    {/if}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
