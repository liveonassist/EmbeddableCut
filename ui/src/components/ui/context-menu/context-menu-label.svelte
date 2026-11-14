<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  // Radix's menu Label is a plain <div>; bits-ui's GroupHeading needs a Group around it.
  type Props = HTMLAttributes<HTMLDivElement> & { ref?: HTMLDivElement | null; inset?: boolean }

  let { ref = $bindable(null), class: className, inset, children, ...rest }: Props = $props()
</script>

<div
  bind:this={ref}
  class={cn(
    'px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
    inset && 'pl-8',
    className,
  )}
  {...rest}
>
  {@render children?.()}
</div>
