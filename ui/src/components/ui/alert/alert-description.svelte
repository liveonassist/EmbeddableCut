<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  type Props = HTMLAttributes<HTMLDivElement> & { ref?: HTMLDivElement | null }

  let { ref = $bindable(null), class: className, children, ...rest }: Props = $props()
</script>

<div bind:this={ref} class={cn('text-sm [&_p]:leading-relaxed', className)} {...rest}>
  {@render children?.()}
</div>
