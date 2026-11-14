<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import { isCollecting } from './context'

  let { ref = $bindable(null), children, ...rest }: SelectPrimitive.GroupProps = $props()
  const collecting = isCollecting()
</script>

{#if collecting}
  {@render children?.()}
{:else}
  <SelectPrimitive.Group bind:ref {children} {...rest} />
{/if}
