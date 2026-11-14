<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  type Props = HTMLAttributes<HTMLSpanElement> & { ref?: HTMLSpanElement | null }

  let { ref = $bindable(null), class: className, children, ...rest }: Props = $props()
</script>

<span
  bind:this={ref}
  class={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
  {...rest}
>
  {@render children?.()}
</span>
