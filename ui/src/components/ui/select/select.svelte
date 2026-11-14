<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Select as SelectPrimitive } from 'bits-ui'
  import { SelectState, setSelectState } from './context'

  /** Radix's single-value Select: `value`/`defaultValue`/`onValueChange`, `open`/`onOpenChange`. */
  type Props = Omit<
    SelectPrimitive.RootProps,
    'type' | 'value' | 'onValueChange' | 'open' | 'children'
  > & {
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    open?: boolean
    defaultOpen?: boolean
    children?: Snippet
  }

  let {
    value = $bindable(),
    defaultValue,
    onValueChange,
    open = $bindable(),
    defaultOpen = false,
    children,
    ...rest
  }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (value === undefined) value = defaultValue
  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen

  setSelectState(
    new SelectState(
      () => value ?? '',
      () => open ?? false,
    ),
  )
</script>

<SelectPrimitive.Root
  type="single"
  bind:value={() => value ?? '', (next) => (value = next)}
  bind:open={() => open ?? false, (next) => (open = next)}
  {onValueChange}
  {...rest}
>
  {@render children?.()}
</SelectPrimitive.Root>
