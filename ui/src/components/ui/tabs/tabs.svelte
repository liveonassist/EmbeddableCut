<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui'

  type Props = TabsPrimitive.RootProps & { defaultValue?: string }

  let { ref = $bindable(null), value = $bindable(), defaultValue, ...rest }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (value === undefined) value = defaultValue
</script>

<TabsPrimitive.Root
  bind:ref
  bind:value={() => value ?? '', (next) => (value = next)}
  {...rest}
/>
