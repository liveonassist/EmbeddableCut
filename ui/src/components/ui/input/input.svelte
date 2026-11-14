<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'
  import { cn } from '$lib/cn'

  type Props = HTMLInputAttributes & { ref?: HTMLInputElement | null }

  let { ref = $bindable(null), value = $bindable(), class: className, type, ...rest }: Props = $props()
</script>

<input
  bind:this={ref}
  bind:value
  {type}
  class={cn(
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
    className,
  )}
  {...rest}
/>
