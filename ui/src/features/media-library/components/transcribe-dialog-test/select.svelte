<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: Snippet
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
  } = $props()
</script>

<select
  aria-label="Select"
  {disabled}
  {value}
  onchange={(event) => onValueChange(event.currentTarget.value)}
>
  {@render children()}
</select>
