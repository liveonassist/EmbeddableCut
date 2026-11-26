<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { PaneResizer } from 'paneforge'
  import type { ComponentProps } from 'svelte'
  import GripVertical from '@lucide/svelte/icons/grip-vertical'
  import { cn } from '$lib/cn'

  type Props = ComponentProps<typeof PaneResizer> & { withHandle?: boolean }

  let { withHandle, class: className, ...rest }: Props = $props()
</script>

<!-- paneforge marks direction with `data-direction`, where react-resizable-panels has `data-panel-group-direction`. -->
<PaneResizer
  class={cn(
    'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[direction=vertical]:h-px data-[direction=vertical]:w-full data-[direction=vertical]:after:left-0 data-[direction=vertical]:after:h-1 data-[direction=vertical]:after:w-full data-[direction=vertical]:after:-translate-y-1/2 data-[direction=vertical]:after:translate-x-0 [&[data-direction=vertical]>div]:rotate-90',
    className as string,
  )}
  {...rest}
>
  {#if withHandle}
    <div class="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
      <GripVertical class="h-2.5 w-2.5" />
    </div>
  {/if}
</PaneResizer>
