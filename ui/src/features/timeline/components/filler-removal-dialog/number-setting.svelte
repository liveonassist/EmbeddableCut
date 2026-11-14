<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { clampNumber } from './filler-removal-dialog-model'

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

  // svelte-ignore state_referenced_locally
  let draftValue = $state(String(value))
  let skipNextBlur = false

  $effect(() => {
    draftValue = String(value)
  })

  function commit() {
    if (skipNextBlur) {
      skipNextBlur = false
      return
    }
    const parsed = Number(draftValue)
    const nextValue = clampNumber(parsed, min, max)
    draftValue = String(nextValue)
    if (nextValue !== value) {
      onChange(nextValue)
    }
  }
</script>

<div class="flex items-center justify-between gap-3">
  <Label for={id} class="text-xs font-medium">
    {label}
  </Label>
  <div class="flex items-center gap-1">
    <Input
      {id}
      type="number"
      value={draftValue}
      {min}
      {max}
      {step}
      oninput={(event) => (draftValue = event.currentTarget.value)}
      onblur={commit}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
          return
        }
        if (event.key === 'Escape') {
          skipNextBlur = true
          draftValue = String(value)
          event.currentTarget.blur()
        }
      }}
      class="h-7 w-20 px-2 text-right text-xs"
    />
    <span class="w-7 text-xs text-muted-foreground">{suffix}</span>
  </div>
</div>
