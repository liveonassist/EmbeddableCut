<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from 'bits-ui'

  type Props = CollapsiblePrimitive.RootProps & { defaultOpen?: boolean }

  let { ref = $bindable(null), open = $bindable(), defaultOpen = false, ...rest }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<CollapsiblePrimitive.Root bind:ref bind:open {...rest} />
