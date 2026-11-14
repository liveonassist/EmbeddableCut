<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  interface NumberFieldProps {
    label: string
    value: number
    suffix: string
    disabled?: boolean
    onCommit: (value: number) => void
  }

  let { label, value, suffix, disabled, onCommit }: NumberFieldProps = $props()

  // svelte-ignore state_referenced_locally
  let draft = $state(value.toFixed(1))
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    const next = value.toFixed(1)
    const activeElement = input
      ? (input.getRootNode() as Document | ShadowRoot).activeElement
      : document.activeElement
    if (activeElement !== input) draft = next
  })

  const commit = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onCommit(parsed)
    else draft = value.toFixed(1)
  }
</script>

<label
  class="flex h-6 min-w-[122px] items-center rounded border border-border/60 bg-background/80 px-1.5 text-[9px]"
>
  <span class="mr-1 shrink-0 text-muted-foreground">{label}</span>
  <input
    bind:this={input}
    aria-label={label}
    class="min-w-0 flex-1 bg-transparent text-right font-mono text-[10px] tabular-nums outline-none disabled:opacity-40"
    {disabled}
    inputmode="decimal"
    value={draft}
    oninput={(event) => {
      draft = event.currentTarget.value
    }}
    onblur={commit}
    onkeydown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') {
        draft = value.toFixed(1)
        event.currentTarget.blur()
      }
    }}
  />
  <span class="ml-0.5 shrink-0 text-muted-foreground">{suffix}</span>
</label>
