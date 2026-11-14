<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { PaneGroup } from 'paneforge'
  import type { ComponentProps } from 'svelte'
  import { cn } from '$lib/cn'

  let { class: className, ...rest }: ComponentProps<typeof PaneGroup> = $props()
</script>

<PaneGroup
  class={cn('flex h-full w-full data-[direction=vertical]:flex-col', className as string)}
  {...rest}
/>
