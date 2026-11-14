<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'
  import { portalTarget } from '$lib/context'
  import { getSelectState } from './context'
  import SelectCollector from './select-collector.svelte'
  import SelectScrollUpButton from './select-scroll-up-button.svelte'
  import SelectScrollDownButton from './select-scroll-down-button.svelte'

  /**
   * bits-ui positions select content like Radix's `position="popper"`, the
   * kit's default; Radix's `item-aligned` has no bits-ui counterpart.
   */
  type Props = SelectPrimitive.ContentProps & {
    position?: 'popper'
    container?: HTMLElement | null
  }

  let {
    ref = $bindable(null),
    class: className,
    children,
    position = 'popper',
    container,
    ...rest
  }: Props = $props()
  const target = portalTarget()
  const select = getSelectState()
</script>

{#if select && !select.open}
  <SelectCollector>{@render children?.()}</SelectCollector>
{/if}
<SelectPrimitive.Portal to={container ?? target}>
  <SelectPrimitive.Content
    bind:ref
    class={cn(
      'relative z-50 max-h-[--bits-select-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--bits-select-content-transform-origin]',
      position === 'popper' &&
        'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
      className,
    )}
    {...rest}
  >
    <SelectScrollUpButton />
    <SelectPrimitive.Viewport
      class={cn(
        'p-1',
        position === 'popper' &&
          'h-[var(--bits-select-anchor-height)] w-full min-w-[var(--bits-select-anchor-width)]',
      )}
    >
      {@render children?.()}
    </SelectPrimitive.Viewport>
    <SelectScrollDownButton />
  </SelectPrimitive.Content>
</SelectPrimitive.Portal>
