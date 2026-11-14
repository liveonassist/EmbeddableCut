<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  type Props = HTMLAttributes<HTMLDivElement> & { ref?: HTMLDivElement | null }

  let { ref = $bindable(null), class: className, children, ...rest }: Props = $props()
</script>

<div
  bind:this={ref}
  class={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
  {...rest}
>
  {@render children?.()}
</div>
