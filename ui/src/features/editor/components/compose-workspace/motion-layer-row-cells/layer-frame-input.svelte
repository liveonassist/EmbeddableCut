<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  interface LayerFrameInputProps {
    label: string
    ariaLabel: string
    value: number
    min: number
    max: number
    onCommit: (value: number) => void
    disabled?: boolean
  }

  let { label, ariaLabel, value, min, max, onCommit, disabled = false }: LayerFrameInputProps =
    $props()
</script>

<label class="flex items-center gap-0.5 text-[8px] text-muted-foreground" title={ariaLabel}>
  <span class="sr-only">{label}</span>
  <!-- Uncontrolled while editing; a new committed value resets it. -->
  {#key value}
    <input
      type="number"
      autocomplete="off"
      data-bwignore="true"
      {value}
      {min}
      {max}
      {disabled}
      onblur={(event) => {
        const parsed = Number(event.currentTarget.value)
        if (!Number.isFinite(parsed)) return
        const next = Math.max(min, Math.min(max, Math.round(parsed)))
        event.currentTarget.value = String(next)
        if (next !== value) onCommit(next)
      }}
      onkeydown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      class="h-5 w-14 rounded border border-input bg-background px-1.5 text-[9px] tabular-nums text-muted-foreground outline-none focus:border-primary/60"
      aria-label={ariaLabel}
    />
  {/key}
</label>
