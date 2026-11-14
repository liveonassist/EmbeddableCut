<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Slider } from '@/components/ui/slider'
  import { clampNumber } from './silence-removal-dialog-model'

  interface Props {
    id: string
    label: string
    value: number
    min: number
    max: number
    step: number
    suffix: string
    onChange: (value: number) => void
  }

  let { id, label, value, min, max, step, suffix, onChange }: Props = $props()

  function commitValue(nextValue: number) {
    onChange(clampNumber(nextValue, min, max))
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between gap-3">
    <Label for={id} class="text-xs font-medium">
      {label}
    </Label>
    <div class="flex items-center gap-1">
      <Input
        {id}
        type="number"
        {value}
        {min}
        {max}
        {step}
        oninput={(event) => commitValue(Number(event.currentTarget.value))}
        class="h-7 w-16 px-2 text-right text-xs"
      />
      <span class="w-7 text-xs text-muted-foreground">{suffix}</span>
    </div>
  </div>
  <Slider
    value={[value]}
    {min}
    {max}
    {step}
    onValueChange={([nextValue]) => {
      if (nextValue !== undefined) commitValue(nextValue)
    }}
  />
</div>
