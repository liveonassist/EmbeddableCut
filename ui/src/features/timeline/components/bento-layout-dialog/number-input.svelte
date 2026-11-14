<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'

  interface Props {
    label: string
    value: number
    onChange: (v: number) => void
    min: number
    max: number
  }

  let { label, value, onChange, min, max }: Props = $props()

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const next = Math.max(min, Math.min(max, Number(target.value) || 0))
    onChange(next)
    // FreeCut's input is controlled: React snaps the field back to the clamped value.
    if (target.value === '' || Number(target.value) !== next) {
      target.value = String(next)
    }
  }
</script>

<div class="flex items-center gap-1.5">
  <span class="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
  <Input
    type="number"
    {min}
    {max}
    {value}
    oninput={handleInput}
    class="w-16 h-7 text-xs px-2"
  />
</div>
