<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Toaster as Sonner } from 'svelte-sonner'
  import type { ComponentProps } from 'svelte'

  // svelte-sonner names Radix-sonner's `toastOptions.classNames` `classes`, and `className` `class`.
  let { ...rest }: ComponentProps<typeof Sonner> = $props()
</script>

<Sonner
  theme="dark"
  class="toaster group"
  position="bottom-right"
  closeButton
  richColors
  toastOptions={{
    classes: {
      toast:
        'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
      description: 'group-[.toast]:text-muted-foreground',
      actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
      cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
    },
  }}
  {...rest}
/>
