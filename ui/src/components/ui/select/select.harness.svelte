<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '.'

  let {
    value = $bindable(),
    placeholder,
    onValueChange,
  }: { value?: string; placeholder?: string; onValueChange?: (value: string) => void } = $props()
</script>

<Select bind:value {onValueChange}>
  <SelectTrigger aria-label="Fit">
    <SelectValue {placeholder} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="contain">Fit inside</SelectItem>
    <SelectItem value="cover"><strong>Fill</strong> frame</SelectItem>
  </SelectContent>
</Select>
