<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Switch as SwitchPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  type Props = SwitchPrimitive.RootProps & { defaultChecked?: boolean }

  let {
    ref = $bindable(null),
    checked = $bindable(),
    defaultChecked = false,
    class: className,
    ...rest
  }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (checked === undefined) checked = defaultChecked
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked={() => checked ?? false, (next) => (checked = next)}
  class={cn(
    'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
    className,
  )}
  {...rest}
>
  <SwitchPrimitive.Thumb
    class={cn(
      'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
    )}
  />
</SwitchPrimitive.Root>
