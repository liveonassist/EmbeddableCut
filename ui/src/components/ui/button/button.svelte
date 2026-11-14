<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import type { VariantProps } from 'class-variance-authority'
  import { cn } from '$lib/cn'
  import { buttonVariants } from '../button-variants'

  type Props = HTMLButtonAttributes &
    VariantProps<typeof buttonVariants> & {
      ref?: HTMLButtonElement | null
      /** Radix's `asChild`: render your own element with the button's props. */
      child?: Snippet<[{ props: Record<string, unknown> }]>
    }

  let { class: className, variant, size, ref = $bindable(null), child, children, ...rest }: Props = $props()
  const classes = $derived(cn(buttonVariants({ variant, size, className: className as string })))
</script>

{#if child}
  {@render child({ props: { class: classes, ...rest } })}
{:else}
  <button bind:this={ref} class={classes} {...rest}>{@render children?.()}</button>
{/if}
