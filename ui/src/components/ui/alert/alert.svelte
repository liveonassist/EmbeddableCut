<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { cva, type VariantProps } from 'class-variance-authority'

  const alertVariants = cva(
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
    {
      variants: {
        variant: {
          default: 'bg-background text-foreground',
          destructive:
            'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        },
      },
      defaultVariants: {
        variant: 'default',
      },
    },
  )
</script>

<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  type Props = HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & { ref?: HTMLDivElement | null }

  let { ref = $bindable(null), class: className, variant, children, ...rest }: Props = $props()
</script>

<div bind:this={ref} role="alert" class={cn(alertVariants({ variant }), className)} {...rest}>
  {@render children?.()}
</div>
