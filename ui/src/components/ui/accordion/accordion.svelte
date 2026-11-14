<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Accordion as AccordionPrimitive } from 'bits-ui'

  /**
   * Radix's `defaultValue` and `collapsible` carry over. A single bits-ui
   * accordion always collapses its open item on a second click, so
   * `collapsible` is accepted and dropped.
   */
  type Props = AccordionPrimitive.RootProps & {
    defaultValue?: string | string[]
    collapsible?: boolean
  }

  let {
    ref = $bindable(null),
    value = $bindable(),
    defaultValue,
    collapsible: _collapsible,
    ...rest
  }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (value === undefined && defaultValue !== undefined) value = defaultValue
</script>

<AccordionPrimitive.Root bind:ref bind:value={value as never} {...rest as AccordionPrimitive.RootProps} />
