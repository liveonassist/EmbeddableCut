<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let {
    id,
    value,
    onValueChange,
    disabled,
  }: {
    id?: string
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
  } = $props()
</script>

<input
  {id}
  aria-label="Language"
  {disabled}
  {value}
  oninput={(event) => onValueChange(event.currentTarget.value)}
/>
